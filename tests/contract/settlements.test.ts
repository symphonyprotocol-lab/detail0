/**
 * The rules behind "generate statements" (publisher-revenue-share.md 3.3,
 * 3.4, 8): what a locked period's pool turns into, and why pressing the
 * button twice writes nothing the second time.
 */
import { describe, expect, it } from 'vitest';
import { Column, type SQL } from 'drizzle-orm';
import { settlementPageOrder } from '@/lib/application/administration/settlements';
import {
  diffAuditValues,
  holdEndsAt,
  isSettleablePeriod,
  planSettlementStatements,
  roleAllows,
  type SettlementPlanInput,
} from '@/lib/domain/admin';

const period = { id: '2026-08', poolMinor: 10_000, totalAttributableCalls: 1_000, currency: 'USD' };

function plan(overrides: Partial<SettlementPlanInput> = {}) {
  return planSettlementStatements({
    period,
    groups: [
      { ownerWorkspaceId: 'ws-a', libraryId: 'lib-1', calls: 600 },
      { ownerWorkspaceId: 'ws-a', libraryId: 'lib-2', calls: 250 },
      { ownerWorkspaceId: 'ws-b', libraryId: 'lib-3', calls: 150 },
    ],
    accounts: new Map([
      ['ws-a', 'acct-a'],
      ['ws-b', 'acct-b'],
    ]),
    existing: new Set(),
    ...overrides,
  });
}

describe('planSettlementStatements', () => {
  it('allocates the pool linearly in attributable calls, one row per library', () => {
    const result = plan();
    expect(result.rows.map((row) => [row.libraryId, row.amountMinor])).toEqual([
      ['lib-1', 6_000],
      ['lib-2', 2_500],
      ['lib-3', 1_500],
    ]);
    expect(result.rows.every((row) => row.currency === 'USD' && row.periodId === '2026-08')).toBe(
      true,
    );
    expect(result.rows[0]?.publisherAccountId).toBe('acct-a');
    expect(result.withoutAccount).toBe(0);
    expect(result.alreadyPresent).toBe(0);
  });

  /* Acceptance 8: sum(statements) <= pool, the floor taken per library. */
  it('never allocates more than the pool when the shares do not divide', () => {
    const result = planSettlementStatements({
      period: { ...period, poolMinor: 100, totalAttributableCalls: 3 },
      groups: [
        { ownerWorkspaceId: 'ws-a', libraryId: 'lib-1', calls: 1 },
        { ownerWorkspaceId: 'ws-b', libraryId: 'lib-2', calls: 1 },
        { ownerWorkspaceId: 'ws-c', libraryId: 'lib-3', calls: 1 },
      ],
      accounts: new Map([
        ['ws-a', 'a'],
        ['ws-b', 'b'],
        ['ws-c', 'c'],
      ]),
      existing: new Set(),
    });
    const total = result.rows.reduce((sum, row) => sum + row.amountMinor, 0);
    expect(result.rows.map((row) => row.amountMinor)).toEqual([33, 33, 33]);
    expect(total).toBeLessThanOrEqual(100);
  });

  it('is idempotent: libraries that already carry a statement are left alone', () => {
    const first = plan();
    const second = plan({ existing: new Set(first.rows.map((row) => row.libraryId)) });
    expect(second.rows).toEqual([]);
    expect(second.alreadyPresent).toBe(3);
  });

  it('waits for owners without a publisher account instead of dropping their events', () => {
    const result = plan({ accounts: new Map([['ws-a', 'acct-a']]) });
    expect(result.rows.map((row) => row.libraryId)).toEqual(['lib-1', 'lib-2']);
    expect(result.withoutAccount).toBe(1);

    /* Once the owner accepts the agreement, only their rows appear. */
    const later = plan({
      existing: new Set(['lib-1', 'lib-2']),
    });
    expect(later.rows.map((row) => row.libraryId)).toEqual(['lib-3']);
    expect(later.alreadyPresent).toBe(2);
  });

  it('writes nothing for a period with no attributable calls', () => {
    const result = plan({
      period: { ...period, poolMinor: 0, totalAttributableCalls: 0 },
      groups: [{ ownerWorkspaceId: 'ws-a', libraryId: 'lib-1', calls: 0 }],
    });
    expect(result.rows).toEqual([]);
  });
});

