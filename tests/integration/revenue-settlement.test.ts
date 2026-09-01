/**
 * Closing a revenue period, against a real database. publisher-revenue-share.md
 * 3.2/3.3/8: the pool prices each rate group at its frozen rate, allocation
 * is linear in attributable calls with sum <= pool, a second close returns
 * the locked numbers, and a suspended library's events void at close --
 * exactly once, and never for a period already locked.
 *
 * All fixture rows live in 2020 periods, which nothing else writes to, so
 * the aggregates here are exact regardless of what parallel suites meter.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

const { closePeriod } = await import('@/lib/application/revenue');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');

const workspaces: string[] = [];
const libraries: string[] = [];
const planVersions: string[] = [];
const periods: string[] = [];

async function workspace(name: string): Promise<string> {
  const id = crypto.randomUUID();
  workspaces.push(id);
  await db().insert(schema.workspace).values({ id, name });
  return id;
}

async function planVersion(shareRateBps: number): Promise<string> {
  const id = uuidv7();
  planVersions.push(id);
  await db().insert(schema.planVersion).values({
    id,
    planId: 'pro',
    priceMinor: 2000,
    currency: 'USD',
    monthlyCalls: 100_000,
    libraryLimit: 10,
    librarySizeBytesLimit: 1_000_000,
    apiKeyLimit: 5,
    shareRateBps,
    capabilities: {},
    createdAt: new Date('2000-01-01T00:00:00Z'),
  });
  return id;
}

async function library(slug: string, owner: string, lifecycle = 'published'): Promise<string> {
  const id = crypto.randomUUID();
  libraries.push(id);
  await db().insert(schema.library).values({
    id,
    publicId: `/websites/${slug}`,
    title: `Settlement fixture ${slug}`,
    ownerWorkspaceId: owner,
    isPlatformLibrary: false,
    visibility: 'public',
    lifecycleStatus: lifecycle as 'published',
    indexStatus: 'ready',
  });
  return id;
}

/** N billed calls in the period, of which `earning` also earned for `owner`. */
async function calls(input: {
  period: string;
  at: Date;
  reader: string;
  libraryId: string;
  owner: string;
  planVersionId: string;
  shareRateBps: number;
  billed: number;
  earning: number;
}): Promise<void> {
  const database = db();
  const ids = Array.from({ length: input.billed }, () => `req_settle_${uuidv7()}`);
  await database.insert(schema.usageEvent).values(
    ids.map((requestId) => ({
      id: uuidv7(),
      workspaceId: input.reader,
      requestId,
      libraryId: input.libraryId,
      operation: 'context',
      entrypoint: 'rest',
      debitSource: 'plan',
      statusCode: 200,
      createdAt: input.at,
    })),
  );
  if (input.earning === 0) return;
  await database.insert(schema.earningEvent).values(
    ids.slice(0, input.earning).map((requestId) => ({
      id: uuidv7(),
      requestId,
      libraryId: input.libraryId,
      ownerWorkspaceId: input.owner,
      planVersionId: input.planVersionId,
      shareRateBps: input.shareRateBps,
      periodId: input.period,
      createdAt: input.at,
    })),
  );
}

