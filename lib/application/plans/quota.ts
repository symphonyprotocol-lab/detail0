/**
 * Call quota. architecture.md 11.1.
 *
 * Reservation and usage event are billing facts: they live in one Postgres
 * transaction with the business data. Never move this counting into Redis.
 *
 * Deduction order is fixed: plan allowance first, then the addon balance.
 * The addon balance has no expiry and rolls across periods, so eligibility must
 * be decided by reading the balance, never by a validity window.
 *
 * Concurrency: architecture.md 11.1 forbids "SELECT the remainder, then plain
 * INSERT". Two things make this correct instead: the workspace row is locked
 * (`FOR UPDATE`) for the duration of the reservation transaction, which
 * serialises concurrent reservations of one workspace, and `request_id` is
 * unique on both the reservation and the event, which makes a replay of the
 * same request a no-op rather than a second charge. Per-workspace
 * serialisation is the cost; it lasts three reads and one insert.
 */
import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { AppError } from '@/contracts/errors';
import { uuidv7 } from '@/lib/domain/id';
import {
  DAILY_ATTRIBUTABLE_CALL_CAP,
  isRevenueEligible,
  nextDebitSource,
  revenuePeriodId,
  type DebitSource,
  type LifecycleStatus,
  type Visibility,
} from '@/lib/domain';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { PLAN_VERSION_NEWEST_FIRST } from './configuration';

export interface QuotaState {
  planAllowanceRemaining: number;
  addonBalanceRemaining: number;
}

export function chooseDebitSource(state: QuotaState): DebitSource {
  const source = nextDebitSource(state);
  if (source === null) {
    throw new AppError('quota_exceeded', 'monthly allowance and call pack balance are both empty');
  }
  return source;
}

export interface ReservedCall {
  reservationId: string;
  workspaceId: string;
  requestId: string;
  debitSource: DebitSource;
  /** The oldest grant with balance, chosen now, consumed at commit. */
  addonGrantId: string | null;
  /**
   * The plan version the call bills against, pinned at reservation. The
   * earning event freezes this id and its share rate (11.4: historical
   * periods settle at the values of their time). Null only when no plan
   * version exists at all, in which case nothing can earn either.
   */
  planVersionId: string | null;
  shareRateBps: number;
  /** Remaining after this reservation -- what the response reports. */
  planAllowanceRemaining: number;
  addonBalanceRemaining: number;
}

/**
 * Reserve one call before retrieval starts. Throws `quota_exceeded` when the
 * plan allowance and the addon balance are both empty. A replayed
 * `request_id` returns the existing reservation instead of a second one.
 */
export async function reserveCall(input: {
  workspaceId: string;
  requestId: string;
}): Promise<ReservedCall> {
  const database = db();

  return database.transaction(async (tx) => {
    /* Serialises this workspace's reservations; also proves it exists. */
    const [locked] = await tx
      .select({ id: schema.workspace.id })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, input.workspaceId))
      .for('update');
    if (!locked) throw new AppError('access_denied', 'no such workspace');

    const { allowance, periodStart, periodEnd, planVersionId, shareRateBps } = await planWindow(
      tx,
      input.workspaceId,
    );

    const [counted] = await tx
      .select({
        events: sql<number>`(
          select count(*)::int from ${schema.usageEvent}
          where ${schema.usageEvent.workspaceId} = ${input.workspaceId}
            and ${schema.usageEvent.createdAt} >= ${periodStart}
            and ${schema.usageEvent.createdAt} < ${periodEnd}
        )`,
        held: sql<number>`(
          select count(*)::int from ${schema.usageReservation}
          where ${schema.usageReservation.workspaceId} = ${input.workspaceId}
            and ${schema.usageReservation.status} = 'pending'
            and ${schema.usageReservation.createdAt} >= ${periodStart}
            and ${schema.usageReservation.createdAt} < ${periodEnd}
        )`,
        addon: sql<number>`(
          select coalesce(sum(${schema.addonGrant.callsGranted} - ${schema.addonGrant.callsConsumed}), 0)::int
          from ${schema.addonGrant}
          where ${schema.addonGrant.workspaceId} = ${input.workspaceId}
        )`,
      })
      .from(sql`(select 1) as one`);

    /*
     * A replay of the same request must not be admitted twice -- or refused
     * because its own first pass holds the last seat. The existing reservation
     * is looked up first, and when it is still pending, its own seat is
     * excluded before the quota is re-derived.
     */
    const [existing] = await tx
      .select({ id: schema.usageReservation.id, status: schema.usageReservation.status })
      .from(schema.usageReservation)
      .where(eq(schema.usageReservation.requestId, input.requestId));

    const ownSeat = existing?.status === 'pending' ? 1 : 0;
    const held = Math.max(0, (counted?.held ?? 0) - ownSeat);
    const planRemaining = Math.max(0, allowance - (counted?.events ?? 0));
    const addonRemaining = Math.max(0, counted?.addon ?? 0);

    /*
     * Held reservations follow the same deduction order as committed calls:
     * plan allowance first, and only the excess spills onto the addon balance.
     * Counting them against the plan alone would let two back-to-back calls
     * both be admitted on the last addon call -- commitCall's guarded update
     * would then silently no-op for the loser while its usage event was still
     * written, a call served and never paid for.
     */
    const effectivePlanRemaining = Math.max(0, planRemaining - held);
    const spill = Math.max(0, held - planRemaining);
    const effectiveAddonRemaining = Math.max(0, addonRemaining - spill);

    const debitSource = chooseDebitSource({
      planAllowanceRemaining: effectivePlanRemaining,
      addonBalanceRemaining: effectiveAddonRemaining,
    });

    const addonGrantId =
      debitSource === 'addon' ? await oldestGrantWithBalance(tx, input.workspaceId) : null;

    let reservationId = existing?.id;
    if (!reservationId) {
      reservationId = uuidv7();
      await tx.insert(schema.usageReservation).values({
        id: reservationId,
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        status: 'pending',
      });
    }

    /* This reservation occupies a seat: report what is left after it. */
    return {
      reservationId,
      workspaceId: input.workspaceId,
      requestId: input.requestId,
      debitSource,
      addonGrantId,
      planVersionId,
      shareRateBps,
      planAllowanceRemaining:
        debitSource === 'plan' ? effectivePlanRemaining - 1 : effectivePlanRemaining,
      addonBalanceRemaining:
        debitSource === 'addon' ? effectiveAddonRemaining - 1 : effectiveAddonRemaining,
    };
  });
}

