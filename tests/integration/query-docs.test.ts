/**
 * Retrieval within one library, against a real database. architecture.md 9.2
 * and 11.1 together, because the order is the point: visibility before
 * reservation, reservation before recall, and exactly one usage event per
 * admitted call however the request is retried.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

const { buildVersion, memoryObjectStore, publishVersion } = await import(
  '@/lib/application/ingestion'
);
const { queryDocs } = await import('@/lib/application/retrieval/query-docs');
const { createPlatformLibrary } = await import(
  '@/lib/application/administration/manage-platform-libraries'
);
const { EMBEDDING_DIMENSIONS } = await import('@/lib/infrastructure/ai/providers');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');

const actor = { administratorId: null as unknown as string, email: 'ops@example.test' };
const created: string[] = [];
const workspaces: string[] = [];
const planVersions: string[] = [];
const store = memoryObjectStore();

const noEmbeddings = {
  embeddings: () => {
    throw new Error('not configured');
  },
  configured: () => ({ embeddings: false }),
};

const FILES = [
  {
    path: 'docs/beetles.md',
    url: 'https://example.test/beetles',
    content:
      '# Rove beetles\n\nParaphrased advice on rove beetle exposure: avoid crushing the insect against skin.\n\n## Treatment\n\nRinse the area with water and consult a doctor if blisters appear.',
  },
  {
    path: 'docs/moths.md',
    url: 'https://example.test/moths',
    content: '# Moths\n\nMoths navigate by moonlight and are drawn to lamps at night.',
  },
];

function dependenciesFor(files: typeof FILES) {
  return {
    async fetchSnapshot() {
      return {
        files,
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

async function publishedLibrary(slug: string, files = FILES): Promise<string> {
  const { libraryId } = await createPlatformLibrary({
    actor,
    title: `Query fixture ${slug}`,
    publicId: `/websites/${slug}`,
    sourceType: 'website',
    location: `https://example.test/${slug}`,
    refreshPolicy: 'manual',
    language: 'en',
    reason: 'integration test fixture',
  });
  created.push(libraryId);
  const built = await buildVersion({
    libraryId,
    operationId: uuidv7(),
    dependencies: dependenciesFor(files),
  });
  if (!built.changed) throw new Error('fixture build produced no version');
  await publishVersion({ libraryId, versionId: built.versionId });
  await db()
    .update(schema.library)
    .set({ lifecycleStatus: 'published' })
    .where(eq(schema.library.id, libraryId));
  return libraryId;
}

/** A workspace subscribed to a plan version with the given allowance. */
async function workspaceOnPlan(monthlyCalls: number): Promise<string> {
  const database = db();
  const workspaceId = crypto.randomUUID();
  workspaces.push(workspaceId);
  await database.insert(schema.workspace).values({ id: workspaceId, name: 'query-docs-test' });

  const planVersionId = uuidv7();
  planVersions.push(planVersionId);
  await database.insert(schema.planVersion).values({
    id: planVersionId,
    planId: 'pro',
    priceMinor: 2000,
    currency: 'USD',
    monthlyCalls,
    libraryLimit: 10,
    librarySizeBytesLimit: 1_000_000,
    apiKeyLimit: 5,
    shareRateBps: 2000,
    capabilities: {},
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

function caller(workspaceId: string | null, requestId = `req_${crypto.randomUUID()}`) {
  return { workspaceId, apiKeyId: null, requestId, anonymous: workspaceId === null };
}

describeWithDb('query-docs', () => {
  afterAll(async () => {
    const database = db();
    if (created.length > 0) {
      await database
        .update(schema.library)
        .set({ currentVersionId: null })
        .where(inArray(schema.library.id, created));
      await database
        .delete(schema.usageEvent)
        .where(inArray(schema.usageEvent.libraryId, created));
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
        .delete(schema.usageEvent)
        .where(inArray(schema.usageEvent.workspaceId, workspaces));
      await database
        .delete(schema.usageReservation)
        .where(inArray(schema.usageReservation.workspaceId, workspaces));
      await database
        .delete(schema.addonGrant)
        .where(inArray(schema.addonGrant.workspaceId, workspaces));
      await database
        .delete(schema.subscription)
        .where(inArray(schema.subscription.workspaceId, workspaces));
      await database
        .delete(schema.workspace)
        .where(inArray(schema.workspace.id, workspaces));
    }
    if (planVersions.length > 0) {
      await database
        .delete(schema.planVersion)
        .where(inArray(schema.planVersion.id, planVersions));
    }
  });

  it('returns cited chunks and meters exactly one call', async () => {
    const stamp = Date.now();
    const libraryId = await publishedLibrary(`qd-basic-${stamp}`);
    const workspaceId = await workspaceOnPlan(100);
    const who = caller(workspaceId);

    const output = await queryDocs(
      who,
      { libraryId: `/websites/qd-basic-${stamp}`, query: 'rove beetle treatment', maxTokens: 4000, format: 'json' },
      noEmbeddings,
    );

    expect(output.chunks.length).toBeGreaterThan(0);
    const top = output.chunks[0]!;
    expect(top.text).toContain('beetle');
    expect(top.citation.sourceUrl).toBe('https://example.test/beetles');
    expect(top.citation.documentTitle).toBe('Rove beetles');
    expect(output.version.length).toBeGreaterThan(0);
    expect(output.usage.callsUsed).toBe(1);
    expect(output.usage.planAllowanceRemaining).toBe(99);

    const events = await db()
      .select()
      .from(schema.usageEvent)
      .where(eq(schema.usageEvent.requestId, who.requestId));
    expect(events).toHaveLength(1);
    expect(events[0]?.debitSource).toBe('plan');
    expect(events[0]?.libraryId).toBe(libraryId);
    expect(events[0]?.returnedTokens).toBeGreaterThan(0);
  });

  it('meters a retried request once', async () => {
    const stamp = Date.now();
    await publishedLibrary(`qd-retry-${stamp}`);
    const workspaceId = await workspaceOnPlan(100);
    const who = caller(workspaceId, `req_retry_${stamp}`);
    const input = {
      libraryId: `/websites/qd-retry-${stamp}`,
      query: 'moths at night',
      maxTokens: 4000,
      format: 'json' as const,
    };

    await queryDocs(who, input, noEmbeddings);
    await queryDocs(who, input, noEmbeddings);

    const events = await db()
      .select()
      .from(schema.usageEvent)
      .where(eq(schema.usageEvent.requestId, who.requestId));
    expect(events).toHaveLength(1);
  });

  it('refuses the call after the allowance, then spends the pack', async () => {
    const stamp = Date.now();
    await publishedLibrary(`qd-quota-${stamp}`);
    const workspaceId = await workspaceOnPlan(1);
    const input = {
      libraryId: `/websites/qd-quota-${stamp}`,
      query: 'moths at night',
      maxTokens: 4000,
      format: 'json' as const,
    };

    await queryDocs(caller(workspaceId), input, noEmbeddings);

    await expect(queryDocs(caller(workspaceId), input, noEmbeddings)).rejects.toMatchObject({
      code: 'quota_exceeded',
    });

    /* A pack with balance turns the same refusal into an addon debit. */
    const grantId = uuidv7();
    await db().insert(schema.addonGrant).values({
      id: grantId,
      workspaceId,
      callsGranted: 1,
      callsConsumed: 0,
      priceMinor: 500,
    });

    const spent = caller(workspaceId);
    const output = await queryDocs(spent, input, noEmbeddings);
    expect(output.usage.addonBalanceRemaining).toBe(0);

    const [event] = await db()
      .select()
      .from(schema.usageEvent)
      .where(eq(schema.usageEvent.requestId, spent.requestId));
    expect(event?.debitSource).toBe('addon');
    expect(event?.addonGrantId).toBe(grantId);

    const [grant] = await db()
      .select()
      .from(schema.addonGrant)
      .where(eq(schema.addonGrant.id, grantId));
    expect(grant?.callsConsumed).toBe(1);

    /* Allowance and pack both empty: the fourth call is refused again. */
    await expect(queryDocs(caller(workspaceId), input, noEmbeddings)).rejects.toMatchObject({
      code: 'quota_exceeded',
    });
  });

  it('serves anonymous callers on public libraries without metering', async () => {
    const stamp = Date.now();
    await publishedLibrary(`qd-anon-${stamp}`);

    const output = await queryDocs(
      caller(null),
      { libraryId: `/websites/qd-anon-${stamp}`, query: 'moonlight', maxTokens: 4000, format: 'json' },
      noEmbeddings,
    );

    expect(output.chunks.length).toBeGreaterThan(0);
    expect(output.usage.planAllowanceRemaining).toBe(0);
  });

  it('keeps a private library indistinguishable from a missing one', async () => {
    const stamp = Date.now();
    const libraryId = await publishedLibrary(`qd-private-${stamp}`);
    const owner = await workspaceOnPlan(100);
    await db()
      .update(schema.library)
      .set({ visibility: 'private', ownerWorkspaceId: owner })
      .where(eq(schema.library.id, libraryId));

    try {
      const input = {
        libraryId: `/websites/qd-private-${stamp}`,
        query: 'moths',
        maxTokens: 4000,
        format: 'json' as const,
      };
      await expect(queryDocs(caller(null), input, noEmbeddings)).rejects.toMatchObject({
        code: 'library_not_found',
      });
      const stranger = await workspaceOnPlan(100);
      await expect(queryDocs(caller(stranger), input, noEmbeddings)).rejects.toMatchObject({
        code: 'library_not_found',
      });
      const output = await queryDocs(caller(owner), input, noEmbeddings);
      expect(output.chunks.length).toBeGreaterThan(0);
    } finally {
      await db()
        .update(schema.library)
        .set({ ownerWorkspaceId: null })
        .where(eq(schema.library.id, libraryId));
    }
  });

  it('trims strictly to maxTokens without cutting a chunk', async () => {
    const stamp = Date.now();
    await publishedLibrary(`qd-trim-${stamp}`);

    const output = await queryDocs(
      caller(null),
      { libraryId: `/websites/qd-trim-${stamp}`, query: 'rove beetle treatment', maxTokens: 256, format: 'json' },
      noEmbeddings,
    );

    const total = output.chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
    expect(total).toBeLessThanOrEqual(256);
  });
});
