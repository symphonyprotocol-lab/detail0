/**
 * GET /api/v1/revenue -- the workspace's publisher earnings; POST accepts the
 * publisher agreement and opens the account. publisher-revenue-share.md
 * stage 2: figures are recomputed from the ledger on every read, and the
 * platform holds no funds -- the numbers describe accounting, not a balance
 * anyone can move.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from '@/contracts/errors';
import { resolveApiKey } from '@/lib/application/auth/api-key';
import { acceptPublisherAgreement, publisherEarnings } from '@/lib/application/revenue';
import { errorResponse, newRequestId } from '@/lib/http/respond';

export const runtime = 'nodejs';

async function workspaceOf(request: NextRequest): Promise<string> {
  const principal = await resolveApiKey(request.headers.get('authorization'));
  if (!principal) throw new AppError('invalid_api_key', 'an API key is required');
  return principal.workspaceId;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const workspaceId = await workspaceOf(request);
    const earnings = await publisherEarnings(workspaceId);
    return NextResponse.json(
      { ...earnings, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const workspaceId = await workspaceOf(request);

    let body: { agreementVersion?: unknown };
    try {
      body = (await request.json()) as { agreementVersion?: unknown };
    } catch {
      throw new AppError('invalid_request', 'the body must be JSON');
    }
    const agreementVersion =
      typeof body.agreementVersion === 'string' ? body.agreementVersion.trim() : '';
    if (agreementVersion.length === 0 || agreementVersion.length > 40) {
      throw new AppError('invalid_request', 'agreementVersion is required (1-40 characters)');
    }

    const { accountId } = await acceptPublisherAgreement({ workspaceId, agreementVersion });
    return NextResponse.json(
      { accountId, requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