/**
 * What the earning decision needs to know about the target library -- loaded
 * by the caller before the call was admitted, so the judgment inside the
 * transaction uses fields already determined and never a post-hoc query
 * (architecture.md 11.4).
 */
export interface EarningLibraryFacts {
  visibility: Visibility;
  lifecycleStatus: LifecycleStatus;
  ownerWorkspaceId: string | null;
  isPlatformLibrary: boolean;
  /**
   * requirement.md 7.3: `owner_workspace_id` alone proves access, not rights.
   * Sources gated behind a claim (github, website, llms_txt) earn only after
   * one verified; self-owned source types are rights-verified by creation.
   * Workspaces could otherwise mint a library over someone else's repository
   * and collect its share without ever passing the claim.
   */
  rightsVerified: boolean;
}

/**
 * Finalise a served call: one usage event, the reservation committed, an
 * addon deduction when that is the source, and -- when the target library is
 * eligible -- one earning event, all in one transaction and replay-safe via
 * unique `request_id`s. architecture.md 11.1 and 11.4: the earning event is a
 * billing fact and must never be an asynchronous afterthought.
 */
export async function commitCall(input: {
  reservation: ReservedCall;
  libraryId: string;
  versionId: string;
  operation: string;
  entrypoint: string;
  statusCode: number;
  latencyMs: number | null;
  inputTokens: number | null;
  returnedTokens: number | null;
  /** Omitted by operations that never earn (nothing but query-docs earns). */
  libraryFacts?: EarningLibraryFacts;
}): Promise<void> {
  const database = db();
  const { reservation } = input;

  await database.transaction(async (tx) => {
    const written = await tx
      .insert(schema.usageEvent)
      .values({
        id: uuidv7(),
        workspaceId: reservation.workspaceId,
        requestId: reservation.requestId,
        libraryId: input.libraryId,
        versionId: input.versionId,
        operation: input.operation,
        entrypoint: input.entrypoint,
        debitSource: reservation.debitSource,
        addonGrantId: reservation.addonGrantId,
        statusCode: input.statusCode,
        latencyMs: input.latencyMs,
        inputTokens: input.inputTokens,
        returnedTokens: input.returnedTokens,
      })
      .onConflictDoNothing({ target: schema.usageEvent.requestId })
      .returning({ id: schema.usageEvent.id });

    await tx
      .update(schema.usageReservation)
      .set({ status: 'committed' })
      .where(eq(schema.usageReservation.id, reservation.reservationId));

    /* Balance decrements only when the event was actually written -- a replay
       must not consume the pack twice. requirement.md 4.3. */
    if (written.length > 0 && reservation.debitSource === 'addon' && reservation.addonGrantId) {
      await tx
        .update(schema.addonGrant)
        .set({ callsConsumed: sql`${schema.addonGrant.callsConsumed} + 1` })
        .where(
          and(
            eq(schema.addonGrant.id, reservation.addonGrantId),
            lt(schema.addonGrant.callsConsumed, schema.addonGrant.callsGranted),
          ),
        );
    }

    /*
     * The earning event, gated exactly as publisher-revenue-share.md 3.1
     * lists: eligible library (public, published, claimed, not the
     * platform's), not the owner calling their own library, an existing plan
     * version to freeze the rate from -- and under the caller's daily
     * attributable cap for this library, counted here in the same
     * transaction. Over the cap the call bills normally and earns nothing.
     * `written.length > 0` plus the unique request id keep replays at one.
     */
    const facts = input.libraryFacts;
    if (
      written.length > 0 &&
      facts &&
      facts.rightsVerified &&
      reservation.planVersionId &&
      facts.ownerWorkspaceId !== reservation.workspaceId &&
      isRevenueEligible(facts)
    ) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const [today] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.earningEvent)
        .innerJoin(schema.usageEvent, eq(schema.usageEvent.requestId, schema.earningEvent.requestId))
        .where(
          and(
            eq(schema.earningEvent.libraryId, input.libraryId),
            eq(schema.usageEvent.workspaceId, reservation.workspaceId),
            gte(schema.earningEvent.createdAt, dayStart),
          ),
        );

      if ((today?.n ?? 0) < DAILY_ATTRIBUTABLE_CALL_CAP) {
        await tx
          .insert(schema.earningEvent)
          .values({
            id: uuidv7(),
            requestId: reservation.requestId,
            libraryId: input.libraryId,
            versionId: input.versionId,
            /* isRevenueEligible refused null owners above. */
            ownerWorkspaceId: facts.ownerWorkspaceId!,
            planVersionId: reservation.planVersionId,
            shareRateBps: reservation.shareRateBps,
            periodId: revenuePeriodId(new Date()),
          })
          .onConflictDoNothing({ target: schema.earningEvent.requestId });
      }
    }
  });
}

