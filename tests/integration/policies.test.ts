/**
 * The Policy Engine against a real database. architecture.md 10: PATCH mints
 * immutable versions, Library Search filters candidates at the metadata
 * stage, Context Retrieval refuses with the stable reason code before
 * reserving anything, and an anonymous caller -- who has no workspace --
 * has no policy.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';
process.env.API_KEY_HASH_SECRET ??= 'test-api-key-hash-secret-000000000000';

const { buildVersion, memoryObjectStore, publishVersion } = await import(
  '@/lib/application/ingestion'
);
const { queryDocs } = await import('@/lib/application/retrieval/query-docs');
const { resolveLibrary } = await import('@/lib/application/retrieval/resolve-library');
const { hashApiKey } = await import('@/lib/application/auth/api-key');
const { createPlatformLibrary } = await import(
  '@/lib/application/administration/manage-platform-libraries'
);
const { EMBEDDING_DIMENSIONS } = await import('@/lib/infrastructure/ai/providers');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');
const { GET: policiesGet, PATCH: policiesPatch } = await import('@/app/api/v1/policies/route');

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
const noResolveEmbeddings = {
  embeddings: () => {
    throw new Error('not configured');
  },
  configured: () => ({ embeddings: false }),
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
            path: 'docs/notes.md',
            url: 'https://example.test/notes',
            content:
              '# Policy Notes\n\nThe quarterly kelpwatch report covers unusual seaweed growth patterns.',
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
    title: `Policy fixture ${slug}`,
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
  await database.insert(schema.workspace).values({ id: workspaceId, name: 'policy-test' });

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
    /* Backdated so the live catalogue's newest 'pro' version stays the seeded
       one -- these fixture rows must not win currentPlanVersion() races with
       the plan-configuration suite running in a parallel worker. */
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
    name: 'policy test key',
    keyHash: await hashApiKey(key),
    keyPrefix: 'mm_test_',
    lastFour: key.slice(-4),
    scopes: ['retrieval'],
    environment: 'test',
  });
  return { workspaceId, key };
}

