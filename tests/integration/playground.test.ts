/**
 * The playground's generation path and its accounting, against a real
 * database. architecture.md 9.5: retrieval is the shared function (and the
 * only metered step), zero context means no model call, unbound sentences are
 * dropped, provider failure degrades to chunks, and every completion lands in
 * the cost metric with the config's frozen prices. Plus the console side: a
 * config change mints an immutable version and an audit row.
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
const { askPlayground } = await import('@/lib/application/playground');
const { recordLlmCost, updateLlmConfig, readLlmConfiguration, activeLlmConfig } = await import(
  '@/lib/application/administration'
);
const { createPlatformLibrary } = await import(
  '@/lib/application/administration/manage-platform-libraries'
);
const { EMBEDDING_DIMENSIONS } = await import('@/lib/infrastructure/ai/providers');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');

const actor = { administratorId: null as unknown as string, email: 'ops@example.test' };
const created: string[] = [];
/* Every llm_config row this suite mints; cost events reference them, so the
   teardown can scope both deletes to fixture rows and leave a shared dev
   database's live configuration and cost ledger alone. */
const createdConfigIds: string[] = [];
const store = memoryObjectStore();

const nullCache = {
  get: async () => null,
  set: async () => {},
  invalidateTag: async () => {},
};
const retrieval = {
  embeddings: () => {
    throw new Error('not configured');
  },
  rerank: () => {
    throw new Error('not configured');
  },
  cache: () => nullCache,
  configured: () => ({ embeddings: false, rerank: false }),
};

const anonymous = { workspaceId: null, apiKeyId: null, requestId: '', anonymous: true };
const asAnonymous = () => ({ ...anonymous, requestId: `req_${crypto.randomUUID()}` });

const CONFIG = {
  id: '',
  baseUrl: 'https://llm.example.test/v1',
  model: 'fixture-llm-1',
  maxOutputTokens: 800,
  timeoutMs: 15_000,
  promptPriceMicro: 3_000_000,
  completionPriceMicro: 15_000_000,
  enabled: true,
  createdAt: new Date(),
};

function playgroundDeps(options: {
  completion?: string;
  fail?: boolean;
  config?: typeof CONFIG | null;
  calls?: { userMessage?: string }[];
}) {
  return {
    config: async () => (options.config === undefined ? CONFIG : options.config),
    keyPresent: () => true,
    recordCost: recordLlmCost,
    retrieval,
    llm: () => ({
      async generate(input: { userMessage: string }) {
        options.calls?.push({ userMessage: input.userMessage });
        if (options.fail) throw new Error('provider down');
        return { text: options.completion ?? '', promptTokens: 1_000, completionTokens: 500 };
      },
    }),
  };
}

