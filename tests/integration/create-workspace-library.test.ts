/**
 * A workspace creating its own library, end to end: the wizard's use case
 * writes the rows and queues the build, the drain builds and publishes it,
 * and the owner can query their private library -- while the plan's library
 * limit and public-id uniqueness refuse what they should.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

const { createWorkspaceLibrary } = await import('@/lib/application/libraries');
const { runOperation, memoryObjectStore } = await import('@/lib/application/ingestion');
const { queryDocs } = await import('@/lib/application/retrieval/query-docs');
const { EMBEDDING_DIMENSIONS } = await import('@/lib/infrastructure/ai/providers');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');

const workspaces: string[] = [];
const libraries: string[] = [];
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

function dependencies() {
  return {
    async fetchSnapshot() {
      return {
        files: [
          {
            path: 'docs/handbook.md',
            url: 'https://docs.example.test/handbook',
            content: '# Team Handbook\n\nThe quartzloft onboarding checklist lives in this handbook.',
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

async function workspaceOnPlan(libraryLimit: number): Promise<string> {
  const database = db();
  const workspaceId = crypto.randomUUID();
  workspaces.push(workspaceId);
  await database.insert(schema.workspace).values({ id: workspaceId, name: 'create-lib-test' });

  const planVersionId = uuidv7();
  planVersions.push(planVersionId);
  await database.insert(schema.planVersion).values({
    id: planVersionId,
    planId: 'pro',
    priceMinor: 2000,
    currency: 'USD',
    monthlyCalls: 1_000,
    libraryLimit,
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
  return workspaceId;
}

describeWithDb('workspace library creation', () => {
  afterAll(async () => {
    const database = db();
    if (libraries.length > 0) {
      await database
        .delete(schema.workflowOperation)
        .where(inArray(schema.workflowOperation.libraryId, libraries));
      await database
        .update(schema.library)
        .set({ currentVersionId: null })
        .where(inArray(schema.library.id, libraries));
      await database
        .delete(schema.usageEvent)
        .where(inArray(schema.usageEvent.libraryId, libraries));
      await database
        .delete(schema.libraryProfileVector)
        .where(inArray(schema.libraryProfileVector.libraryId, libraries));
      await database
        .delete(schema.libraryProfile)
        .where(inArray(schema.libraryProfile.libraryId, libraries));
      await database.delete(schema.chunk).where(inArray(schema.chunk.libraryId, libraries));
      await database.delete(schema.document).where(inArray(schema.document.libraryId, libraries));
      await database
        .delete(schema.libraryVersion)
        .where(inArray(schema.libraryVersion.libraryId, libraries));
      await database
        .delete(schema.libraryScore)
        .where(inArray(schema.libraryScore.libraryId, libraries));
      await database.delete(schema.source).where(inArray(schema.source.libraryId, libraries));
      await database.delete(schema.library).where(inArray(schema.library.id, libraries));
    }
    if (workspaces.length > 0) {
      await database
        .delete(schema.requestLog)
        .where(inArray(schema.requestLog.workspaceId, workspaces));
      await database
        .delete(schema.usageEvent)
        .where(inArray(schema.usageEvent.workspaceId, workspaces));
      await database
        .delete(schema.usageReservation)
        .where(inArray(schema.usageReservation.workspaceId, workspaces));
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

  it('creates, queues, builds and serves a private library to its owner', async () => {
    const stamp = Date.now();
    const workspaceId = await workspaceOnPlan(5);

    const created = await createWorkspaceLibrary({
      role: 'owner',
      workspaceId,
      title: 'Team handbook',
      visibility: 'private',
      sourceType: 'website',
      location: 'https://docs.example.test/handbook',
      slug: `handbook-${stamp}`,
      description: 'Internal onboarding notes',
      language: 'en',
    });
    libraries.push(created.libraryId);
    expect(created.publicId).toBe(`/websites/handbook-${stamp}`);

    const [row] = await db()
      .select()
      .from(schema.library)
      .where(eq(schema.library.id, created.libraryId));
    expect(row?.ownerWorkspaceId).toBe(workspaceId);
    expect(row?.visibility).toBe('private');
    expect(row?.lifecycleStatus).toBe('draft');

    /* The queued operation is the whole hand-off: the drain builds it. */
    const outcome = await runOperation({
      operationId: created.operationId,
      dependencies: dependencies(),
    });
    expect(outcome.status).toBe('succeeded');

    /* Draft + private: queryable by the owner (lifecycle gates the catalogue,
       not the owner's own access -- but retrieval requires published+ready,
       so publish the lifecycle as the console eventually would). */
    await db()
      .update(schema.library)
      .set({ lifecycleStatus: 'published' })
      .where(eq(schema.library.id, created.libraryId));

    const owner = { workspaceId, apiKeyId: null, requestId: `req_${crypto.randomUUID()}`, anonymous: false };
    const output = await queryDocs(
      owner,
      { libraryId: created.publicId, query: 'quartzloft onboarding', maxTokens: 4000, format: 'json' },
      noEmbeddings,
    );
    expect(output.chunks.length).toBeGreaterThan(0);

    /* A stranger still meets a 404-shaped refusal. */
    await expect(
      queryDocs(
        { workspaceId: null, apiKeyId: null, requestId: `req_${crypto.randomUUID()}`, anonymous: true },
        { libraryId: created.publicId, query: 'quartzloft', maxTokens: 4000, format: 'json' },
        noEmbeddings,
      ),
    ).rejects.toMatchObject({ code: 'library_not_found' });
  });

  it('enforces the plan limit and public-id uniqueness', async () => {
    const stamp = Date.now();
    const workspaceId = await workspaceOnPlan(1);

    const first = await createWorkspaceLibrary({
      role: 'owner',
      workspaceId,
      title: 'Only one',
      visibility: 'private',
      sourceType: 'openapi',
      location: 'https://api.example.test/openapi.json',
      slug: `only-one-${stamp}`,
    });
    libraries.push(first.libraryId);

    await expect(
      createWorkspaceLibrary({
        role: 'owner',
        workspaceId,
        title: 'Second',
        visibility: 'private',
        sourceType: 'openapi',
        location: 'https://api.example.test/openapi.json',
        slug: `second-${stamp}`,
      }),
    ).rejects.toMatchObject({ code: 'library_limit_exceeded' });

    const other = await workspaceOnPlan(5);
    await expect(
      createWorkspaceLibrary({
        role: 'owner',
      workspaceId: other,
        title: 'Duplicate id',
        visibility: 'private',
        sourceType: 'openapi',
        location: 'https://api.example.test/openapi.json',
        slug: `only-one-${stamp}`,
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });

    await expect(
      createWorkspaceLibrary({
        role: 'owner',
      workspaceId: other,
        title: 'Bad location',
        visibility: 'private',
        sourceType: 'github',
        location: 'not a repository',
        slug: '',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