function patchRequest(key: string, body: unknown): NextRequest {
  return new NextRequest('https://api.example.test/api/v1/policies', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describeWithDb('policy engine', () => {
  afterAll(async () => {
    const database = db();
    if (workspaces.length > 0) {
      const versions = await database
        .select({ id: schema.policyVersion.id })
        .from(schema.policyVersion)
        .where(inArray(schema.policyVersion.workspaceId, workspaces));
      const versionIds = versions.map((row) => row.id);
      if (versionIds.length > 0) {
        await database
          .delete(schema.policyLibraryEntry)
          .where(inArray(schema.policyLibraryEntry.policyVersionId, versionIds));
        await database
          .delete(schema.policyVersion)
          .where(inArray(schema.policyVersion.id, versionIds));
      }
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
  });

  it('mints immutable versions through PATCH and reads them back', async () => {
    const { workspaceId, key } = await workspaceWithKey();

    const first = await policiesPatch(
      patchRequest(key, { blocked: { add: ['/websites/somewhere'] } }),
    );
    expect(first.status).toBe(200);
    const v1 = (await first.json()) as { policyVersionId: string; policy: { blockedLibraries: string[] } };
    expect(v1.policy.blockedLibraries).toEqual(['/websites/somewhere']);

    const second = await policiesPatch(
      patchRequest(key, { mode: 'quality', quality: { minTrustScore: 50 } }),
    );
    const v2 = (await second.json()) as {
      policyVersionId: string;
      policy: { mode: string; blockedLibraries: string[] };
    };
    expect(v2.policyVersionId).not.toBe(v1.policyVersionId);
    /* Incremental: the block list survives a patch that never mentioned it. */
    expect(v2.policy.blockedLibraries).toEqual(['/websites/somewhere']);

    const rows = await db()
      .select({ id: schema.policyVersion.id })
      .from(schema.policyVersion)
      .where(eq(schema.policyVersion.workspaceId, workspaceId));
    expect(rows).toHaveLength(2);

    const got = await policiesGet(
      new NextRequest('https://api.example.test/api/v1/policies', {
        headers: { authorization: `Bearer ${key}` },
      }),
    );
    const current = (await got.json()) as { policyVersionId: string };
    expect(current.policyVersionId).toBe(v2.policyVersionId);
  });

  it('blocks context retrieval with the stable reason, and only for that workspace', async () => {
    const stamp = Date.now();
    await publishedLibrary(`policy-block-${stamp}`);
    const { workspaceId, key } = await workspaceWithKey();
    await policiesPatch(patchRequest(key, { blocked: { add: [`/websites/policy-block-${stamp}`] } }));

    const input = {
      libraryId: `/websites/policy-block-${stamp}`,
      query: 'kelpwatch report',
      maxTokens: 4000,
      format: 'json' as const,
    };
    await expect(queryDocs(caller(workspaceId), input, noEmbeddings)).rejects.toMatchObject({
      code: 'access_rule_blocked',
      message: 'library_blocked',
    });

    /* No seat was reserved for a policy refusal. */
    const reservations = await db()
      .select()
      .from(schema.usageReservation)
      .where(eq(schema.usageReservation.workspaceId, workspaceId));
    expect(reservations).toHaveLength(0);

    /* The block is the workspace's own preference: anonymous still reads. */
    const open = await queryDocs(caller(null), input, noEmbeddings);
    expect(open.chunks.length).toBeGreaterThan(0);
  });

  it('filters search candidates at the metadata stage', async () => {
    const stamp = Date.now();
    await publishedLibrary(`policy-search-${stamp}`);
    const { workspaceId, key } = await workspaceWithKey();

    const before = await resolveLibrary(
      caller(workspaceId),
      { query: 'kelpwatch seaweed growth' },
      noResolveEmbeddings,
    );
    expect(before.results.map((r) => r.libraryId)).toContain(`/websites/policy-search-${stamp}`);

    await policiesPatch(
      patchRequest(key, { blocked: { add: [`/websites/policy-search-${stamp}`] } }),
    );
    const after = await resolveLibrary(
      caller(workspaceId),
      { query: 'kelpwatch seaweed growth' },
      noResolveEmbeddings,
    );
    expect(after.results.map((r) => r.libraryId)).not.toContain(
      `/websites/policy-search-${stamp}`,
    );
  });

  it('select mode admits only the allowlist, and excepted bypasses quality only', async () => {
    const stamp = Date.now();
    await publishedLibrary(`policy-sel-a-${stamp}`);
    await publishedLibrary(`policy-sel-b-${stamp}`);
    const { workspaceId, key } = await workspaceWithKey();
    await policiesPatch(
      patchRequest(key, {
        mode: 'select',
        allowed: { add: [`/websites/policy-sel-a-${stamp}`] },
      }),
    );

    const query = (slug: string) =>
      queryDocs(
        caller(workspaceId),
        { libraryId: `/websites/${slug}`, query: 'kelpwatch', maxTokens: 4000, format: 'json' as const },
        noEmbeddings,
      );
    await expect(query(`policy-sel-b-${stamp}`)).rejects.toMatchObject({
      code: 'access_rule_blocked',
      message: 'not_in_allowlist',
    });
    const allowed = await query(`policy-sel-a-${stamp}`);
    expect(allowed.chunks.length).toBeGreaterThan(0);

    /* Quality mode: an impossible threshold blocks all but the excepted. */
    await policiesPatch(
      patchRequest(key, {
        mode: 'quality',
        quality: { minTrustScore: 100 },
        excepted: { add: [`/websites/policy-sel-b-${stamp}`] },
      }),
    );
    await expect(query(`policy-sel-a-${stamp}`)).rejects.toMatchObject({
      message: 'below_trust_threshold',
    });
    const excepted = await query(`policy-sel-b-${stamp}`);
    expect(excepted.chunks.length).toBeGreaterThan(0);
  });
});
