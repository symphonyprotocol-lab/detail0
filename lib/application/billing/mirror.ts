/**
 * Use case: write what the Payment Provider reported into the console's mirror.
 *
 * This is steps 2 and 5 of architecture.md 11.3 -- record the verified event
 * once, project it onto the document it describes -- and nothing else. It does
 * not charge, refund, retry or reissue: recall0 never moves money
 * (requirement.md 4.3), so the only thing this side of the boundary does with a
 * payment is find out about it.
 *
 * Nothing calls this yet, and that is not an oversight: the webhook Route
 * Handler is the caller, and it cannot be written until a provider is chosen --
 * `paymentAdapter().verifyWebhook` is still unimplemented, and a handler that
 * cannot verify a signature is a handler that must not exist. What can be
 * settled before that choice is what the mirror accepts and how it behaves
 * under retry and reordering, which is what this is.
 *
 * It also deliberately does not touch `subscription`. Mapping a provider's
 * subscription lifecycle onto ours (step 3) needs the provider's price
 * identifiers resolved to a Plan Version (step 4), and doing half of that here
 * -- flipping a status without re-resolving the version -- would leave a
 * workspace billing against a row nobody chose. That belongs with the webhook
 * handler and its adapter, which is where the provider is finally named.
 */
import { and, eq, lte } from 'drizzle-orm';
import { uuidv7 } from '@/lib/domain/id';
import { parseProviderDocument, type ProviderDocumentInput } from '@/lib/domain/billing';
import { db, schema } from '@/lib/infrastructure/postgres/client';

export interface MirrorProviderDocumentInput extends ProviderDocumentInput {
  /** Whose document this is. Resolved by the caller from the provider customer. */
  workspaceId: string;
  subscriptionId?: string | null;
  addonGrantId?: string | null;
  /** The immutable version the order was priced against. requirement.md 4.3 */
  planVersionId?: string | null;
  /**
   * The verified event carrying this state.
   *
   * Optional because a backfill reconciling against the provider's API has no
   * event to point at, and refusing to mirror without one would mean the only
   * way to repair a missed webhook is to ask the provider to redeliver it.
   */
  event?: { externalEventId: string; payload: unknown } | null;
  /**
   * When the provider says this state was true. Defaults to now, which is the
   * best a backfill can honestly claim.
   */
  observedAt?: Date;
}

export interface MirrorProviderDocumentResult {
  /** Null only when the event was a redelivery, so nothing was written. */
  documentId: string | null;
  /** True when this document had never been mirrored before. */
  created: boolean;
  /**
   * Why nothing was written, when nothing was.
   *
   * `redelivered` is the provider sending an event we already processed;
   * `stale` is an event that describes a state older than the row already
   * holds, which is what unordered webhook delivery looks like from here.
   */
  skipped?: 'redelivered' | 'stale';
}

/**
 * Records the event and projects it, idempotently.
 *
 * Two different idempotency keys are doing two different jobs, and conflating
 * them is the bug this is shaped to avoid. `(provider, external_event_id)`
 * makes a redelivered webhook a no-op. `(provider, external_id)` makes the
 * document one row that moves through states rather than a row per notification
 * -- which is what lets the console filter on `status` at all.
 *
 * Both live in one transaction. An event recorded without its projection would
 * be permanently swallowed on the retry, because the retry would see the event
 * already processed and stop.
 */
export async function mirrorProviderDocument(
  input: MirrorProviderDocumentInput,
): Promise<MirrorProviderDocumentResult> {
  const draft = parseProviderDocument(input);
  const observedAt = input.observedAt ?? new Date();

  return db().transaction(async (tx) => {
    let lastEventId: string | null = null;

    if (input.event) {
      const eventId = uuidv7();
      const [recorded] = await tx
        .insert(schema.paymentEvent)
        .values({
          id: eventId,
          provider: draft.provider,
          externalEventId: input.event.externalEventId,
          payload: input.event.payload as Record<string, unknown>,
        })
        .onConflictDoNothing({
          target: [schema.paymentEvent.provider, schema.paymentEvent.externalEventId],
        })
        .returning({ id: schema.paymentEvent.id });

      /*
       * Nothing inserted means this event has already been through here. The
       * projection it produced is already in place, so re-applying it would at
       * best be a no-op and at worst -- with events arriving out of order --
       * would roll the document back to a state it has since left.
       */
      if (!recorded) return { documentId: null, created: false, skipped: 'redelivered' as const };
      lastEventId = recorded.id;
    }

    const documentId = uuidv7();
    const [written] = await tx
      .insert(schema.billingDocument)
      .values({
        id: documentId,
        workspaceId: input.workspaceId,
        provider: draft.provider,
        externalId: draft.externalId,
        number: draft.number,
        kind: draft.kind,
        status: draft.status,
        amountMinor: draft.amountMinor,
        refundedMinor: draft.refundedMinor,
        currency: draft.currency,
        method: draft.method,
        subscriptionId: input.subscriptionId ?? null,
        addonGrantId: input.addonGrantId ?? null,
        planVersionId: input.planVersionId ?? null,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        issuedAt: draft.issuedAt,
        paidAt: draft.paidAt,
        lastEventId,
        observedAt,
      })
      .onConflictDoUpdate({
        target: [schema.billingDocument.provider, schema.billingDocument.externalId],
        /*
         * The out-of-order guard. A provider retries and reorders, so an event
         * describing an older state can land after a newer one; without this,
         * a late `paid` notification would overwrite a `refunded` document and
         * the console would report money the platform no longer has.
         *
         * Equal timestamps are allowed through: a provider that stamps a batch
         * with one instant would otherwise never update past the first of them.
         */
        setWhere: lte(schema.billingDocument.observedAt, observedAt),
        set: {
          /*
           * `workspaceId` is not here. A document does not change hands, and an
           * adapter resolving the customer differently on a later notification
           * would otherwise move a paid invoice onto someone else's account.
           */
          number: draft.number,
          status: draft.status,
          amountMinor: draft.amountMinor,
          refundedMinor: draft.refundedMinor,
          currency: draft.currency,
          method: draft.method,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          issuedAt: draft.issuedAt,
          paidAt: draft.paidAt,
          observedAt,
          /*
           * The link back to source only moves with the state it explains. A
           * backfill with no event must not blank out the event id that told us
           * what the row currently says.
           */
          ...(lastEventId ? { lastEventId } : {}),
          /*
           * The order's own links are filled in the first time they are known
           * and never cleared afterwards: an adapter that cannot resolve the
           * subscription for one notification should not unlink a document that
           * an earlier one already placed.
           */
          ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
          ...(input.addonGrantId ? { addonGrantId: input.addonGrantId } : {}),
          ...(input.planVersionId ? { planVersionId: input.planVersionId } : {}),
        },
      })
      .returning({ id: schema.billingDocument.id });

    /*
     * No row back means the guard refused the update: the document is newer
     * than this event. The event stays recorded -- it did arrive, and a second
     * delivery of it should still be a no-op.
     */
    if (!written) {
      const [existing] = await tx
        .select({ id: schema.billingDocument.id })
        .from(schema.billingDocument)
        .where(
          and(
            eq(schema.billingDocument.provider, draft.provider),
            eq(schema.billingDocument.externalId, draft.externalId),
          ),
        );
      return { documentId: existing?.id ?? null, created: false, skipped: 'stale' as const };
    }

    return { documentId: written.id, created: written.id === documentId };
  });
}
