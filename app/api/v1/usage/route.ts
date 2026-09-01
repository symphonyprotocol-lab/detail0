/**
 * GET /api/v1/usage -- consumption and quota, from the events. architecture.md
 * 11.1: the summary is rebuilt from usage events before it is read, so the
 * figures are always the ledger's figures. Workspace-scoped: an API key is
 * required, and a caller sees only their own numbers.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from '@/contracts/errors';
import { resolveApiKey } from '@/lib/application/auth/api-key';
import { usageOverview } from '@/lib/application/plans';
import { errorResponse, newRequestId } from '@/lib/http/respond';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const principal = await resolveApiKey(request.headers.get('authorization'));
    if (!principal) throw new AppError('invalid_api_key', 'an API key is required');

    const overview = await usageOverview(principal.workspaceId);
    return NextResponse.json(
      { ...overview, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