function dependencies() {
  return {
    async fetchSnapshot() {
      return {
        files: [
          {
            path: 'docs/beetles.md',
            url: 'https://example.test/beetles',
            content:
              '# Rove beetles\n\nDo not crush the insect against skin. Rinse exposed skin with water.',
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
    title: `Playground fixture ${slug}`,
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

describeWithDb('playground', () => {
  afterAll(async () => {
    const database = db();
    if (createdConfigIds.length > 0) {
      await database
        .delete(schema.llmCostEvent)
        .where(inArray(schema.llmCostEvent.configId, createdConfigIds));
      await database
        .delete(schema.llmConfig)
        .where(inArray(schema.llmConfig.id, createdConfigIds));
    }
    if (created.length > 0) {
      await database
        .update(schema.library)
        .set({ currentVersionId: null })
        .where(inArray(schema.library.id, created));
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

  it('answers with bound citations, drops the unbindable, records the cost', async () => {
    const stamp = Date.now();
    await publishedLibrary(`pg-answer-${stamp}`);

    const [config] = await db()
      .insert(schema.llmConfig)
      .values({ ...CONFIG, id: uuidv7() })
      .returning();
    createdConfigIds.push(config!.id);

    const output = await askPlayground(
      asAnonymous(),
      { libraryId: `/websites/pg-answer-${stamp}`, question: 'how to treat rove beetle exposure' },
      playgroundDeps({
        config: { ...CONFIG, id: config!.id },
        completion:
          'Rinse the exposed skin with water. [ref:1] Uncited speculation here. Cited to nowhere. [ref:99]',
      }),
    );

    expect(output.kind).toBe('answer');
    expect(output.text).toBe('Rinse the exposed skin with water.');
    expect(output.citations).toHaveLength(1);
    expect(output.citations[0]!.chunkId).toBe(output.chunks[0]!.chunkId);

    const events = await db()
      .select()
      .from(schema.llmCostEvent)
      .where(eq(schema.llmCostEvent.configId, config!.id));
    expect(events).toHaveLength(1);
    expect(events[0]!.promptTokens).toBe(1_000);
    expect(events[0]!.completionTokens).toBe(500);
    // $3/M x 1000 + $15/M x 500 = $0.0105 = 10,500 micro-USD
    expect(events[0]!.costMicroUsd).toBe(10_500);
    expect(events[0]!.libraryPublicId).toBe(`/websites/pg-answer-${stamp}`);
  });

  it('never calls the model without context, and degrades on provider failure', async () => {
    const stamp = Date.now();
    await publishedLibrary(`pg-degrade-${stamp}`);

    const calls: { userMessage?: string }[] = [];
    const noContext = await askPlayground(
      asAnonymous(),
      { libraryId: `/websites/pg-degrade-${stamp}`, question: 'zzz-nothing-matches-zzz' },
      playgroundDeps({ calls }),
    );
    expect(noContext.kind).toBe('no_context');
    expect(calls).toHaveLength(0);

    const failed = await askPlayground(
      asAnonymous(),
      { libraryId: `/websites/pg-degrade-${stamp}`, question: 'rove beetle exposure' },
      playgroundDeps({ fail: true }),
    );
    expect(failed.kind).toBe('degraded');
    expect(failed.chunks.length).toBeGreaterThan(0);

    const unconfigured = await askPlayground(
      asAnonymous(),
      { libraryId: `/websites/pg-degrade-${stamp}`, question: 'rove beetle exposure' },
      playgroundDeps({ config: null }),
    );
    expect(unconfigured.kind).toBe('degraded');

    /* A completion whose every citation points nowhere binds no fact at all. */
    const unbound = await askPlayground(
      asAnonymous(),
      { libraryId: `/websites/pg-degrade-${stamp}`, question: 'rove beetle exposure' },
      playgroundDeps({
        config: { ...CONFIG, id: (await ensureConfig()).id },
        completion: 'Confident nonsense. [ref:42] More of it. [ref:77]',
      }),
    );
    expect(unbound.kind).toBe('degraded');
    expect(unbound.text).toBeNull();
  });

  it('passes chunks as untrusted data in the user message, never the system prompt', async () => {
    const stamp = Date.now();
    await publishedLibrary(`pg-prompt-${stamp}`);

    const calls: { userMessage?: string }[] = [];
    await askPlayground(
      asAnonymous(),
      { libraryId: `/websites/pg-prompt-${stamp}`, question: 'rove beetle exposure' },
      playgroundDeps({ completion: 'Rinse with water. [ref:1]', calls, config: { ...CONFIG, id: (await ensureConfig()).id } }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.userMessage).toContain('untrusted data');
    expect(calls[0]!.userMessage).toContain('rove beetle exposure');
  });

  it('mints immutable config versions with an audit trail, and aggregates spend', async () => {
    const administratorId = crypto.randomUUID();
    await db().insert(schema.administrator).values({
      id: administratorId,
      email: `llm-admin-${Date.now()}@example.test`,
      username: `llm-admin-${Date.now()}`,
      passwordHash: 'unused',
      status: 'active',
    });

    try {
      const first = await updateLlmConfig({
        actor: { administratorId, email: 'ops@example.test' },
        baseUrl: 'https://llm.example.test/v1',
        model: 'fixture-llm-1',
        maxOutputTokens: 800,
        timeoutMs: 15_000,
        promptPriceMicro: 3_000_000,
        completionPriceMicro: 15_000_000,
        enabled: true,
        reason: 'initial configuration',
      });
      const second = await updateLlmConfig({
        actor: { administratorId, email: 'ops@example.test' },
        baseUrl: 'https://llm.example.test/v1',
        model: 'fixture-llm-2',
        maxOutputTokens: 800,
        timeoutMs: 15_000,
        promptPriceMicro: 3_000_000,
        completionPriceMicro: 15_000_000,
        enabled: true,
        reason: 'switch model',
      });
      createdConfigIds.push(first.configId, second.configId);
      expect(second.configId).not.toBe(first.configId);

      const active = await activeLlmConfig();
      expect(active?.id).toBe(second.configId);
      expect(active?.model).toBe('fixture-llm-2');

      const audits = await db()
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.targetId, second.configId));
      expect(audits).toHaveLength(1);
      expect(audits[0]!.action).toBe('llm_config.update');

      await recordLlmCost({
        configId: second.configId,
        libraryPublicId: '/websites/spend-fixture',
        workspaceId: null,
        model: 'fixture-llm-2',
        promptTokens: 2_000,
        completionTokens: 1_000,
        costMicroUsd: 21_000,
        latencyMs: 500,
      });
      const { stats, history } = await readLlmConfiguration();
      expect(stats.monthCostMicroUsd).toBeGreaterThanOrEqual(21_000);
      expect(stats.monthCalls).toBeGreaterThanOrEqual(1);
      expect(stats.totalCostMicroUsd).toBeGreaterThanOrEqual(stats.monthCostMicroUsd);
      expect(history.length).toBeGreaterThanOrEqual(2);
    } finally {
      await db()
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.administratorId, administratorId));
      await db().delete(schema.administrator).where(eq(schema.administrator.id, administratorId));
    }
  });
});

async function ensureConfig() {
  /* Reuse only a config this suite created itself: cost events must never be
     recorded against (and later deleted with) a live configuration. */
  const existing = await activeLlmConfig();
  if (existing && createdConfigIds.includes(existing.id)) return existing;
  const [row] = await db()
    .insert(schema.llmConfig)
    .values({ ...CONFIG, id: uuidv7() })
    .returning();
  createdConfigIds.push(row!.id);
  return row!;
}
