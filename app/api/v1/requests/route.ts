/**
 * GET /api/v1/requests -- the workspace's request log. architecture.md 6.3:
 * per-request summaries for the user's own screen -- outcome, library,
 * latency -- and never the query text (17.1). API key required; a workspace
 * reads only its own log.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from '@/contracts/errors';
import { resolveApiKey } from '@/lib/application/auth/api-key';
import { listRequests } from '@/lib/application/plans';
import { errorResponse, newRequestId } from '@/lib/http/respond';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const principal = await resolveApiKey(request.headers.get('authorization'));
    if (!principal) throw new AppError('invalid_api_key', 'an API key is required');

    const limit = Number(request.nextUrl.searchParams.get('limit') ?? 50);
    const requests = await listRequests(
      principal.workspaceId,
      Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50,
    );
    return NextResponse.json(
      { requests, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
