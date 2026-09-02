/**
 * Console management of the playground's models, and what they spend.
 * architecture.md 9.5, requirement.md 5.3 (high-risk actions take a reason
 * and land in the audit chain).
 *
 * An entry is identified by its `slug` and is immutable, like a Plan Version:
 * "edit" mints a successor row sharing the slug, the newest row of a slug is
 * that entry's configuration, and the unit prices frozen on each row keep
 * historical cost events meaning what they meant. The provider API key is not
 * managed here at all -- 15.3 keeps secrets in the environment.
 */
import { desc, eq, gte, sql } from 'drizzle-orm';
import { normalizeReason } from '@/lib/domain/admin';
import {
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  REASONING_EFFORTS,
  TIMEOUT_MS,
  type ReasoningEffort,
} from '@/lib/domain/generation';
import { uuidv7 } from '@/lib/domain/id';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { recordAudit } from './audit';

export interface LlmConfigRow {
  id: string;
  slug: string;
  label: string;
  baseUrl: string;
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  promptPriceMicro: number;
  completionPriceMicro: number;
  cachePriceMicro: number;
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsVision: boolean;
  reasoningEffort: ReasoningEffort | null;
  enabled: boolean;
  isDefault: boolean;
  createdAt: Date;
}

export interface LlmUsageStats {
  monthCalls: number;
  monthPromptTokens: number;
  monthCompletionTokens: number;
  /** Of the prompt tokens, the share the provider served from cache. */
  monthCachedTokens: number;
  /** Of the completion tokens, the share spent thinking. */
  monthReasoningTokens: number;
  monthCostMicroUsd: number;
  totalCalls: number;
  totalCostMicroUsd: number;
}

export interface LlmConfiguration {
  /** The configuration in force for each entry, newest slug first. */
  entries: LlmConfigRow[];
  /** What an unqualified playground request resolves to, if anything. */
  fallback: LlmConfigRow | null;
  history: LlmConfigRow[];
  stats: LlmUsageStats;
}

/**
 * The configuration in force for every entry: the newest row of each slug.
 *
 * Done as one `distinct on` rather than a query per slug -- the playground
 * resolves this on the request path, and the set is small but the history
 * behind it is not.
 */
export async function llmConfigEntries(): Promise<LlmConfigRow[]> {
  return db()
    .selectDistinctOn([schema.llmConfig.slug])
    .from(schema.llmConfig)
    .orderBy(schema.llmConfig.slug, desc(schema.llmConfig.createdAt));
}

/**
 * The entries a caller may pick from: in force, and switched on.
 *
 * Ordered with the default first and the rest newest-first, which is the
 * order the console lists them in and the order a picker should offer them.
 */
export async function selectableLlmModels(): Promise<LlmConfigRow[]> {
  const enabled = (await llmConfigEntries()).filter((entry) => entry.enabled);
  const fallback = resolveFallback(enabled);
  return [
    ...enabled.filter((entry) => entry.slug === fallback?.slug),
    ...enabled
      .filter((entry) => entry.slug !== fallback?.slug)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  ];
}

/**
 * The entry a request that named no model gets.
 *
 * Setting a default mints a row rather than rewriting the entry that held it,
 * so more than one slug's newest row can carry the flag; the most recently
 * written one is the one that was chosen last, and wins. An installation that
 * has never chosen falls back to the newest entry, so a single configured
 * model works with no further ceremony.
 */
