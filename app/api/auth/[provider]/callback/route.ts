/**
 * GET /api/auth/{provider}/callback -- finish a login.
 *
 * Everything that can go wrong here ends the same way: a redirect to /login
 * with a coarse code. The provider's own message, the state comparison result
 * and the exchange detail stay in the server log.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AuthFailure, isIdentityProvider } from '@/lib/domain/auth';
import { completeOAuth } from '@/lib/application/auth';
import {
  callbackUrl,
  clearHandshakeCookie,
  clientSummary,
  HANDSHAKE_COOKIE,
  setSessionCookie,
} from '@/lib/http/session';
import {
  appRedirect,
  loginRedirect,
  logAuthFailure,
  withinRateLimit,
} from '@/lib/http/auth-endpoints';
import { newRequestId } from '@/lib/http/respond';
import { messagesFor } from '@/lib/i18n/dictionary';
import { LOCALE_COOKIE, resolveLocale } from '@/lib/i18n/locale';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const requestId = newRequestId();
  const { provider } = await context.params;

  if (!isIdentityProvider(provider)) {
    return loginRedirect('oauth_failed');
  }
  if (!(await withinRateLimit(request, 'auth-callback'))) {
    return loginRedirect('rate_limited');
  }

  const params = request.nextUrl.searchParams;
  // The user pressed "cancel" on the provider's consent screen.
  if (params.get('error')) {
    const denied = params.get('error') === 'access_denied';
    const response = loginRedirect(denied ? 'oauth_canceled' : 'oauth_failed');
    clearHandshakeCookie(response);
    return response;
  }

  try {
    const result = await completeOAuth({
      provider,
      code: params.get('code'),
      state: params.get('state'),
      sealedHandshake: request.cookies.get(HANDSHAKE_COOKIE)?.value,
      redirectUri: callbackUrl(provider),
      clientSummary: clientSummary(request.headers.get('user-agent')),
      // First login names the personal workspace, once and for good, so it has
      // to be named in the language this visitor arrived in.
      workspaceNaming: messagesFor(
        resolveLocale({
          cookie: request.cookies.get(LOCALE_COOKIE)?.value,
          acceptLanguage: request.headers.get('accept-language'),
        }),
      ).auth,
    });

    const response = appRedirect(result.returnTo);
    setSessionCookie(response, result.sessionToken, result.expiresAt);
    clearHandshakeCookie(response);
    return response;
  } catch (error) {
    const failure =
      error instanceof AuthFailure ? error : new AuthFailure('oauth_failed', 'unexpected failure');
    logAuthFailure({
      requestId,
      provider,
      error: failure.loginError,
      detail: error instanceof Error ? error.message : 'unknown',
    });

    const response = loginRedirect(failure.loginError);
    clearHandshakeCookie(response);
    return response;
  }
}
