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
  /**
   * One completion, raw. The prompt arrives assembled -- the system prompt
   * separate from the user message that carries the untrusted excerpts -- and
   * the caller owns parsing and citation binding (architecture.md 9.5). Token
   * counts come back for the cost metric, which is the only place they go.
   */
  generate(input: {
    systemPrompt: string;
    userMessage: string;
    maxOutputTokens: number;
    timeoutMs: number;
  }): Promise<{ text: string; promptTokens: number; completionTokens: number }>;
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

const DEFAULT_RERANK_MODEL = 'rerank-v3.5';
const RERANK_TIMEOUT_MS = 5_000;

export function isRerankConfigured(): boolean {
  return Boolean(process.env.RERANK_PROVIDER_API_KEY && process.env.RERANK_PROVIDER_BASE_URL);
}

/**
 * Speaks the Cohere-compatible `/rerank` shape (Cohere, Jina, and most
 * hosted rerankers accept it): query + documents in, `{index,
 * relevance_score}` pairs out. The base URL is configuration, so a different
 * provider is an environment change.
 *
 * One attempt, tight timeout, no retries -- unlike embeddings, a rerank is an
 * ordering refinement on an already-correct candidate list, and the caller
 * degrades to fusion order rather than waiting out a backoff.
 */
export function rerankAdapter(): RerankAdapter {
  const apiKey = process.env.RERANK_PROVIDER_API_KEY;
  const baseUrl = process.env.RERANK_PROVIDER_BASE_URL?.replace(/\/+$/, '');
  if (!apiKey || !baseUrl) {
    throw new ProviderUnavailable('rerank', 'RERANK_PROVIDER_API_KEY / _BASE_URL are not set');
  }
  const model = process.env.RERANK_MODEL ?? DEFAULT_RERANK_MODEL;

  return {
    async rerank(query: string, candidates: string[]): Promise<number[]> {
      const response = await fetch(`${baseUrl}/rerank`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, query, documents: candidates }),
        signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new ProviderUnavailable('rerank', `provider answered ${response.status}`);
      }

      const payload = (await response.json()) as {
        results?: { index?: number; relevance_score?: number }[];
      };
      const scores = new Array<number>(candidates.length).fill(0);
      for (const result of payload.results ?? []) {
        if (
          typeof result.index === 'number' &&
          result.index >= 0 &&
          result.index < candidates.length &&
          typeof result.relevance_score === 'number'
        ) {
          scores[result.index] = result.relevance_score;
        }
      }
      return scores;
    },
  };
}

export function isLlmKeyPresent(): boolean {
  return Boolean(process.env.LLM_PROVIDER_API_KEY);
}

/**
 * OpenAI-compatible chat completions. Endpoint and model are configuration
 * the console owns (`llm_config`); only the credential lives in the
 * environment (architecture.md 15.3, 19.1). One attempt, hard timeout, no
 * retries: 9.5 degrades to the chunk list rather than spending the budget on
 * a provider that is not answering.
 */
export function llmAdapter(config: { baseUrl: string; model: string }): LlmAdapter {
  const apiKey = process.env.LLM_PROVIDER_API_KEY;
  if (!apiKey) throw new ProviderUnavailable('llm', 'LLM_PROVIDER_API_KEY is not set');
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    async generate(input) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: input.maxOutputTokens,
          temperature: 0,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userMessage },
          ],
        }),
        signal: AbortSignal.timeout(input.timeoutMs),
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new ProviderUnavailable('llm', `provider answered ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        throw new ProviderUnavailable('llm', 'provider returned no completion');
      }
      return {
        text,
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
      };
    },
  };
}
