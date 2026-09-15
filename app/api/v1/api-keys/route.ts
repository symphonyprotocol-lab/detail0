/**
 * GET / POST /api/v1/api-keys -- a workspace's keys. requirement.md 9.2.
 *
 * GET lists what the server keeps: prefix, last four, scopes, timestamps.
 * POST mints one and answers with the plaintext exactly once
 * (architecture.md 5.1); the body is `{ name, environment?, scopes? }`.
 * Revocation and rotation are per key, under `/api-keys/{keyId}`.
 *
 * Route Handlers may only call lib/application use cases. architecture.md 4.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from '@/contracts/errors';
import { createApiKey, listApiKeys } from '@/lib/application/auth';
import { errorResponse, newRequestId } from '@/lib/http/respond';
import { jsonBody, keyManager } from './principal';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'private, no-store' };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const manager = await keyManager(request);
    const keys = await listApiKeys(manager.workspaceId);
    return NextResponse.json({ keys, requestId }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const manager = await keyManager(request);
    const body = await jsonBody(request);
    if (typeof body.name !== 'string') {
      throw new AppError('invalid_request', 'name is required');
    }
    const { key, view } = await createApiKey({
      workspaceId: manager.workspaceId,
      role: manager.role,
      name: body.name,
      environment: body.environment,
      scopes: body.scopes,
    });
    return NextResponse.json({ key, ...view, requestId }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
