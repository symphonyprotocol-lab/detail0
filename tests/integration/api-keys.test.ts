/**
 * Key management, against a real database. architecture.md 5.1: the plaintext
 * works exactly as minted and is never stored, the plan's key limit gates
 * creation, and a revoked key stops authenticating without losing its row.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';
process.env.API_KEY_HASH_SECRET ??= 'test-api-key-hash-secret-000000000000';

const { createApiKey, listApiKeys, revokeApiKey, resolveApiKey } = await import(
  '@/lib/application/auth'
);
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');

const workspaces: string[] = [];
const planVersions: string[] = [];

async function workspaceOnPlan(apiKeyLimit: number): Promise<string> {
  const database = db();
  const workspaceId = crypto.randomUUID();
  workspaces.push(workspaceId);
  await database.insert(schema.workspace).values({ id: workspaceId, name: 'keys-test' });

  const planVersionId = uuidv7();
  planVersions.push(planVersionId);
  await database.insert(schema.planVersion).values({
    id: planVersionId,
    planId: 'pro',
    priceMinor: 2000,
    currency: 'USD',
    monthlyCalls: 100,
    libraryLimit: 10,
    librarySizeBytesLimit: 1_000_000,
    apiKeyLimit,
    shareRateBps: 2000,
    capabilities: {},
    createdAt: new Date('2000-01-01T00:00:00Z'),
  });
  await database.insert(schema.subscription).values({
    id: uuidv7(),
    workspaceId,
    planVersionId,
    status: 'active',
    periodStart: new Date(Date.now() - 86_400_000),
    periodEnd: new Date(Date.now() + 86_400_000),
  });
  return workspaceId;
}

describeWithDb('api key management', () => {
  afterAll(async () => {
    const database = db();
    if (workspaces.length > 0) {
      await database.delete(schema.apiKey).where(inArray(schema.apiKey.workspaceId, workspaces));
      await database
        .delete(schema.subscription)
        .where(inArray(schema.subscription.workspaceId, workspaces));
      await database.delete(schema.workspace).where(inArray(schema.workspace.id, workspaces));
    }
    if (planVersions.length > 0) {
      await database
        .delete(schema.planVersion)
        .where(inArray(schema.planVersion.id, planVersions));
    }
  });

  it('mints a working key once, lists the mask, enforces the limit, revokes', async () => {
    const workspaceId = await workspaceOnPlan(2);

    const first = await createApiKey({ role: 'owner', workspaceId, name: 'ci retrieval' });
    expect(first.key.startsWith('mm_live_')).toBe(true);

    /* The plaintext authenticates; the table holds only its hash. */
    const principal = await resolveApiKey(`Bearer ${first.key}`);
    expect(principal?.workspaceId).toBe(workspaceId);
    const [stored] = await db()
      .select({ keyHash: schema.apiKey.keyHash })
      .from(schema.apiKey)
      .where(eq(schema.apiKey.id, first.view.id));
    expect(stored?.keyHash).not.toContain(first.key.slice(-12));

    const listed = await listApiKeys(workspaceId);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.masked.endsWith(first.key.slice(-4))).toBe(true);
    expect(JSON.stringify(listed)).not.toContain(first.key);

    await createApiKey({ role: 'owner', workspaceId, name: 'second' });
    await expect(createApiKey({ role: 'owner', workspaceId, name: 'third' })).rejects.toMatchObject({
      code: 'api_key_limit_exceeded',
    });

    await revokeApiKey({ role: 'owner', workspaceId, keyId: first.view.id });
    await expect(resolveApiKey(`Bearer ${first.key}`)).rejects.toMatchObject({
      code: 'invalid_api_key',
    });
    expect(await listApiKeys(workspaceId)).toHaveLength(1);

    /* A stranger cannot revoke someone else's key. */
    const stranger = await workspaceOnPlan(2);
    const second = (await listApiKeys(workspaceId))[0]!;
    await revokeApiKey({ role: 'owner', workspaceId: stranger, keyId: second.id });
    expect(await listApiKeys(workspaceId)).toHaveLength(1);
  });

  /**
   * requirement.md 3.3: API keys are the owner's. Both actions are reached
   * through a server action -- a public endpoint with a generated name -- so
   * the page choosing not to render a button decides nothing.
   */
  it('refuses to mint or revoke a key for anyone but the owner', async () => {
    const workspaceId = await workspaceOnPlan(2);
    const mine = await createApiKey({ role: 'owner', workspaceId, name: 'owner key' });

    for (const role of ['admin', 'developer', 'viewer'] as const) {
      await expect(createApiKey({ role, workspaceId, name: 'not mine' })).rejects.toMatchObject({
        code: 'access_denied',
      });
      await expect(
        revokeApiKey({ role, workspaceId, keyId: mine.view.id }),
      ).rejects.toMatchObject({ code: 'access_denied' });
    }

    /* Still live: none of those refusals touched it. */
    expect((await resolveApiKey(`Bearer ${mine.key}`))?.workspaceId).toBe(workspaceId);
  });
});
