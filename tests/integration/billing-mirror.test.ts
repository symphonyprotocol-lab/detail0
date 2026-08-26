/**
 * Mirroring provider billing state against a real database.
 *
 * The properties under test are the two that cannot be checked without one:
 * a redelivered webhook writes nothing, and an event describing an older state
 * does not overwrite a newer row. Both are conditional writes -- `ON CONFLICT
 * DO NOTHING` on the event, `ON CONFLICT DO UPDATE ... WHERE` on the document
 * -- so a unit test would be testing a mock of Postgres rather than Postgres.
 *
 * Both matter for the same reason: providers retry, and they do not promise
 * order. Getting either wrong means the console reports money the platform
 * does not have (architecture.md 11.3).
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

const { mirrorProviderDocument } = await import('@/lib/application/billing/mirror');
const { listBillingDocuments, billingSummary } = await import(
  '@/lib/application/billing/list-documents'
);
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');

const workspaceId = uuidv7();
const provider = `test-${workspaceId.slice(0, 8)}`;
const externalId = `in_${workspaceId.slice(0, 12)}`;

const EARLIER = new Date('2026-08-05T09:12:00.000Z');
const LATER = new Date('2026-08-19T14:03:00.000Z');

const base = {
  workspaceId,
  provider,
  externalId,
  number: 'INV-TEST-0001',
  kind: 'subscription' as const,
  amountMinor: 500,
  currency: 'USD',
  method: 'card',
  issuedAt: new Date('2026-08-05T09:11:00.000Z'),
};

describeWithDb('the provider billing mirror', () => {
  afterAll(async () => {
    const database = db();
    await database
      .delete(schema.billingDocument)
      .where(eq(schema.billingDocument.provider, provider));
    await database.delete(schema.paymentEvent).where(eq(schema.paymentEvent.provider, provider));
    await database.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  });

  it('creates the document the first time it hears about it', async () => {
    await db().insert(schema.workspace).values({ id: workspaceId, name: 'Billing Fixture' });

    const result = await mirrorProviderDocument({
      ...base,
      status: 'paid',
      paidAt: EARLIER,
      observedAt: EARLIER,
      event: { externalEventId: 'evt_paid', payload: { type: 'invoice.paid' } },
    });

    expect(result.created).toBe(true);
    expect(result.skipped).toBeUndefined();

    const { rows, total } = await listBillingDocuments({ workspaceId });
    expect(total).toBe(1);
    expect(rows[0]?.status).toBe('paid');
    expect(rows[0]?.workspaceName).toBe('Billing Fixture');
  });

  /*
   * A redelivery is the common case, not the edge case: providers retry until
   * they see a 2xx, and a handler that has already answered slowly will be
   * asked again.
   */
  it('writes nothing when the provider redelivers an event', async () => {
    const result = await mirrorProviderDocument({
      ...base,
      status: 'refunded',
      refundedMinor: 500,
      paidAt: EARLIER,
      observedAt: LATER,
      event: { externalEventId: 'evt_paid', payload: { type: 'invoice.paid' } },
    });

    expect(result.skipped).toBe('redelivered');

    const { rows } = await listBillingDocuments({ workspaceId });
    expect(rows[0]?.status).toBe('paid');
    expect(rows[0]?.refundedMinor).toBe(0);
  });

  it('moves the document on when a newer event arrives', async () => {
    const result = await mirrorProviderDocument({
      ...base,
      status: 'refunded',
      refundedMinor: 200,
      paidAt: EARLIER,
      observedAt: LATER,
      event: { externalEventId: 'evt_refunded', payload: { type: 'charge.refunded' } },
    });

    expect(result.created).toBe(false);
    expect(result.skipped).toBeUndefined();

    const { rows } = await listBillingDocuments({ workspaceId });
    expect(rows[0]?.status).toBe('refunded');
    expect(rows[0]?.refundedMinor).toBe(200);
  });

  /*
   * The one that would be silent. A late `paid` notification overwriting a
   * refunded document leaves the console reporting money that has gone back,
   * and nothing about the row would say it had happened.
   */
  it('refuses an event describing a state older than the row', async () => {
    const result = await mirrorProviderDocument({
      ...base,
      status: 'paid',
      paidAt: EARLIER,
      observedAt: new Date(EARLIER.getTime() - 60_000),
      event: { externalEventId: 'evt_late_paid', payload: { type: 'invoice.paid' } },
    });

    expect(result.skipped).toBe('stale');
    expect(result.documentId).not.toBeNull();

    const { rows } = await listBillingDocuments({ workspaceId });
    expect(rows[0]?.status).toBe('refunded');
    expect(rows[0]?.refundedMinor).toBe(200);
  });

  it('counts the document net of its refund, in the month it was paid', async () => {
    const summary = await billingSummary(new Date('2026-08-31T00:00:00.000Z'));
    expect(summary.currency).toBe('USD');
    // Other fixtures may share the database, so the assertion is a floor.
    expect(summary.monthRefundedMinor).toBeGreaterThanOrEqual(200);
  });
});
