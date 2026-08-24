import type { QueryDocsInput, QueryDocsOutput, ResolveLibraryInput, ResolveLibraryOutput } from '@/contracts/schemas';
import { AppError } from '@/contracts/errors';

/**
 * The single retrieval implementation. REST, MCP and the web playground all
 * call these -- none of them may reimplement authorization, recall or metering.
 * architecture.md 1.1, 9.2 and 9.5.
 *
 * Order is fixed (architecture.md 9.2):
 *   authenticate -> resolve plan and quota -> load library and pin version
 *   -> enforce visibility -> apply workspace policy -> reserve one call
 *   -> FTS + vector recall within the pinned version -> fuse -> rerank
 *   -> dedupe and safety filter -> trim to maxTokens -> append usage event
 *   -> append earning event when attributable
 */

export interface CallerContext {
  workspaceId: string | null;
  apiKeyId: string | null;
  requestId: string;
  anonymous: boolean;
}

export async function resolveLibraryId(
  _caller: CallerContext,
  _input: ResolveLibraryInput,
): Promise<ResolveLibraryOutput> {
  throw new AppError('not_implemented', 'resolveLibraryId is not implemented yet');
}

export async function queryDocs(
  _caller: CallerContext,
  _input: QueryDocsInput,
): Promise<QueryDocsOutput> {
  throw new AppError('not_implemented', 'queryDocs is not implemented yet');
}
