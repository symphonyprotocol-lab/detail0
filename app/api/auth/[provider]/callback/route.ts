/**
 * GET /api/auth/{provider}/callback -- finish a login.
 *
 * Everything that can go wrong here ends the same way: a redirect to /login
 * with a coarse code. The provider's own message, the state comparison result
 * and the exchange detail stay in the server log.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from '@/contracts/errors';
import { AuthFailure, isIdentityProvider } from '@/lib/domain/auth';
import { completeOAuth } from '@/lib/application/auth';
import { completeGithubGrant, peekGrantHandshake } from '@/lib/application/claims';
import {
  callbackUrl,
  clearHandshakeCookie,
  clientSummary,
  currentSession,
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
  const sealedHandshake = request.cookies.get(HANDSHAKE_COOKIE)?.value;

  /*
   * A claim's GitHub grant comes back through the same registered callback
   * (lib/application/claims/github-grant.ts). It is finished here and never
   * becomes a login: the session that started it must still be there, and
   * the outcome goes back to the claim page as a stable code.
   */
  const grant = provider === 'github' ? await peekGrantHandshake(sealedHandshake) : null;
  if (grant) {
    const response = await finishGrant({
      request,
      requestId,
      sealedHandshake,
      returnTo: grant.returnTo,
    });
    clearHandshakeCookie(response);
    return response;
  }

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
      sealedHandshake,
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

async function finishGrant(input: {
  request: NextRequest;
  requestId: string;
  sealedHandshake: string | undefined;
  returnTo: string;
}): Promise<NextResponse> {
  const params = input.request.nextUrl.searchParams;
  const back = (outcome: string) => appRedirect(`${input.returnTo}&grant=${outcome}`);

  if (params.get('error')) {
    return back(params.get('error') === 'access_denied' ? 'canceled' : 'failed');
  }
  const session = await currentSession();
  if (!session) return loginRedirect(undefined, input.returnTo);

  try {
    const result = await completeGithubGrant({
      code: params.get('code'),
      state: params.get('state'),
      sealedHandshake: input.sealedHandshake,
      redirectUri: callbackUrl('github'),
      userId: session.user.id,
      workspaceId: session.workspace.id,
    });
    return back(result.disputed ? 'disputed' : result.status);
  } catch (error) {
    if (error instanceof AppError && error.reason) return back(error.reason);
    logAuthFailure({
      requestId: input.requestId,
      provider: 'github',
      error: 'oauth_failed',
      detail: `claim grant: ${error instanceof Error ? error.message : 'unknown'}`,
    });
    return back('failed');
  }
}
