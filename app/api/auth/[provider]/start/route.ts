/**
 * POST /api/auth/{provider}/start -- begin a login.
 *
 * POST rather than GET so the request carries an Origin to check
 * (architecture.md 15.3) and cannot be triggered by a bare link or a prefetch.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isIdentityProvider } from '@/lib/domain/auth';
import { beginOAuth } from '@/lib/application/auth';
import { callbackUrl, isSameOrigin, setHandshakeCookie } from '@/lib/http/session';
import {
  loginRedirect,
  logAuthFailure,
  withinRateLimit,
} from '@/lib/http/auth-endpoints';
import { newRequestId } from '@/lib/http/respond';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const requestId = newRequestId();
  const { provider } = await context.params;

  if (!isIdentityProvider(provider)) {
    return loginRedirect('oauth_failed');
  }
  if (!(await isSameOrigin())) {
    return new NextResponse('cross-origin request refused', { status: 403 });
  }
  if (!(await withinRateLimit(request, 'auth-start'))) {
    return loginRedirect('rate_limited');
  }

  const form = await request.formData().catch(() => null);
  const returnTo = form?.get('returnTo');

  try {
    const started = await beginOAuth({
      provider,
      returnTo: typeof returnTo === 'string' ? returnTo : undefined,
      redirectUri: callbackUrl(provider),
    });

    const response = NextResponse.redirect(started.redirectUrl, 303);
    setHandshakeCookie(response, started.handshake, started.expiresAt);
    return response;
  } catch (error) {
    logAuthFailure({
      requestId,
      provider,
      error: 'oauth_failed',
      detail: error instanceof Error ? error.message : 'unknown',
    });
    return loginRedirect('oauth_failed');
  }
}
