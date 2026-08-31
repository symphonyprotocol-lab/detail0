/**
 * Console management of the playground's LLM provider, and what it spends.
 * architecture.md 9.5, requirement.md 5.3 (high-risk actions take a reason
 * and land in the audit chain).
 *
 * A configuration is immutable, like a Plan Version: "edit" mints a
 * successor, the newest row is active, and the unit prices frozen on each row
 * keep historical cost events meaning what they meant. The provider API key
 * is not managed here at all -- 15.3 keeps secrets in the environment.
 */
import { desc, gte, sql } from 'drizzle-orm';
import { normalizeReason } from '@/lib/domain/admin';
import { uuidv7 } from '@/lib/domain/id';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { recordAudit } from './audit';

export interface LlmConfigRow {
  id: string;
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  promptPriceMicro: number;
  completionPriceMicro: number;
  enabled: boolean;
  createdAt: Date;
}

export interface LlmUsageStats {
  monthCalls: number;
  monthPromptTokens: number;
  monthCompletionTokens: number;
  monthCostMicroUsd: number;
  totalCalls: number;
  totalCostMicroUsd: number;
}

export interface LlmConfiguration {
  current: LlmConfigRow | null;
  history: LlmConfigRow[];
  stats: LlmUsageStats;
}

/** The active configuration -- what the playground builds its adapter from. */
export async function activeLlmConfig(): Promise<LlmConfigRow | null> {
  const [row] = await db()
    .select()
    .from(schema.llmConfig)
    .orderBy(desc(schema.llmConfig.createdAt))
    .limit(1);
  return row ?? null;
}

export async function readLlmConfiguration(): Promise<LlmConfiguration> {
  const database = db();
  const history = await database
    .select()
    .from(schema.llmConfig)
    .orderBy(desc(schema.llmConfig.createdAt))
    .limit(20);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const aggregate = {
    calls: sql<number>`count(*)::int`,
    promptTokens: sql<number>`coalesce(sum(${schema.llmCostEvent.promptTokens}), 0)::int`,
    completionTokens: sql<number>`coalesce(sum(${schema.llmCostEvent.completionTokens}), 0)::int`,
    costMicroUsd: sql<number>`coalesce(sum(${schema.llmCostEvent.costMicroUsd}), 0)::bigint`,
  };
  const [month] = await database
    .select(aggregate)
    .from(schema.llmCostEvent)
    .where(gte(schema.llmCostEvent.createdAt, monthStart));
  const [total] = await database.select(aggregate).from(schema.llmCostEvent);

  return {
    current: history[0] ?? null,
    history,
    stats: {
      monthCalls: month?.calls ?? 0,
      monthPromptTokens: month?.promptTokens ?? 0,
      monthCompletionTokens: month?.completionTokens ?? 0,
      monthCostMicroUsd: Number(month?.costMicroUsd ?? 0),
      totalCalls: total?.calls ?? 0,
      totalCostMicroUsd: Number(total?.costMicroUsd ?? 0),
    },
  };
}

export class LlmConfigRefused extends Error {
  constructor(readonly code: 'invalid_base_url' | 'invalid_model' | 'invalid_number') {
    super(code);
    this.name = 'LlmConfigRefused';
  }
}

export interface UpdateLlmConfigInput {
  actor: { administratorId: string; email: string; clientAddress?: string | null };
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  promptPriceMicro: number;
  completionPriceMicro: number;
  enabled: boolean;
  reason: string;
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
  const numbers = [
    input.maxOutputTokens,
    input.timeoutMs,
    input.promptPriceMicro,
    input.completionPriceMicro,
  ];
  if (
    numbers.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    input.maxOutputTokens < 64 ||
    input.maxOutputTokens > 8_192 ||
    input.timeoutMs < 1_000 ||
    input.timeoutMs > 60_000
  ) {
    throw new LlmConfigRefused('invalid_number');
  }

  const before = await activeLlmConfig();
  const configId = uuidv7();
  await db().insert(schema.llmConfig).values({
    id: configId,
    baseUrl: baseUrl.toString().replace(/\/+$/, ''),
    model,
    maxOutputTokens: input.maxOutputTokens,
    timeoutMs: input.timeoutMs,
    promptPriceMicro: input.promptPriceMicro,
    completionPriceMicro: input.completionPriceMicro,
    enabled: input.enabled,
  });

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: 'llm_config.update',
    targetType: 'llm_config',
    targetId: configId,
    reason,
    beforeValue: before
      ? {
          baseUrl: before.baseUrl,
          model: before.model,
          maxOutputTokens: before.maxOutputTokens,
          timeoutMs: before.timeoutMs,
          promptPriceMicro: before.promptPriceMicro,
          completionPriceMicro: before.completionPriceMicro,
          enabled: before.enabled,
        }
      : null,
    afterValue: {
      baseUrl: baseUrl.toString().replace(/\/+$/, ''),
      model,
      maxOutputTokens: input.maxOutputTokens,
      timeoutMs: input.timeoutMs,
      promptPriceMicro: input.promptPriceMicro,
      completionPriceMicro: input.completionPriceMicro,
      enabled: input.enabled,
    },
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
  costMicroUsd: number;
  latencyMs: number | null;
}): Promise<void> {
  await db().insert(schema.llmCostEvent).values({ id: uuidv7(), ...input });
}
