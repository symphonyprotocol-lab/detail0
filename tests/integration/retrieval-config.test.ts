/**
 * The retrieval configuration's round trip, against a real database.
 * architecture.md 9.3, requirement.md 5.3.
 *
 * What only the rows can show: that a save is what the next read returns
 * (immediate effect is a property of reading per request, and this is the
 * read), that the defaults stand in until then, and that the change landed in
 * the audit chain with a reason.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

const { activeRetrievalSettings, readRetrievalConfiguration, updateRetrievalConfig } = await import(
  '@/lib/application/administration'
);
const { DEFAULT_RETRIEVAL_SETTINGS } = await import('@/lib/domain/retrieval-config');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');

const administratorId = crypto.randomUUID();
const configIds: string[] = [];

describeWithDb('retrieval configuration', () => {
  afterAll(async () => {
    const database = db();
    if (configIds.length > 0) {
      await database
        .delete(schema.retrievalConfig)
        .where(inArray(schema.retrievalConfig.id, configIds));
    }
    await database.delete(schema.auditLog).where(eq(schema.auditLog.administratorId, administratorId));
    await database.delete(schema.administrator).where(eq(schema.administrator.id, administratorId));
  });

  it('a save is what the very next read returns, and it is audited', async () => {
    await db().insert(schema.administrator).values({
      id: administratorId,
      email: `retrieval-${Date.now()}@example.test`,
      username: `retrieval-${Date.now()}`,
      passwordHash: 'unused',
      status: 'active',
    });
    const actor = { administratorId, email: 'ops@example.test' };

    const before = await activeRetrievalSettings();
    /* Whatever is in force, a read never invents a value outside the domain. */
    expect(before.recallLimit).toBeGreaterThan(0);

    const { configId } = await updateRetrievalConfig({
      actor,
      values: { ...DEFAULT_RETRIEVAL_SETTINGS, recallLimit: 12, cacheTtlSeconds: 0 },
      reason: 'integration: narrower recall, cache off',
    });
    configIds.push(configId);

    const active = await activeRetrievalSettings();
    expect(active.configId).toBe(configId);
    expect(active.recallLimit).toBe(12);
    expect(active.cacheTtlSeconds).toBe(0);
    expect(active.rrfK).toBe(DEFAULT_RETRIEVAL_SETTINGS.rrfK);

    const { current, history } = await readRetrievalConfiguration();
    expect(current.configId).toBe(configId);
    expect(history[0]?.id).toBe(configId);

    const [audit] = await db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.targetId, configId));
    expect(audit?.action).toBe('retrieval_config.update');
    expect(audit?.reason).toBe('integration: narrower recall, cache off');
    expect((audit?.beforeValue as { recallLimit: number }).recallLimit).toBe(before.recallLimit);
    expect((audit?.afterValue as { recallLimit: number }).recallLimit).toBe(12);
  });

  it('refuses a bad value or a missing reason without writing a row', async () => {
    const actor = { administratorId, email: 'ops@example.test' };
    const { current } = await readRetrievalConfiguration();

    await expect(
      updateRetrievalConfig({
        actor,
        values: { ...DEFAULT_RETRIEVAL_SETTINGS, recallLimit: 0 },
        reason: 'integration: bad value',
      }),
    ).rejects.toMatchObject({ field: 'recallLimit', code: 'out_of_range' });
    await expect(
      updateRetrievalConfig({ actor, values: DEFAULT_RETRIEVAL_SETTINGS, reason: '   ' }),
    ).rejects.toMatchObject({ code: 'reason_required' });

    const after = await readRetrievalConfiguration();
    expect(after.current.configId).toBe(current.configId);
  });
});
