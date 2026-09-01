/**
 * What a publisher reads about their own earnings, and how they enter the
 * programme. publisher-revenue-share.md stage 2: the dashboard side of the
 * ledger stage 1 writes.
 *
 * Every figure here is a recomputation, never a stored balance: a locked
 * period's amount is re-derived from the frozen period row and the owner's
 * unflagged events -- the same arithmetic closePeriod used -- which is
 * exactly the share doc's acceptance property (any period is independently
 * recomputable from events). An unlocked period shows its call count and no
 * amount, because the pool does not exist until the period closes.
 *
 * The publisher account is the programme-entry record: agreement version and
 * (later) the external payment account. Tax and KYC stay with the payment
 * provider (3.4: the platform holds no bank details and no funds).
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  PAYOUT_HOLD_DAYS,
  PAYOUT_THRESHOLD_MINOR,
  settlementAmountMinor,
} from '@/lib/domain';
import { uuidv7 } from '@/lib/domain/id';
import { db, schema } from '@/lib/infrastructure/postgres/client';

export interface PublisherPeriodEarning {
  periodId: string;
  locked: boolean;
  attributableCalls: number;
  /** Null until the period locks -- there is no pool to allocate from yet. */
  amountMinor: number | null;
}

export interface PublisherEarnings {
  account: {
    taxStatus: string;
    agreementVersion: string | null;
    providerAccountLinked: boolean;
  } | null;
  periods: PublisherPeriodEarning[];
  /** Sum of the locked periods' amounts; stage 2 pays nothing out yet. */
  accruedMinor: number;
  payoutThresholdMinor: number;
  holdDays: number;
}

const PERIODS_SHOWN = 12;

export async function publisherEarnings(workspaceId: string): Promise<PublisherEarnings> {
  const database = db();

  const [account] = await database
    .select()
    .from(schema.publisherAccount)
    .where(eq(schema.publisherAccount.workspaceId, workspaceId))
    .orderBy(desc(schema.publisherAccount.createdAt))
    .limit(1);

  const byPeriod = await database
    .select({
      periodId: schema.earningEvent.periodId,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.earningEvent)
    .where(
      and(
        eq(schema.earningEvent.ownerWorkspaceId, workspaceId),
        eq(schema.earningEvent.flagged, false),
      ),
    )
    .groupBy(schema.earningEvent.periodId)
    .orderBy(desc(schema.earningEvent.periodId))
    .limit(PERIODS_SHOWN);

  const periods: PublisherPeriodEarning[] = [];
  let accruedMinor = 0;
  for (const row of byPeriod) {
    const [period] = await database
      .select({
        poolMinor: schema.revenuePeriod.poolMinor,
        totalAttributableCalls: schema.revenuePeriod.totalAttributableCalls,
        lockedAt: schema.revenuePeriod.lockedAt,
      })
      .from(schema.revenuePeriod)
      .where(eq(schema.revenuePeriod.id, row.periodId));

    const locked = Boolean(period?.lockedAt);
    const amountMinor = locked
      ? settlementAmountMinor({
          poolMinor: period!.poolMinor,
          libraryAttributableCalls: row.calls,
          totalAttributableCalls: Number(period!.totalAttributableCalls),
        })
      : null;
    if (amountMinor !== null) accruedMinor += amountMinor;
    periods.push({ periodId: row.periodId, locked, attributableCalls: row.calls, amountMinor });
  }

  return {
    account: account
      ? {
          taxStatus: account.taxStatus,
          agreementVersion: account.agreementVersion,
          providerAccountLinked: account.providerAccountId !== null,
        }
      : null,
    periods,
    accruedMinor,
    payoutThresholdMinor: PAYOUT_THRESHOLD_MINOR,
    holdDays: PAYOUT_HOLD_DAYS,
  };
}

/**
 * Entering the programme: accept the publisher agreement. Idempotent per
 * workspace -- re-accepting records the newer agreement version on the same
 * account rather than minting a second one.
 */
export async function acceptPublisherAgreement(input: {
  workspaceId: string;
  agreementVersion: string;
}): Promise<{ accountId: string }> {
  const database = db();
  const [existing] = await database
    .select({ id: schema.publisherAccount.id })
    .from(schema.publisherAccount)
    .where(eq(schema.publisherAccount.workspaceId, input.workspaceId))
    .limit(1);

  if (existing) {
    await database
      .update(schema.publisherAccount)
      .set({ agreementVersion: input.agreementVersion })
      .where(eq(schema.publisherAccount.id, existing.id));
    return { accountId: existing.id };
  }

  const accountId = uuidv7();
  await database.insert(schema.publisherAccount).values({
    id: accountId,
    workspaceId: input.workspaceId,
    agreementVersion: input.agreementVersion,
  });
  return { accountId };
}
