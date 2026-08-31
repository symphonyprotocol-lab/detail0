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
import { nextDebitSource, type DebitSource } from '@/lib/domain';
import { db, schema } from '@/lib/infrastructure/postgres/client';

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

    const { allowance, periodStart, periodEnd } = await planWindow(tx, input.workspaceId);

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
    const used = (counted?.events ?? 0) + (counted?.held ?? 0) - ownSeat;
    const planRemaining = Math.max(0, allowance - used);
    const addonRemaining = Math.max(0, counted?.addon ?? 0);

    const debitSource = chooseDebitSource({
      planAllowanceRemaining: planRemaining,
      addonBalanceRemaining: addonRemaining,
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
      planAllowanceRemaining: debitSource === 'plan' ? planRemaining - 1 : planRemaining,
      addonBalanceRemaining: debitSource === 'addon' ? addonRemaining - 1 : addonRemaining,
    };
  });
}

/**
 * Finalise a served call: one usage event, the reservation committed, and an
 * addon deduction when that is the source -- one transaction, replay-safe via
 * the event's unique `request_id`. architecture.md 11.1.
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
async function planWindow(
  tx: Tx,
  workspaceId: string,
): Promise<{ allowance: number; periodStart: Date; periodEnd: Date }> {
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
      .select({ monthlyCalls: schema.planVersion.monthlyCalls })
      .from(schema.planVersion)
      .where(eq(schema.planVersion.id, active.planVersionId));
    return {
      allowance: version?.monthlyCalls ?? 0,
      periodStart: active.periodStart,
      periodEnd: active.periodEnd,
    };
  }

  const [free] = await tx
    .select({ monthlyCalls: schema.planVersion.monthlyCalls })
    .from(schema.planVersion)
    .where(eq(schema.planVersion.planId, 'free'))
    .orderBy(desc(schema.planVersion.createdAt))
    .limit(1);

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { allowance: free?.monthlyCalls ?? 0, periodStart, periodEnd };
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