function resolveFallback(entries: LlmConfigRow[]): LlmConfigRow | null {
  const byRecency = [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return byRecency.find((entry) => entry.isDefault) ?? byRecency[0] ?? null;
}

/**
 * Resolve what the playground should call.
 *
 * A `slug` that is unknown or switched off resolves to null rather than to
 * the fallback: a caller naming a model it may not use is a rejected request,
 * not a silently substituted one.
 */
export async function activeLlmConfig(slug?: string | null): Promise<LlmConfigRow | null> {
  const enabled = (await llmConfigEntries()).filter((entry) => entry.enabled);
  if (slug) return enabled.find((entry) => entry.slug === slug) ?? null;
  return resolveFallback(enabled);
}

export async function readLlmConfiguration(): Promise<LlmConfiguration> {
  const database = db();
  const history = await database
    .select()
    .from(schema.llmConfig)
    .orderBy(desc(schema.llmConfig.createdAt))
    .limit(40);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const aggregate = {
    calls: sql<number>`count(*)::int`,
    promptTokens: sql<number>`coalesce(sum(${schema.llmCostEvent.promptTokens}), 0)::int`,
    completionTokens: sql<number>`coalesce(sum(${schema.llmCostEvent.completionTokens}), 0)::int`,
    cachedTokens: sql<number>`coalesce(sum(${schema.llmCostEvent.cachedTokens}), 0)::int`,
    reasoningTokens: sql<number>`coalesce(sum(${schema.llmCostEvent.reasoningTokens}), 0)::int`,
    costMicroUsd: sql<number>`coalesce(sum(${schema.llmCostEvent.costMicroUsd}), 0)::bigint`,
  };
  const [month] = await database
    .select(aggregate)
    .from(schema.llmCostEvent)
    .where(gte(schema.llmCostEvent.createdAt, monthStart));
  const [total] = await database.select(aggregate).from(schema.llmCostEvent);

  const entries = await llmConfigEntries();

  return {
    entries: [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    fallback: resolveFallback(entries.filter((entry) => entry.enabled)),
    history,
    stats: {
      monthCalls: month?.calls ?? 0,
      monthPromptTokens: month?.promptTokens ?? 0,
      monthCompletionTokens: month?.completionTokens ?? 0,
      monthCachedTokens: month?.cachedTokens ?? 0,
      monthReasoningTokens: month?.reasoningTokens ?? 0,
      monthCostMicroUsd: Number(month?.costMicroUsd ?? 0),
      totalCalls: total?.calls ?? 0,
      totalCostMicroUsd: Number(total?.costMicroUsd ?? 0),
    },
  };
}

export class LlmConfigRefused extends Error {
  constructor(
    readonly code:
      | 'invalid_base_url'
      | 'invalid_model'
      | 'invalid_max_input'
      | 'invalid_max_output'
      | 'invalid_timeout'
      | 'invalid_price'
      | 'invalid_slug'
      | 'invalid_effort',
  ) {
    super(code);
    this.name = 'LlmConfigRefused';
  }
}

export interface UpdateLlmConfigInput {
  actor: { administratorId: string; email: string; clientAddress?: string | null };
  /** Omitted for a new entry; supplied to append to an existing one. */
  slug?: string | null;
  label: string;
  baseUrl: string;
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  promptPriceMicro: number;
  completionPriceMicro: number;
  cachePriceMicro: number;
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsVision: boolean;
  /** Ignored unless `supportsReasoning`; sending both is refused, not coerced. */
  reasoningEffort: string | null;
  enabled: boolean;
  isDefault: boolean;
  reason: string;
}

/** Slugs are typed into a URL-shaped identifier, so hold them to one. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

function slugFromLabel(label: string): string {
  const derived = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return derived.length > 0 ? derived : `model-${uuidv7().slice(0, 8)}`;
}

export async function updateLlmConfig(input: UpdateLlmConfigInput): Promise<{ configId: string }> {
  const reason = normalizeReason(input.reason);

  let baseUrl: URL;
  try {
    baseUrl = new URL(input.baseUrl);
  } catch {
    throw new LlmConfigRefused('invalid_base_url');
  }
  if (baseUrl.protocol !== 'https:') throw new LlmConfigRefused('invalid_base_url');
  const model = input.model.trim();
  if (model.length === 0 || model.length > 120) throw new LlmConfigRefused('invalid_model');

  const label = input.label.trim().slice(0, 120) || model;
  const slug = input.slug?.trim() ? input.slug.trim() : slugFromLabel(label);
  if (!SLUG.test(slug)) throw new LlmConfigRefused('invalid_slug');

  /*
   * One refusal per field, not one for all six.
   *
   * They used to share `invalid_number`, which told an operator that something
   * among the budgets and the prices was wrong but not which -- and the
   * budgets are exactly where a plausible value gets refused, so the message
   * had to be guessed at. A limit worth enforcing is worth naming.
   */
  const wholeAndPositive = (value: number) => Number.isSafeInteger(value) && value >= 0;

  /* The floor is the retrieval budget's own minimum plus the prompt around it:
     below that there is no window left to put excerpts in. The ceiling is the
     largest context a current model offers. */
  if (
    !wholeAndPositive(input.maxInputTokens) ||
    input.maxInputTokens < MAX_INPUT_TOKENS.min ||
    input.maxInputTokens > MAX_INPUT_TOKENS.max
  ) {
    throw new LlmConfigRefused('invalid_max_input');
  }

  /*
   * Floor only. The old ceiling was 8,192, which every model released since
   * can exceed -- so an operator entering their model's real output budget was
   * refused for entering the truth, and any replacement ceiling would just be
   * the same refusal waiting for the next model.
   */
  if (!wholeAndPositive(input.maxOutputTokens) || input.maxOutputTokens < MAX_OUTPUT_TOKENS.min) {
    throw new LlmConfigRefused('invalid_max_output');
  }

  /*
   * Likewise 60s, which predates reasoning models: one at high effort can
   * think for longer than that before its first token. The hosting platform's
   * own function limit is the real ceiling; this one only has to stop being
   * lower than it.
   */
  if (
    !wholeAndPositive(input.timeoutMs) ||
    input.timeoutMs < TIMEOUT_MS.min ||
    input.timeoutMs > TIMEOUT_MS.max
  ) {
    throw new LlmConfigRefused('invalid_timeout');
  }

  if (
    ![input.promptPriceMicro, input.completionPriceMicro, input.cachePriceMicro].every(
      wholeAndPositive,
    )
  ) {
    throw new LlmConfigRefused('invalid_price');
  }

  /*
   * An effort on a model that does not reason would be ignored at call time,
   * leaving a row that describes a model which does not exist. Refused rather
   * than quietly dropped: this arrives through a server action, which is a
   * public endpoint, and silently discarding a field a caller set is how a
   * setting comes to look applied when it never was. The console cannot
   * produce the pair anyway -- its select is disabled, so it posts nothing.
   */
  const effort = input.reasoningEffort?.trim() ? input.reasoningEffort.trim() : null;
  if (effort !== null) {
    if (!input.supportsReasoning) throw new LlmConfigRefused('invalid_effort');
    if (!REASONING_EFFORTS.includes(effort as ReasoningEffort)) {
      throw new LlmConfigRefused('invalid_effort');
    }
  }

  const [before] = await db()
    .select()
    .from(schema.llmConfig)
    .where(eq(schema.llmConfig.slug, slug))
    .orderBy(desc(schema.llmConfig.createdAt))
    .limit(1);

  const written = {
    slug,
    label,
    baseUrl: baseUrl.toString().replace(/\/+$/, ''),
    model,
    maxInputTokens: input.maxInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    timeoutMs: input.timeoutMs,
    promptPriceMicro: input.promptPriceMicro,
    completionPriceMicro: input.completionPriceMicro,
    cachePriceMicro: input.cachePriceMicro,
    supportsTools: input.supportsTools,
    supportsReasoning: input.supportsReasoning,
    supportsVision: input.supportsVision,
    reasoningEffort: effort as ReasoningEffort | null,
    enabled: input.enabled,
    isDefault: input.isDefault,
  };

  const configId = uuidv7();
  await db().insert(schema.llmConfig).values({ id: configId, ...written });

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: 'llm_config.update',
    targetType: 'llm_config',
    targetId: configId,
    reason,
    beforeValue: before
      ? {
          slug: before.slug,
          label: before.label,
          baseUrl: before.baseUrl,
          model: before.model,
          maxInputTokens: before.maxInputTokens,
          maxOutputTokens: before.maxOutputTokens,
          timeoutMs: before.timeoutMs,
          promptPriceMicro: before.promptPriceMicro,
          completionPriceMicro: before.completionPriceMicro,
          cachePriceMicro: before.cachePriceMicro,
          supportsTools: before.supportsTools,
          supportsReasoning: before.supportsReasoning,
          supportsVision: before.supportsVision,
          reasoningEffort: before.reasoningEffort,
          enabled: before.enabled,
          isDefault: before.isDefault,
        }
      : null,
    afterValue: written,
    clientAddress: input.actor.clientAddress,
    result: 'success',
  });

  return { configId };
}

/** The playground's spend recorder -- append-only, never the text. */
export async function recordLlmCost(input: {
  configId: string;
  libraryPublicId: string;
  workspaceId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costMicroUsd: number;
  latencyMs: number | null;
}): Promise<void> {
  await db().insert(schema.llmCostEvent).values({ id: uuidv7(), ...input });
}
