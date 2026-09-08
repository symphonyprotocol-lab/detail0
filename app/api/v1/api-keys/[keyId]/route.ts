/**
 * DELETE /api/v1/api-keys/{keyId} -- revoke. requirement.md 9.2.
 *
 * A timestamp, not a delete: the row keeps explaining historical usage.
 * Idempotent and scoped -- a key that is not this workspace's, or is already
 * revoked, answers the same 204, because which of those it was is not for
 * the caller to learn.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { revokeApiKey } from '@/lib/application/auth';
import { errorResponse, newRequestId } from '@/lib/http/respond';
import { keyManager } from '../principal';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ keyId: string }> },
): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const manager = await keyManager(request);
    const { keyId } = await context.params;
    await revokeApiKey({ workspaceId: manager.workspaceId, role: manager.role, keyId });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': requestId } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
