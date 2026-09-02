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
const {
  recordLlmCost,
  updateLlmConfig,
  readLlmConfiguration,
  activeLlmConfig,
  llmConfigEntries,
  selectableLlmModels,
} = await import('@/lib/application/administration');
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
  slug: 'fixture',
  label: 'Fixture model',
  isDefault: true,
  baseUrl: 'https://llm.example.test/v1',
  model: 'fixture-llm-1',
  maxInputTokens: 8_000,
  maxOutputTokens: 800,
  timeoutMs: 15_000,
  promptPriceMicro: 3_000_000,
  completionPriceMicro: 15_000_000,
  cachePriceMicro: 300_000,
  supportsTools: false,
  supportsReasoning: false,
  supportsVision: false,
  reasoningEffort: null as 'minimal' | 'low' | 'medium' | 'high' | null,
  enabled: true,
  createdAt: new Date(),
};

function playgroundDeps(options: {
  completion?: string;
  fail?: boolean;
  config?: typeof CONFIG | null;
  calls?: { userMessage?: string; reasoningEffort?: string | null }[];
  usage?: { promptTokens: number; completionTokens: number; cachedTokens: number; reasoningTokens: number };
}) {
  return {
    config: async () => (options.config === undefined ? CONFIG : options.config),
    keyPresent: () => true,
    recordCost: recordLlmCost,
    retrieval,
    llm: () => ({
      stream(input: { userMessage: string; reasoningEffort?: string | null }) {
        options.calls?.push({
          userMessage: input.userMessage,
          reasoningEffort: input.reasoningEffort ?? null,
        });
        const completion = options.completion ?? '';
        return {
          /* Delivered in small deltas, mid-word and mid-marker, because the
             streaming gate is the thing the answer path now depends on. */
          textStream: (async function* deltas() {
            if (options.fail) throw new Error('provider down');
            for (const piece of completion.match(/[\s\S]{1,7}/g) ?? []) yield piece;
          })(),
          usage: Promise.resolve(
            options.usage ?? {
              promptTokens: 1_000,
              completionTokens: 500,
              cachedTokens: 0,
              reasoningTokens: 0,
            },
          ),
        };
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

  it('sends reasoning effort only for a reasoning model, and bills the cache once', async () => {
    const stamp = Date.now();
    await publishedLibrary(`pg-reason-${stamp}`);
    const libraryId = `/websites/pg-reason-${stamp}`;

    const [row] = await db()
      .insert(schema.llmConfig)
      .values({ ...CONFIG, id: uuidv7() })
      .returning();
    createdConfigIds.push(row!.id);
    const base = { ...CONFIG, id: row!.id };

    /* A plain model: nothing is sent, so an endpoint that does not reason is
       never handed a field it would reject. */
    const plain: { userMessage?: string; reasoningEffort?: string | null }[] = [];
    await askPlayground(
      asAnonymous(),
      { libraryId, question: 'rove beetle exposure' },
      playgroundDeps({ config: base, completion: 'Rinse. [ref:1]', calls: plain }),
    );
    expect(plain[0]!.reasoningEffort).toBeNull();

    const thinking: { userMessage?: string; reasoningEffort?: string | null }[] = [];
    const output = await askPlayground(
      asAnonymous(),
      { libraryId, question: 'rove beetle exposure' },
      playgroundDeps({
        config: { ...base, supportsReasoning: true, reasoningEffort: 'high' },
        completion: 'Rinse the skin. [ref:1]',
        calls: thinking,
        usage: {
          promptTokens: 1_000,
          completionTokens: 500,
          cachedTokens: 800,
          reasoningTokens: 300,
        },
      }),
    );
    expect(output.kind).toBe('answer');
    expect(thinking[0]!.reasoningEffort).toBe('high');

    const events = await db()
      .select()
      .from(schema.llmCostEvent)
      .where(eq(schema.llmCostEvent.configId, row!.id));
    const billed = events.find((event) => event.cachedTokens === 800);
    expect(billed).toBeDefined();
    /* The breakdowns are recorded beside the totals, never added to them. */
    expect(billed!.promptTokens).toBe(1_000);
    expect(billed!.completionTokens).toBe(500);
    expect(billed!.reasoningTokens).toBe(300);
    // 200 x $3/M + 800 x $0.30/M + 500 x $15/M = 840 + 7,500 micro-USD
    expect(billed!.costMicroUsd).toBe(8_340);
  });

  it('names the field it refuses, and accepts a current model\'s real budgets', async () => {
    const administratorId = crypto.randomUUID();
    await db().insert(schema.administrator).values({
      id: administratorId,
      email: `llm-bounds-${Date.now()}@example.test`,
      username: `llm-bounds-${Date.now()}`,
      passwordHash: 'unused',
      status: 'active',
    });
    const entry = {
      actor: { administratorId, email: 'ops@example.test' },
      slug: `bounds-${Date.now()}`,
      label: 'Bounds fixture',
      baseUrl: 'https://llm.example.test/v1',
      model: 'fixture-bounds',
      maxInputTokens: 200_000,
      maxOutputTokens: 800,
      timeoutMs: 15_000,
      promptPriceMicro: 3_000_000,
      completionPriceMicro: 15_000_000,
      cachePriceMicro: 300_000,
      supportsTools: false,
      supportsReasoning: false,
      supportsVision: false,
      reasoningEffort: null,
      enabled: true,
      isDefault: false,
      reason: 'bounds fixture',
    };

    try {
      /* Each budget refuses under its own name, so an operator is told which
         field is wrong rather than that one of six is. */
      await expect(updateLlmConfig({ ...entry, maxInputTokens: 500 })).rejects.toMatchObject({
        code: 'invalid_max_input',
      });
      await expect(updateLlmConfig({ ...entry, maxOutputTokens: 0 })).rejects.toMatchObject({
        code: 'invalid_max_output',
      });
      await expect(updateLlmConfig({ ...entry, timeoutMs: 10 })).rejects.toMatchObject({
        code: 'invalid_timeout',
      });
      await expect(updateLlmConfig({ ...entry, cachePriceMicro: -1 })).rejects.toMatchObject({
        code: 'invalid_price',
      });

      /* The budgets a current model actually has. These were refused before:
         the ceilings were 8,192 output tokens and 60s, so entering the truth
         about a modern model was an error. The output budget now has no
         ceiling at all, so a figure past any current model still saves. */
      const saved = await updateLlmConfig({
        ...entry,
        maxOutputTokens: 1_000_000,
        timeoutMs: 120_000,
      });
      createdConfigIds.push(saved.configId);
      const stored = await activeLlmConfig(entry.slug);
      expect(stored?.maxOutputTokens).toBe(1_000_000);
      expect(stored?.timeoutMs).toBe(120_000);
    } finally {
      await db()
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.administratorId, administratorId));
      await db().delete(schema.administrator).where(eq(schema.administrator.id, administratorId));
    }
  });

  it('refuses a reasoning effort on a model that does not reason', async () => {
    const administratorId = crypto.randomUUID();
    await db().insert(schema.administrator).values({
      id: administratorId,
      email: `llm-effort-${Date.now()}@example.test`,
      username: `llm-effort-${Date.now()}`,
      passwordHash: 'unused',
      status: 'active',
    });
    const entry = {
      actor: { administratorId, email: 'ops@example.test' },
      slug: `effort-${Date.now()}`,
      label: 'Effort fixture',
      baseUrl: 'https://llm.example.test/v1',
      model: 'fixture-effort',
      maxInputTokens: 8_000,
      maxOutputTokens: 800,
      timeoutMs: 15_000,
      promptPriceMicro: 0,
      completionPriceMicro: 0,
      cachePriceMicro: 0,
      supportsTools: false,
      supportsVision: false,
      enabled: true,
      isDefault: false,
      reason: 'effort fixture',
    };

    try {
      await expect(
        updateLlmConfig({ ...entry, supportsReasoning: false, reasoningEffort: 'high' }),
      ).rejects.toMatchObject({ code: 'invalid_effort' });
      await expect(
        updateLlmConfig({ ...entry, supportsReasoning: true, reasoningEffort: 'ludicrous' }),
      ).rejects.toMatchObject({ code: 'invalid_effort' });

      /* A reasoning model with no effort chosen is legitimate -- the provider's
         own default applies. */
      const saved = await updateLlmConfig({
        ...entry,
        supportsReasoning: true,
        reasoningEffort: null,
      });
      createdConfigIds.push(saved.configId);
      expect((await activeLlmConfig(entry.slug))?.reasoningEffort).toBeNull();
    } finally {
      await db()
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.administratorId, administratorId));
      await db().delete(schema.administrator).where(eq(schema.administrator.id, administratorId));
    }
  });

  it('keeps several models side by side and resolves the one marked default', async () => {
    const administratorId = crypto.randomUUID();
    await db().insert(schema.administrator).values({
      id: administratorId,
      email: `llm-multi-${Date.now()}@example.test`,
      username: `llm-multi-${Date.now()}`,
      passwordHash: 'unused',
      status: 'active',
    });
    const stamp = Date.now();
    const shared = {
      actor: { administratorId, email: 'ops@example.test' },
      baseUrl: 'https://llm.example.test/v1',
      maxInputTokens: 8_000,
      maxOutputTokens: 800,
      timeoutMs: 15_000,
      promptPriceMicro: 3_000_000,
      completionPriceMicro: 15_000_000,
      cachePriceMicro: 300_000,
      supportsTools: false,
      supportsReasoning: false,
      supportsVision: false,
      reasoningEffort: null,
      reason: 'multi-model fixture',
    };

    try {
      const cheap = await updateLlmConfig({
        ...shared,
        slug: `cheap-${stamp}`,
        label: 'Cheap',
        model: 'fixture-cheap',
        enabled: true,
        isDefault: true,
      });
      const strong = await updateLlmConfig({
        ...shared,
        slug: `strong-${stamp}`,
        label: 'Strong',
        model: 'fixture-strong',
        enabled: true,
        isDefault: false,
      });
      const retired = await updateLlmConfig({
        ...shared,
        slug: `retired-${stamp}`,
        label: 'Retired',
        model: 'fixture-retired',
        enabled: false,
        isDefault: false,
      });
      createdConfigIds.push(cheap.configId, strong.configId, retired.configId);

      /* Two live entries and one switched off; the off one is not offered. */
      const selectable = await selectableLlmModels();
      const slugs = selectable.map((entry) => entry.slug);
      expect(slugs).toContain(`cheap-${stamp}`);
      expect(slugs).toContain(`strong-${stamp}`);
      expect(slugs).not.toContain(`retired-${stamp}`);

      /* `strong` was written later, but `cheap` is the one claiming default. */
      expect((await activeLlmConfig())?.model).toBe('fixture-cheap');
      expect(selectable[0]!.slug).toBe(`cheap-${stamp}`);

      /* Naming an entry picks it; naming one that is off picks nothing at all,
         rather than quietly falling back to a model the caller did not ask
         for. */
      expect((await activeLlmConfig(`strong-${stamp}`))?.model).toBe('fixture-strong');
      expect(await activeLlmConfig(`retired-${stamp}`)).toBeNull();
      expect(await activeLlmConfig('no-such-entry')).toBeNull();

      /* Choosing a new default is an append, and the newest claim wins. */
      const promoted = await updateLlmConfig({
        ...shared,
        slug: `strong-${stamp}`,
        label: 'Strong',
        model: 'fixture-strong',
        enabled: true,
        isDefault: true,
        reason: 'promote strong',
      });
      createdConfigIds.push(promoted.configId);
      expect((await activeLlmConfig())?.model).toBe('fixture-strong');
    } finally {
      await db()
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.administratorId, administratorId));
      await db().delete(schema.administrator).where(eq(schema.administrator.id, administratorId));
    }
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
      const entry = {
        actor: { administratorId, email: 'ops@example.test' },
        slug: `chain-${Date.now()}`,
        label: 'Chained entry',
        baseUrl: 'https://llm.example.test/v1',
        maxInputTokens: 8_000,
        maxOutputTokens: 800,
        timeoutMs: 15_000,
        promptPriceMicro: 3_000_000,
        completionPriceMicro: 15_000_000,
        cachePriceMicro: 300_000,
        supportsTools: false,
        supportsReasoning: false,
        supportsVision: false,
        reasoningEffort: null,
        enabled: true,
        isDefault: true,
      };
      const first = await updateLlmConfig({
        ...entry,
        model: 'fixture-llm-1',
        reason: 'initial configuration',
      });
      const second = await updateLlmConfig({
        ...entry,
        model: 'fixture-llm-2',
        reason: 'switch model',
      });
      createdConfigIds.push(first.configId, second.configId);
      expect(second.configId).not.toBe(first.configId);

      /* Same slug, so the second row succeeds the first rather than adding an
         entry beside it -- one model with a history, which is what freezes
         the prices the earlier cost events were written against. */
      const active = await activeLlmConfig();
      expect(active?.id).toBe(second.configId);
      expect(active?.model).toBe('fixture-llm-2');
      expect((await llmConfigEntries()).filter((e) => e.slug === entry.slug)).toHaveLength(1);

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
        cachedTokens: 0,
        reasoningTokens: 0,
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
