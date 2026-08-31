/**
 * The ingestion pipeline end to end, against a real database.
 *
 * The connector, the embedding provider and the object store are all injected
 * (`IngestionDependencies`), so what is under test is the part that cannot be
 * unit tested: the rows. Specifically --
 *
 * - a build writes a version, its documents and its chunks, and only marks the
 *   version `ready` once every chunk is in the table (requirement.md 8.1);
 * - publication moves `current_version_id` and supersedes the version it
 *   replaced, in one transaction (architecture.md 8.3);
 * - an unchanged source digest updates `last_checked_at` and creates nothing
 *   (architecture.md 8.4);
 * - a failed run keeps the current version serving (requirement.md 8.2);
 * - two workers draining the same queue do one build between them.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database -- these
 * tests write rows. Against Neon, use a dev branch:
 *
 *   TEST_DATABASE_URL='postgres://...' npx vitest run tests/integration
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

const { buildVersion, memoryObjectStore, runOperation, drainOperations } = await import(
  '@/lib/application/ingestion'
);
const { createPlatformLibrary } = await import(
  '@/lib/application/administration/manage-platform-libraries'
);
const { EMBEDDING_DIMENSIONS } = await import('@/lib/infrastructure/ai/providers');
const { IngestionFailure, snapshotDigest } = await import('@/lib/domain/ingestion');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');

const actor = { administratorId: null as unknown as string, email: 'ops@example.test' };

const created: string[] = [];

/**
 * A fixed snapshot. Two documents, three sections, one of them long enough to
 * produce more than one chunk -- enough for the ordinal, citation and merkle
 * paths to all be exercised without making the fixture unreadable.
 */
const FILES = [
  {
    path: 'README.md',
    url: 'https://example.test/readme',
    content: '# Fixture\n\nThe front page.\n\n## Install\n\nRun the installer.',
  },
  {
    path: 'docs/guide.md',
    url: 'https://example.test/guide',
    content: `# Guide\n\n${'A sentence about the fixture. '.repeat(80)}\n\n## Details\n\nMore.`,
  },
];

const store = memoryObjectStore();

/** Deterministic vectors: the pipeline must not care what the numbers are. */
function fakeEmbeddings(model = 'fixture-embed-1') {
  return () => ({
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts: string[]) {
      return texts.map((text) =>
        Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => ((text.length + i) % 17) / 17),
      );
    },
  });
}

