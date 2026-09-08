/**
 * POST /api/v1/claims/{claimId}/verify -- run the claim's check now.
 *
 * Answers the contract's `verifyClaimOutput`. A failed check is a 422 with the
 * 7.3.8 reason code; the DNS answer, the fetched body and GitHub's permission
 * table never leave the server. The GitHub method cannot be run from here at
 * all -- it needs the account's own consent, which only the web flow can
 * collect -- so it answers `account_not_linked` with that next step.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { verifyClaim } from '@/lib/application/claims';
import { errorResponse, newRequestId } from '@/lib/http/respond';
import { claimPrincipal } from '../../principal';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ claimId: string }> },
): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const [principal, { claimId }] = await Promise.all([
      claimPrincipal(request, { mutation: true }),
      context.params,
    ]);
    const result = await verifyClaim({
      claimId,
      workspaceId: principal.workspaceId,
      role: principal.role,
    });
    return NextResponse.json(
      {
        claimId: result.claimId,
        status: result.status,
        checks: result.checks.map((check) => ({ ...check, label: check.key })),
        disputed: result.disputed,
        requestId,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