describeWithDb('revenue settlement', () => {
  afterAll(async () => {
    const database = db();
    if (libraries.length > 0) {
      await database
        .delete(schema.earningEvent)
        .where(inArray(schema.earningEvent.libraryId, libraries));
      await database
        .delete(schema.usageEvent)
        .where(inArray(schema.usageEvent.libraryId, libraries));
      await database.delete(schema.library).where(inArray(schema.library.id, libraries));
    }
    if (periods.length > 0) {
      await database.delete(schema.revenuePeriod).where(inArray(schema.revenuePeriod.id, periods));
    }
    if (workspaces.length > 0) {
      await database
        .delete(schema.billingDocument)
        .where(inArray(schema.billingDocument.workspaceId, workspaces));
      await database.delete(schema.workspace).where(inArray(schema.workspace.id, workspaces));
    }
    if (planVersions.length > 0) {
      await database
        .delete(schema.planVersion)
        .where(inArray(schema.planVersion.id, planVersions));
    }
  });

  it('prices rate groups separately, allocates linearly, and locks', async () => {
    periods.push('2020-06');
    const at = new Date('2020-06-15T00:00:00Z');
    const reader = await workspace('settle-reader');
    const ownerA = await workspace('settle-owner-a');
    const ownerB = await workspace('settle-owner-b');
    const planPro = await planVersion(2_000);
    const planPlus = await planVersion(2_500);
    const libA = await library('settle-a', ownerA);
    const libB = await library('settle-b', ownerB);

    await calls({ period: '2020-06', at, reader, libraryId: libA, owner: ownerA, planVersionId: planPro, shareRateBps: 2_000, billed: 5, earning: 5 });
    await calls({ period: '2020-06', at, reader, libraryId: libB, owner: ownerB, planVersionId: planPlus, shareRateBps: 2_500, billed: 3, earning: 3 });
    /* Twelve billed calls that earned nothing dilute the attributable share. */
    await calls({ period: '2020-06', at, reader, libraryId: libA, owner: ownerA, planVersionId: planPro, shareRateBps: 2_000, billed: 12, earning: 0 });

    await db().insert(schema.billingDocument).values([
      {
        id: uuidv7(),
        workspaceId: reader,
        provider: 'stripe',
        externalId: `inv_${uuidv7()}`,
        number: 'INV-1',
        kind: 'subscription' as const,
        status: 'paid' as const,
        amountMinor: 10_000,
        refundedMinor: 0,
        issuedAt: at,
        paidAt: at,
      },
      {
        /* Fully refunded: contributes zero to net revenue. */
        id: uuidv7(),
        workspaceId: reader,
        provider: 'stripe',
        externalId: `inv_${uuidv7()}`,
        number: 'INV-2',
        kind: 'subscription' as const,
        status: 'refunded' as const,
        amountMinor: 5_000,
        refundedMinor: 5_000,
        issuedAt: at,
        paidAt: at,
      },
    ]);

    const closed = await closePeriod('2020-06');
    expect(closed.alreadyLocked).toBe(false);
    expect(closed.netRevenueMinor).toBe(10_000);
    expect(closed.totalBilledCalls).toBe(20);
    expect(closed.totalAttributableCalls).toBe(8);
    // 2000bps group: floor(10000 * 2000 * (5/20) / 10000) = 500
    // 2500bps group: floor(10000 * 2500 * (3/20) / 10000) = 375
    expect(closed.poolMinor).toBe(875);
    expect(closed.shareRateBps).toBe(2_187); // floor((2000*5 + 2500*3) / 8)

    const byOwner = new Map(closed.allocations.map((a) => [a.ownerWorkspaceId, a]));
    expect(byOwner.get(ownerA)).toMatchObject({ attributableCalls: 5, amountMinor: 546 });
    expect(byOwner.get(ownerB)).toMatchObject({ attributableCalls: 3, amountMinor: 328 });
    const total = closed.allocations.reduce((sum, a) => sum + a.amountMinor, 0);
    expect(total).toBeLessThanOrEqual(closed.poolMinor);

    /* A second close returns the frozen numbers, byte for byte. */
    const again = await closePeriod('2020-06');
    expect(again.alreadyLocked).toBe(true);
    expect(again.poolMinor).toBe(closed.poolMinor);
    expect(again.allocations).toEqual(closed.allocations);
  });

  it('voids a suspended library at close, and only then', async () => {
    periods.push('2020-07');
    const at = new Date('2020-07-15T00:00:00Z');
    const reader = await workspace('settle-reader-2');
    const ownerC = await workspace('settle-owner-c');
    const ownerD = await workspace('settle-owner-d');
    const plan = await planVersion(2_000);
    const suspended = await library('settle-suspended', ownerC, 'suspended');
    const healthy = await library('settle-healthy', ownerD);

    await calls({ period: '2020-07', at, reader, libraryId: suspended, owner: ownerC, planVersionId: plan, shareRateBps: 2_000, billed: 4, earning: 4 });
    await calls({ period: '2020-07', at, reader, libraryId: healthy, owner: ownerD, planVersionId: plan, shareRateBps: 2_000, billed: 4, earning: 4 });
    await db().insert(schema.billingDocument).values({
      id: uuidv7(),
      workspaceId: reader,
      provider: 'stripe',
      externalId: `inv_${uuidv7()}`,
      number: 'INV-3',
      kind: 'subscription' as const,
      status: 'paid' as const,
      amountMinor: 8_000,
      refundedMinor: 0,
      issuedAt: at,
      paidAt: at,
    });

    const closed = await closePeriod('2020-07');
    expect(closed.totalAttributableCalls).toBe(4);
    expect(closed.allocations.map((a) => a.ownerWorkspaceId)).toEqual([ownerD]);

    const voided = await db()
      .select()
      .from(schema.earningEvent)
      .where(
        and(eq(schema.earningEvent.libraryId, suspended), eq(schema.earningEvent.flagged, true)),
      );
    expect(voided).toHaveLength(4);
  });

  it('refuses an unfinished or malformed period', async () => {
    const now = new Date();
    const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    await expect(closePeriod(current)).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(closePeriod('not-a-period')).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
