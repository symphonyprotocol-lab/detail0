import { AppError } from '@/contracts/errors';
import type { ChunkResult } from '@/contracts/schemas';
import { queryDocs, type CallerContext } from '@/lib/application/retrieval';

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
 */

export interface PlaygroundAnswer {
  kind: 'answer' | 'no_context' | 'degraded';
  text: string | null;
  chunks: ChunkResult[];
  citations: { claim: string; chunkId: string }[];
  requestId: string;
}

export async function askPlayground(
  caller: CallerContext,
  input: { libraryId: string; question: string },
): Promise<PlaygroundAnswer> {
  const retrieved = await queryDocs(caller, {
    libraryId: input.libraryId,
    query: input.question,
    maxTokens: 4000,
    format: 'json',
  });

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

  throw new AppError('not_implemented', 'playground generation is not implemented yet');
}

/** Rule 4. Keeps only claims that resolve to a chunk returned by this request. */
export function bindCitations(
  citations: { claim: string; chunkId: string }[],
  chunks: ChunkResult[],
): { claim: string; chunkId: string }[] {
  const ids = new Set(chunks.map((c) => c.chunkId));
  return citations.filter((c) => ids.has(c.chunkId));
}
