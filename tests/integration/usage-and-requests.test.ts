/**
 * The dashboard data plane, against a real database. architecture.md 6.3 and
 * 11.1: the usage summary is rebuilt from events before every read, the
 * request log records outcomes without ever holding the query text, and both
 * are workspace-scoped behind an API key.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { eq, inArray, like, sql } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';
process.env.API_KEY_HASH_SECRET ??= 'test-api-key-hash-secret-000000000000';

const { buildVersion, memoryObjectStore, publishVersion } = await import(
  '@/lib/application/ingestion'
);
const { queryDocs } = await import('@/lib/application/retrieval/query-docs');
const { rebuildUsageSummary } = await import('@/lib/application/plans');
const { hashApiKey } = await import('@/lib/application/auth/api-key');
const { createPlatformLibrary } = await import(
  '@/lib/application/administration/manage-platform-libraries'
);
const { EMBEDDING_DIMENSIONS } = await import('@/lib/infrastructure/ai/providers');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');
const { GET: usageRoute } = await import('@/app/api/v1/usage/route');
const { GET: requestsRoute } = await import('@/app/api/v1/requests/route');

const actor = { administratorId: null as unknown as string, email: 'ops@example.test' };
const created: string[] = [];
const workspaces: string[] = [];
const planVersions: string[] = [];
const store = memoryObjectStore();

const nullCache = {
  get: async () => null,
  set: async () => {},
  invalidateTag: async () => {},
};
const noEmbeddings = {
  embeddings: () => {
    throw new Error('not configured');
  },
  rerank: () => {
    throw new Error('not configured');
  },
  cache: () => nullCache,
  configured: () => ({ embeddings: false, rerank: false }),
};

function caller(workspaceId: string | null, requestId = `req_${crypto.randomUUID()}`) {
  return { workspaceId, apiKeyId: null, requestId, anonymous: workspaceId === null };
}

function dependencies() {
  return {
    async fetchSnapshot() {
      return {
        files: [
          {
            path: 'docs/ledger.md',
            url: 'https://example.test/ledger',
            content: '# Ledger Notes\n\nThe flumequarry ledger reconciles nightly against receipts.',
          },
        ],
        config: {
          projectTitle: null,
          description: null,
          branch: null,
          folders: [],
          excludeFolders: [],
          excludeFiles: [],
          rules: [],
        },
        revision: 'fixture-revision',
        lastModifiedAt: new Date(),
        hasLicense: true,
        stale: false,
      };
    },
    embeddings: () => ({
      model: 'fixture-embed-1',
      dimensions: EMBEDDING_DIMENSIONS,
      async embed(texts: string[]) {
        return texts.map((text) =>
          Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => ((text.length + i) % 17) / 17),
        );
      },
    }),
    store: () => store,
    configured: () => ({ embeddings: true, storage: true }),
  };
}

async function publishedLibrary(slug: string): Promise<string> {
  const { libraryId } = await createPlatformLibrary({
    actor,
    title: `Usage fixture ${slug}`,
    publicId: `/websites/${slug}`,
    sourceType: 'website',
    location: `https://example.test/${slug}`,
    refreshPolicy: 'manual',
    language: 'en',
    reason: 'integration test fixture',
  });
  created.push(libraryId);
  const built = await buildVersion({ libraryId, operationId: uuidv7(), dependencies: dependencies() });
  if (!built.changed) throw new Error('fixture build produced no version');
  await publishVersion({ libraryId, versionId: built.versionId });
  await db()
    .update(schema.library)
    .set({ lifecycleStatus: 'published' })
    .where(eq(schema.library.id, libraryId));
  return libraryId;
}

async function workspaceWithKey(): Promise<{ workspaceId: string; key: string }> {
  const database = db();
  const workspaceId = crypto.randomUUID();
  workspaces.push(workspaceId);
  await database.insert(schema.workspace).values({ id: workspaceId, name: 'usage-test' });

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
    apiKeyLimit: 5,
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

  const key = `mm_test_${crypto.randomUUID().replace(/-/g, '')}`;
  await database.insert(schema.apiKey).values({
    id: uuidv7(),
    workspaceId,
    name: 'usage test key',
    keyHash: await hashApiKey(key),
    keyPrefix: 'mm_test_',
    lastFour: key.slice(-4),
    scopes: ['retrieval'],
    environment: 'test',
  });
  return { workspaceId, key };
}

function get(url: string, key: string): NextRequest {
  return new NextRequest(`https://api.example.test${url}`, {
    headers: { authorization: `Bearer ${key}` },
  });
}

describeWithDb('usage and request log', () => {
  afterAll(async () => {
    const database = db();
    if (created.length > 0) {
      await database
        .update(schema.library)
        .set({ currentVersionId: null })
        .where(inArray(schema.library.id, created));
      await database.delete(schema.usageEvent).where(inArray(schema.usageEvent.libraryId, created));
      await database
        .delete(schema.libraryProfileVector)
        .where(inArray(schema.libraryProfileVector.libraryId, created));
      await database
        .delete(schema.libraryProfile)
        .where(inArray(schema.libraryProfile.libraryId, created));
      await database.delete(schema.chunk).where(inArray(schema.chunk.libraryId, created));
      await database.delete(schema.document).where(inArray(schema.document.libraryId, created));
      await database
        .delete(schema.libraryVersion)
        .where(inArray(schema.libraryVersion.libraryId, created));
      await database
        .delete(schema.libraryScore)
        .where(inArray(schema.libraryScore.libraryId, created));
      await database.delete(schema.source).where(inArray(schema.source.libraryId, created));
      await database
        .delete(schema.libraryAlias)
        .where(inArray(schema.libraryAlias.libraryId, created));
      await database.delete(schema.auditLog).where(inArray(schema.auditLog.targetId, created));
      await database.delete(schema.library).where(inArray(schema.library.id, created));
    }
    if (workspaces.length > 0) {
      await database
        .delete(schema.requestLog)
        .where(inArray(schema.requestLog.workspaceId, workspaces));
      await database
        .delete(schema.usageSummary)
        .where(inArray(schema.usageSummary.workspaceId, workspaces));
      await database
        .delete(schema.usageEvent)
        .where(inArray(schema.usageEvent.workspaceId, workspaces));
      await database
        .delete(schema.usageReservation)
        .where(inArray(schema.usageReservation.workspaceId, workspaces));
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
    /* Anonymous log rows this file created carry no workspace to key on. */
    await database
      .delete(schema.requestLog)
      .where(sql`${schema.requestLog.libraryPublicId} like '/websites/usage-%'`);
  });

  it('rebuilds the summary from events and reports quota over the API', async () => {
    const stamp = Date.now();
    await publishedLibrary(`usage-basic-${stamp}`);
    const { workspaceId, key } = await workspaceWithKey();
    const input = {
      libraryId: `/websites/usage-basic-${stamp}`,
      query: 'flumequarry ledger receipts',
      maxTokens: 4000,
      format: 'json' as const,
    };

    await queryDocs(caller(workspaceId), input, noEmbeddings);
    await queryDocs(caller(workspaceId), input, noEmbeddings);
    await queryDocs(caller(workspaceId), input, noEmbeddings);

    const response = await usageRoute(get('/api/v1/usage', key));
    expect(response.status).toBe(200);
    const overview = (await response.json()) as {
      callsThisPeriod: number;
      planAllowance: number;
      addonBalanceRemaining: number;
      buckets: { date: string; calls: number }[];
    };
    expect(overview.callsThisPeriod).toBe(3);
    expect(overview.planAllowance).toBe(100);
    const today = new Date().toISOString().slice(0, 10);
    expect(overview.buckets.find((bucket) => bucket.date === today)?.calls).toBe(3);

    /* The rebuild is idempotent: a second pass leaves the same buckets. */
    await rebuildUsageSummary(workspaceId);
    const rows = await db()
      .select()
      .from(schema.usageSummary)
      .where(eq(schema.usageSummary.workspaceId, workspaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.calls).toBe(3);
  });

  it('logs outcomes without the query text, refusals included', async () => {
    const stamp = Date.now();
    await publishedLibrary(`usage-log-${stamp}`);
    const { workspaceId, key } = await workspaceWithKey();

    const served = caller(workspaceId);
    await queryDocs(
      served,
      {
        libraryId: `/websites/usage-log-${stamp}`,
        query: 'a very identifiable secret question',
        maxTokens: 4000,
        format: 'json',
      },
      noEmbeddings,
    );
    await queryDocs(
      caller(workspaceId),
      { libraryId: '/none/missing', query: 'x', maxTokens: 4000, format: 'json' },
      noEmbeddings,
    ).catch(() => {});

    const response = await requestsRoute(get('/api/v1/requests', key));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      requests: { statusCode: number; libraryPublicId: string | null; requestId: string }[];
    };
    const ok = body.requests.find((row) => row.requestId === served.requestId);
    expect(ok?.statusCode).toBe(200);
    expect(ok?.libraryPublicId).toBe(`/websites/usage-log-${stamp}`);
    expect(body.requests.some((row) => row.statusCode === 404)).toBe(true);

    /* 17.1: the log never holds the query. */
    const raw = await db()
      .select()
      .from(schema.requestLog)
      .where(like(schema.requestLog.requestId, `${served.requestId}`));
    expect(JSON.stringify(raw)).not.toContain('identifiable secret question');
  });
});
