import type { ChunkResult } from '@/contracts/schemas';
import type { CallerContext } from '@/lib/application/retrieval';
import { queryDocs, type RetrievalDependencies } from '@/lib/application/retrieval/query-docs';
import {
  activeLlmConfig,
  recordLlmCost,
  type LlmConfigRow,
} from '@/lib/application/administration';
import {
  buildContextBlock,
  llmCostMicroUsd,
  parseCitedAnswer,
  PLAYGROUND_SYSTEM_PROMPT,
} from '@/lib/domain/generation';
import { isLlmKeyPresent, llmAdapter, type LlmAdapter } from '@/lib/infrastructure/ai/providers';

/**
 * The playground is the only entry point that produces prose.
 * requirement.md 5.1, architecture.md 9.5.
 *
 * Hard rules enforced here:
 * 1. retrieval comes from the shared implementation, never a copy
 * 2. zero chunks means no model call at all
 * 3. chunks are passed as untrusted data, separated from the system prompt
 * 4. every factual claim must bind to a returned chunk; unbindable text is dropped
 * 5. model failure degrades to the chunk list, never an error page
 *
 * The provider is configuration: the console's `llm_config` decides endpoint,
 * model, budgets and unit prices; the environment holds only the credential.
 * Every successful completion appends one `llm_cost_event` -- token counts
 * and cost, never the question or the answer (9.5's cost metric). The
 * retrieval call already metered one Call; generation never meters a second.
 */

export interface PlaygroundAnswer {
  kind: 'answer' | 'no_context' | 'degraded';
  text: string | null;
  chunks: ChunkResult[];
  citations: { claim: string; chunkId: string }[];
  requestId: string;
}

export interface PlaygroundDependencies {
  config(): Promise<LlmConfigRow | null>;
  llm(config: { baseUrl: string; model: string }): LlmAdapter;
  keyPresent(): boolean;
  recordCost: typeof recordLlmCost;
  retrieval?: RetrievalDependencies;
}

const defaultDependencies: PlaygroundDependencies = {
  config: activeLlmConfig,
  llm: llmAdapter,
  keyPresent: isLlmKeyPresent,
  recordCost: recordLlmCost,
};

export async function askPlayground(
  caller: CallerContext,
  input: { libraryId: string; question: string },
  dependencies: PlaygroundDependencies = defaultDependencies,
): Promise<PlaygroundAnswer> {
  const startedAt = Date.now();
  const retrieved = await queryDocs(
    caller,
    { libraryId: input.libraryId, query: input.question, maxTokens: 4000, format: 'json' },
    dependencies.retrieval,
  );

  // Rule 2: never call the model without context.
  if (retrieved.chunks.length === 0) {
    return {
      kind: 'no_context',
      text: null,
      chunks: [],
      citations: [],
      requestId: retrieved.requestId,
    };
  }

  const degraded: PlaygroundAnswer = {
    kind: 'degraded',
    text: null,
    chunks: retrieved.chunks,
    citations: [],
    requestId: retrieved.requestId,
  };

  const config = await dependencies.config().catch(() => null);
  if (!config || !config.enabled || !dependencies.keyPresent()) return degraded;

  /*
   * Chunks travel under short ordinal ids: a UUID per marker wastes the
   * model's output budget and invites transcription errors. The map back to
   * real chunk ids happens below, during binding.
   */
  const shortIds = new Map<string, string>();
  const excerpts = retrieved.chunks.map((chunk, at) => {
    const shortId = String(at + 1);
    shortIds.set(shortId, chunk.chunkId);
    return { id: shortId, text: chunk.text };
  });

  let completion: { text: string; promptTokens: number; completionTokens: number };
  try {
    completion = await dependencies.llm({ baseUrl: config.baseUrl, model: config.model }).generate({
      systemPrompt: PLAYGROUND_SYSTEM_PROMPT,
      userMessage: `${buildContextBlock(excerpts)}\n\nQuestion: ${input.question}`,
      maxOutputTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
    });
  } catch {
    // Rule 5. A provider that is down or slow is a degraded answer, not an error.
    return degraded;
  }

  /*
   * The tokens were spent whatever the binding below decides, so the cost is
   * recorded first -- and best-effort: a metrics write must not fail the
   * answer it measures.
   */
  dependencies
    .recordCost({
      configId: config.id,
      libraryPublicId: retrieved.libraryId,
      workspaceId: caller.workspaceId,
      model: config.model,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      costMicroUsd: llmCostMicroUsd({
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        promptPriceMicro: config.promptPriceMicro,
        completionPriceMicro: config.completionPriceMicro,
      }),
      latencyMs: Date.now() - startedAt,
    })
    .catch((error) => {
      console.error(
        `llm cost event failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    });

  // Rule 4: a sentence keeps its place only by citing a chunk this request returned.
  const kept: string[] = [];
  const citations: { claim: string; chunkId: string }[] = [];
  for (const segment of parseCitedAnswer(completion.text)) {
    const bound = segment.refs
      .map((ref) => shortIds.get(ref))
      .filter((id): id is string => id !== undefined);
    if (bound.length === 0) continue;
    kept.push(segment.text);
    for (const chunkId of bound) citations.push({ claim: segment.text, chunkId });
  }

  if (kept.length === 0) return degraded;

  return {
    kind: 'answer',
    text: kept.join(' '),
    chunks: retrieved.chunks,
    citations,
    requestId: retrieved.requestId,
  };
}

/** Rule 4. Keeps only claims that resolve to a chunk returned by this request. */
export function bindCitations(
  citations: { claim: string; chunkId: string }[],
  chunks: ChunkResult[],
): { claim: string; chunkId: string }[] {
  const ids = new Set(chunks.map((c) => c.chunkId));
  return citations.filter((c) => ids.has(c.chunkId));
}
