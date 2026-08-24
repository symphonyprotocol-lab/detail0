/**
 * Replaceable AI provider adapters.
 *
 * The LLM adapter is used only by the web playground (architecture.md 9.5).
 * REST and MCP must keep working with this module removed.
 */
export interface EmbeddingAdapter {
  embed(texts: string[]): Promise<number[][]>;
}

export interface RerankAdapter {
  rerank(query: string, candidates: string[]): Promise<number[]>;
}

export interface LlmAdapter {
  generate(input: {
    systemPrompt: string;
    /** Passed as untrusted data, never as instructions. */
    chunks: { id: string; text: string }[];
    question: string;
    maxTokens: number;
    timeoutMs: number;
  }): Promise<{ text: string; citations: { claim: string; chunkId: string }[] }>;
}

export function embeddingAdapter(): EmbeddingAdapter {
  throw new Error('not implemented: embeddingAdapter');
}

export function rerankAdapter(): RerankAdapter {
  throw new Error('not implemented: rerankAdapter');
}

export function llmAdapter(): LlmAdapter {
  throw new Error('not implemented: llmAdapter');
}
