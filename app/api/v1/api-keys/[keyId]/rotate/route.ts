/**
 * POST /api/v1/api-keys/{keyId}/rotate -- replace a key. requirement.md 5.2.
 *
 * The replacement carries the old key's name, environment and scopes and is
 * returned in plaintext exactly once; the old key stops working in the same
 * transaction. 404 when the key is not this workspace's live key.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from '@/contracts/errors';
import { rotateApiKey } from '@/lib/application/auth';
import { errorResponse, newRequestId } from '@/lib/http/respond';
import { keyManager } from '../../principal';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ keyId: string }> },
): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const manager = await keyManager(request);
    const { keyId } = await context.params;
    const rotated = await rotateApiKey({
      workspaceId: manager.workspaceId,
      role: manager.role,
      keyId,
    });
    if (!rotated) throw new AppError('invalid_request', 'no live key with that id');
    return NextResponse.json(
      { key: rotated.key, replaced: rotated.replaced, ...rotated.view, requestId },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