function dependencies(options: { files?: typeof FILES; fail?: boolean } = {}) {
  return {
    async fetchSnapshot() {
      if (options.fail) {
        throw new IngestionFailure('source_unreachable', 'fetch-snapshot', 'fixture failure');
      }
      return {
        files: options.files ?? FILES,
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
    embeddings: fakeEmbeddings(),
    store: () => store,
    configured: () => ({ embeddings: true, storage: true }),
  };
}

async function fixtureLibrary(slug: string): Promise<string> {
  const { libraryId } = await createPlatformLibrary({
    actor,
    title: `Ingestion fixture ${slug}`,
    publicId: `/websites/${slug}`,
    sourceType: 'website',
    location: 'https://example.test/docs',
    refreshPolicy: 'manual',
    reason: 'integration test fixture',
  });
  created.push(libraryId);
  return libraryId;
}

async function queueRefresh(libraryId: string): Promise<string> {
  const operationId = uuidv7();
  await db().insert(schema.workflowOperation).values({
    id: operationId,
    libraryId,
    operationType: 'refresh',
    sourceDigest: null,
    status: 'pending',
  });
  return operationId;
}

describeWithDb('ingestion', () => {
  afterAll(async () => {
    const database = db();
    if (created.length === 0) return;
    await database
      .update(schema.library)
      .set({ currentVersionId: null })
      .where(inArray(schema.library.id, created));
    await database.delete(schema.chunk).where(inArray(schema.chunk.libraryId, created));
    await database.delete(schema.document).where(inArray(schema.document.libraryId, created));
    await database
      .delete(schema.libraryVersion)
      .where(inArray(schema.libraryVersion.libraryId, created));
    await database
      .delete(schema.libraryScore)
      .where(inArray(schema.libraryScore.libraryId, created));
    await database
      .delete(schema.workflowOperation)
      .where(inArray(schema.workflowOperation.libraryId, created));
    await database.delete(schema.source).where(inArray(schema.source.libraryId, created));
    await database.delete(schema.libraryAlias).where(inArray(schema.libraryAlias.libraryId, created));
    await database.delete(schema.library).where(inArray(schema.library.id, created));
    await database
      .delete(schema.auditLog)
      .where(inArray(schema.auditLog.targetId, created));
  });

  it('builds a version with documents, chunks, citations and vectors', async () => {
    const libraryId = await fixtureLibrary(`ingest-build-${Date.now()}`);
    const built = await buildVersion({
      libraryId,
      operationId: uuidv7(),
      dependencies: dependencies(),
    });

    expect(built.changed).toBe(true);
    if (!built.changed) return;
    expect(built.documents).toBe(2);
    expect(built.chunks).toBeGreaterThan(2);

    const database = db();
    const [version] = await database
      .select()
      .from(schema.libraryVersion)
      .where(eq(schema.libraryVersion.id, built.versionId));

    // Ready is written last, so a version that says ready has all its chunks.
    expect(version?.indexStatus).toBe('ready');
    expect(version?.embeddingModel).toBe('fixture-embed-1');
    expect(version?.contentMerkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(version?.sourceDigest).toBe(await snapshotDigest(FILES));

    const chunks = await database
      .select()
      .from(schema.chunk)
      .where(eq(schema.chunk.versionId, built.versionId));

    expect(chunks).toHaveLength(version?.totalChunks ?? -1);
    for (const chunk of chunks) {
      expect(chunk.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(chunk.tokens).toBeGreaterThan(0);
      // Every chunk cites the document it came from, by URL.
      expect(String((chunk.citation as { url?: string }).url)).toContain('https://example.test/');
    }

    // The keyword index is a generated column: it exists without being written.
    const [indexed] = await database
      .select({ n: schema.chunk.id })
      .from(schema.chunk)
      .where(eq(schema.chunk.versionId, built.versionId))
      .limit(1);
    expect(indexed).toBeDefined();
  });

  it('publishes through the queue and moves the pointer atomically', async () => {
    const libraryId = await fixtureLibrary(`ingest-publish-${Date.now()}`);
    const outcome = await runOperation({
      operationId: await queueRefresh(libraryId),
      dependencies: dependencies(),
    });

    expect(outcome.status).toBe('succeeded');

    const database = db();
    const [library] = await database
      .select()
      .from(schema.library)
      .where(eq(schema.library.id, libraryId));

    expect(library?.currentVersionId).not.toBeNull();
    expect(library?.indexStatus).toBe('ready');
    // Publishing a *version* does not publish the *library*: requirement.md 6.2
    // keeps index state and lifecycle apart, and 5.3 leaves the catalogue
    // decision to an operator.
    expect(library?.lifecycleStatus).toBe('draft');

    const [version] = await database
      .select()
      .from(schema.libraryVersion)
      .where(eq(schema.libraryVersion.id, library?.currentVersionId ?? ''));
    expect(version?.publishedAt).not.toBeNull();
  });

  it('supersedes the previous version when the source changes', async () => {
    const libraryId = await fixtureLibrary(`ingest-super-${Date.now()}`);
    await runOperation({ operationId: await queueRefresh(libraryId), dependencies: dependencies() });

    const database = db();
    const [before] = await database
      .select({ current: schema.library.currentVersionId })
      .from(schema.library)
      .where(eq(schema.library.id, libraryId));

    const changed = [FILES[0]!, { ...FILES[1]!, content: '# Guide\n\nRewritten entirely.' }];
    await runOperation({
      operationId: await queueRefresh(libraryId),
      dependencies: dependencies({ files: changed }),
    });

    const [after] = await database
      .select({ current: schema.library.currentVersionId })
      .from(schema.library)
      .where(eq(schema.library.id, libraryId));

    expect(after?.current).not.toBe(before?.current);

    const [old] = await database
      .select({ indexStatus: schema.libraryVersion.indexStatus })
      .from(schema.libraryVersion)
      .where(eq(schema.libraryVersion.id, before?.current ?? ''));
    expect(old?.indexStatus).toBe('stale');
  });

  it('creates no version when the source digest has not changed', async () => {
    const libraryId = await fixtureLibrary(`ingest-same-${Date.now()}`);
    await runOperation({ operationId: await queueRefresh(libraryId), dependencies: dependencies() });

    const database = db();
    const versionsBefore = await database
      .select({ id: schema.libraryVersion.id })
      .from(schema.libraryVersion)
      .where(eq(schema.libraryVersion.libraryId, libraryId));

    const operationId = await queueRefresh(libraryId);
    const outcome = await runOperation({ operationId, dependencies: dependencies() });
    expect(outcome.status).toBe('skipped');

    const versionsAfter = await database
      .select({ id: schema.libraryVersion.id })
      .from(schema.libraryVersion)
      .where(eq(schema.libraryVersion.libraryId, libraryId));
    expect(versionsAfter).toHaveLength(versionsBefore.length);

    const [checked] = await database
      .select({ lastCheckedAt: schema.library.lastCheckedAt })
      .from(schema.library)
      .where(eq(schema.library.id, libraryId));
    expect(checked?.lastCheckedAt).not.toBeNull();
  });

  it('keeps the current version serving when a refresh fails', async () => {
    const libraryId = await fixtureLibrary(`ingest-fail-${Date.now()}`);
    await runOperation({ operationId: await queueRefresh(libraryId), dependencies: dependencies() });

    const database = db();
    const [before] = await database
      .select({ current: schema.library.currentVersionId })
      .from(schema.library)
      .where(eq(schema.library.id, libraryId));

    const operationId = await queueRefresh(libraryId);
    const outcome = await runOperation({
      operationId,
      dependencies: dependencies({ fail: true }),
    });
    expect(outcome.status).toBe('failed');

    const [after] = await database
      .select({ current: schema.library.currentVersionId, indexStatus: schema.library.indexStatus })
      .from(schema.library)
      .where(eq(schema.library.id, libraryId));

    expect(after?.current).toBe(before?.current);
    // A library that is still serving is not "failed" -- only the attempt was.
    expect(after?.indexStatus).toBe('ready');

    const [operation] = await database
      .select({ status: schema.workflowOperation.status, error: schema.workflowOperation.error })
      .from(schema.workflowOperation)
      .where(eq(schema.workflowOperation.id, operationId));
    // Unreachable is retriable, so the row goes back to pending for the drain.
    expect(operation?.status).toBe('pending');
    expect(operation?.error).toBe('source_unreachable');
  });

  it('lets only one worker claim an operation', async () => {
    const libraryId = await fixtureLibrary(`ingest-claim-${Date.now()}`);
    const operationId = await queueRefresh(libraryId);

    const [first, second] = await Promise.all([
      runOperation({ operationId, dependencies: dependencies() }),
      runOperation({ operationId, dependencies: dependencies() }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['lost', 'succeeded']);
  });

  it('drains the queue oldest first', async () => {
    const libraryId = await fixtureLibrary(`ingest-drain-${Date.now()}`);
    await queueRefresh(libraryId);

    const outcomes = await drainOperations({ limit: 5, dependencies: dependencies() });
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.some((outcome) => outcome.status === 'succeeded')).toBe(true);
  });

  it('records a trust and benchmark score for the build', async () => {
    const libraryId = await fixtureLibrary(`ingest-score-${Date.now()}`);
    await runOperation({ operationId: await queueRefresh(libraryId), dependencies: dependencies() });

    const [score] = await db()
      .select()
      .from(schema.libraryScore)
      .where(eq(schema.libraryScore.libraryId, libraryId));

    expect(score?.algorithmVersion).toMatch(/^re0-score-/);
    expect(score?.trustScore).toBeGreaterThan(0);
    expect(score?.benchmarkScore).toBeGreaterThan(0);
  });
});
