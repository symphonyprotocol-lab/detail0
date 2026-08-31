/**
 * Replaceable AI provider adapters.
 *
 * The LLM adapter is used only by the web playground (architecture.md 9.5).
 * REST and MCP must keep working with this module removed.
 *
 * All three speak the OpenAI-compatible HTTP shape and take their base URL from
 * the environment, so a different provider is a configuration change rather
 * than a code change. That is the whole point of the seam: architecture.md 20
 * forbids a provider type from leaking into the domain or the SDK.
 */

export interface EmbeddingAdapter {
  embed(texts: string[]): Promise<number[][]>;
  /** Recorded on `library_version.embedding_model`, which freezes it. */
  readonly model: string;
  readonly dimensions: number;
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

/**
 * The `chunk.embedding` column is `vector(1536)`.
 *
 * A model of a different width cannot be written to that column at all, so this
 * is checked on the way out of the adapter rather than discovered as a driver
 * error halfway through a build.
 */
export const EMBEDDING_DIMENSIONS = 1536;

const DEFAULT_EMBEDDING_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Provider request caps. A build sends thousands of chunks through this. */
const EMBEDDING_BATCH = 96;
const EMBEDDING_TIMEOUT_MS = 60_000;
const EMBEDDING_ATTEMPTS = 3;

export class ProviderUnavailable extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderUnavailable';
  }
}

export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.EMBEDDING_PROVIDER_API_KEY);
}

export function embeddingAdapter(): EmbeddingAdapter {
  const apiKey = process.env.EMBEDDING_PROVIDER_API_KEY;
  if (!apiKey) throw new ProviderUnavailable('embedding', 'EMBEDDING_PROVIDER_API_KEY is not set');

  const baseUrl = (process.env.EMBEDDING_PROVIDER_BASE_URL ?? DEFAULT_EMBEDDING_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const model = process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  return {
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts: string[]): Promise<number[][]> {
      const vectors: number[][] = [];
      for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH) {
        const batch = texts.slice(offset, offset + EMBEDDING_BATCH);
        vectors.push(...(await embedBatch({ apiKey, baseUrl, model, batch })));
      }
      return vectors;
    },
  };
}

async function embedBatch(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  batch: string[];
}): Promise<number[][]> {
  let lastError = 'unknown';

  for (let attempt = 1; attempt <= EMBEDDING_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${input.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: input.model,
          input: input.batch,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      lastError = 'unreachable';
      await backoff(attempt);
      continue;
    }

    /*
     * 429 and 5xx are retried; 4xx is not. A rejected request body does not
     * become acceptable by being sent again, and retrying it burns the budget
     * that the retryable failures need.
     */
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      lastError = `status ${response.status}`;
      await backoff(attempt);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderUnavailable('embedding', `embedding provider rejected: ${response.status}`);
    }

    const body = (await response.json()) as { data?: { embedding?: number[] }[] };
    const vectors = (body.data ?? []).map((entry) => entry.embedding ?? []);
    if (vectors.length !== input.batch.length) {
      throw new ProviderUnavailable('embedding', 'embedding provider returned a short batch');
    }
    for (const vector of vectors) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new ProviderUnavailable(
          'embedding',
          `embedding provider returned ${vector.length} dimensions, not ${EMBEDDING_DIMENSIONS}`,
        );
      }
    }
    return vectors;
  }

  throw new ProviderUnavailable('embedding', `embedding provider unavailable: ${lastError}`);
}

/** Exponential, so a rate-limited provider is not hammered flat. */
async function backoff(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
}

export function rerankAdapter(): RerankAdapter {
  throw new ProviderUnavailable('rerank', 'not implemented: rerankAdapter');
}

export function llmAdapter(): LlmAdapter {
  throw new ProviderUnavailable('llm', 'not implemented: llmAdapter');
}