describe('isSettleablePeriod', () => {
  const now = new Date('2026-09-08T10:00:00.000Z');

  it('accepts a month that has ended', () => {
    expect(isSettleablePeriod('2026-08', now)).toBe(true);
    expect(isSettleablePeriod('2025-12', now)).toBe(true);
  });

  it('refuses the current and future months: a period cannot be settled mid-way', () => {
    expect(isSettleablePeriod('2026-09', now)).toBe(false);
    expect(isSettleablePeriod('2026-10', now)).toBe(false);
  });

  it('refuses anything that is not YYYY-MM', () => {
    expect(isSettleablePeriod('2026-13', now)).toBe(false);
    expect(isSettleablePeriod('2026-00', now)).toBe(false);
    expect(isSettleablePeriod('2026-8', now)).toBe(false);
    expect(isSettleablePeriod('', now)).toBe(false);
  });
});

describe('holdEndsAt', () => {
  it('counts the hold window from the lock, not from the calls', () => {
    const locked = new Date('2026-09-01T00:00:00.000Z');
    expect(holdEndsAt(locked, 45).toISOString()).toBe('2026-10-16T00:00:00.000Z');
  });
});

/** The capability that used to ride on `plans` is its own now. */
describe('models capability', () => {
  it('goes to super and operator, and to nobody else', () => {
    expect(roleAllows('super', 'models')).toBe(true);
    expect(roleAllows('operator', 'models')).toBe(true);
    expect(roleAllows('reviewer', 'models')).toBe(false);
    expect(roleAllows('support', 'models')).toBe(false);
  });
});

describe('diffAuditValues', () => {
  it('lists only the leaves that changed, nested paths flattened', () => {
    expect(
      diffAuditValues(
        { status: 'active', email: 'a@x', mfa: { enrolled: true } },
        { status: 'invited', email: 'a@x', mfa: { enrolled: false }, revokedSessions: 2 },
      ),
    ).toEqual([
      { path: 'status', before: 'active', after: 'invited' },
      { path: 'mfa.enrolled', before: true, after: false },
      { path: 'revokedSessions', before: undefined, after: 2 },
    ]);
  });

  it('handles a one-sided snapshot and scalars', () => {
    expect(diffAuditValues(null, { query: null, bytes: 12 })).toEqual([
      { path: 'query', before: undefined, after: null },
      { path: 'bytes', before: undefined, after: 12 },
    ]);
    expect(diffAuditValues('a', 'a')).toEqual([]);
    expect(diffAuditValues([1, 2], [1, 3])).toEqual([{ path: '.', before: [1, 2], after: [1, 3] }]);
  });
});

describe('the ledger paging order', () => {
  /*
   * `generateSettlements` inserts a run in one statement, so a period's rows
   * all carry the same `created_at`. `(period_id, created_at)` alone leaves
   * them unordered, and `?page=2` over a period bigger than a page then
   * repeats rows and drops others. The id is uuidv7, so it is both unique and
   * newest-first.
   */
  it('breaks the created_at tie on the settlement id', () => {
    const columns = settlementPageOrder().flatMap((clause: SQL) =>
      clause.queryChunks.filter((chunk): chunk is Column => chunk instanceof Column),
    );
    expect(columns.map((column) => column.name)).toEqual(['period_id', 'created_at', 'id']);
    expect(columns.map((column) => column.table)).toHaveLength(3);
  });

  it('orders every key descending, newest period and newest row first', () => {
    const text = settlementPageOrder()
      .flatMap((clause: SQL) => clause.queryChunks)
      .map((chunk) => (chunk instanceof Column ? '' : String((chunk as { value?: string[] }).value ?? '')))
      .join('');
    expect(text.match(/desc/g)).toHaveLength(3);
  });
});
