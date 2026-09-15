/**
 * GET /api/v1/libraries/search -- library-level discovery. architecture.md
 * 12.1: `query` is the primary input and `libraryName` an optional hint,
 * because a user-uploaded library's name says nothing about its content
 * (architecture.md 9.6). Anonymous callers are admitted through the anonymous
 * rate limit; a Bearer API key authenticates a workspace and widens
 * visibility to its own private libraries.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from '@/contracts/errors';
import { resolveLibraryInputSchema } from '@/contracts/schemas';
import { requireScope } from '@/lib/application/auth';
import { resolveLibraryId } from '@/lib/application/retrieval';
import { retrievalCaller, trialHeaders } from '@/lib/http/retrieval-caller';
import { errorResponse, newRequestId } from '@/lib/http/respond';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const caller = await retrievalCaller(request, requestId);
    requireScope(caller, 'knowledge:search');

    const parsed = resolveLibraryInputSchema.safeParse({
      query: request.nextUrl.searchParams.get('query') ?? undefined,
      libraryName: request.nextUrl.searchParams.get('libraryName') ?? undefined,
    });
    if (!parsed.success) {
      throw new AppError('invalid_request', 'query is required (1-2000 characters)');
    }

    const output = await resolveLibraryId(caller, parsed.data);
    return NextResponse.json(output, {
      headers: { 'cache-control': 'private, no-store', ...trialHeaders(caller.trial) },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