/** A platform-internal failure: the seat is released, no event is written. */
export async function releaseCall(reservationId: string): Promise<void> {
  await db()
    .update(schema.usageReservation)
    .set({ status: 'released' })
    .where(
      and(
        eq(schema.usageReservation.id, reservationId),
        eq(schema.usageReservation.status, 'pending'),
      ),
    );
}

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/**
 * The allowance and the window it applies to. A workspace with a live
 * subscription bills against that subscription's frozen Plan Version and its
 * provider-defined period; without one it is on the newest Free version and a
 * calendar month. requirement.md 4.1.
 */
/**
 * Whether the workspace is on a paid plan right now: an active subscription
 * within its period, to a plan version that is not the free tier. What the
 * playground reads to decide which models a caller may be answered by.
 */
export async function hasPaidSubscription(workspaceId: string): Promise<boolean> {
  const [paid] = await db()
    .select({ planId: schema.planVersion.planId })
    .from(schema.subscription)
    .innerJoin(schema.planVersion, eq(schema.planVersion.id, schema.subscription.planVersionId))
    .where(
      and(
        eq(schema.subscription.workspaceId, workspaceId),
        eq(schema.subscription.status, 'active'),
        lte(schema.subscription.periodStart, sql`now()`),
        gte(schema.subscription.periodEnd, sql`now()`),
      ),
    )
    .orderBy(desc(schema.subscription.periodEnd))
    .limit(1);
  return paid !== undefined && paid.planId !== 'free';
}

async function planWindow(
  tx: Tx,
  workspaceId: string,
): Promise<{
  allowance: number;
  periodStart: Date;
  periodEnd: Date;
  planVersionId: string | null;
  shareRateBps: number;
}> {
  const [active] = await tx
    .select({
      planVersionId: schema.subscription.planVersionId,
      periodStart: schema.subscription.periodStart,
      periodEnd: schema.subscription.periodEnd,
    })
    .from(schema.subscription)
    .where(
      and(
        eq(schema.subscription.workspaceId, workspaceId),
        eq(schema.subscription.status, 'active'),
        lte(schema.subscription.periodStart, sql`now()`),
        gte(schema.subscription.periodEnd, sql`now()`),
      ),
    )
    .orderBy(desc(schema.subscription.periodEnd))
    .limit(1);

  if (active) {
    const [version] = await tx
      .select({
        monthlyCalls: schema.planVersion.monthlyCalls,
        shareRateBps: schema.planVersion.shareRateBps,
      })
      .from(schema.planVersion)
      .where(eq(schema.planVersion.id, active.planVersionId));
    return {
      allowance: version?.monthlyCalls ?? 0,
      periodStart: active.periodStart,
      periodEnd: active.periodEnd,
      planVersionId: active.planVersionId,
      shareRateBps: version?.shareRateBps ?? 0,
    };
  }

  const [free] = await tx
    .select({
      id: schema.planVersion.id,
      monthlyCalls: schema.planVersion.monthlyCalls,
      shareRateBps: schema.planVersion.shareRateBps,
    })
    .from(schema.planVersion)
    .where(eq(schema.planVersion.planId, 'free'))
    .orderBy(...PLAN_VERSION_NEWEST_FIRST)
    .limit(1);

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    allowance: free?.monthlyCalls ?? 0,
    periodStart,
    periodEnd,
    planVersionId: free?.id ?? null,
    shareRateBps: free?.shareRateBps ?? 0,
  };
}

async function oldestGrantWithBalance(tx: Tx, workspaceId: string): Promise<string | null> {
  const [grant] = await tx
    .select({ id: schema.addonGrant.id })
    .from(schema.addonGrant)
    .where(
      and(
        eq(schema.addonGrant.workspaceId, workspaceId),
        lt(schema.addonGrant.callsConsumed, schema.addonGrant.callsGranted),
      ),
    )
    .orderBy(asc(schema.addonGrant.createdAt))
    .limit(1);
  return grant?.id ?? null;
}
