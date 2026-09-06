/**
 * GET /api/auth/{github|notion}/callback/connect -- finish an import-access
 * grant.
 *
 * Lands back on the wizard with `?github=` or `?notion=` set to
 * `connected|canceled|failed`; the provider's message, the state comparison
 * and the exchange detail stay in the server log (architecture.md 5.4,
 * response minimisation). The grant is stored under the *current session's*
 * account, so the callback needs one: a session that lapsed mid-consent goes
 * to login and the person starts again, rather than the grant landing on
 * nobody.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AuthFailure } from '@/lib/domain/auth';
import { GITHUB_CONNECT_RETURN_TO, type GithubConnectOutcome } from '@/lib/domain/github';
import { NOTION_CONNECT_RETURN_TO } from '@/lib/domain/notion';
import {
  completeGithubConnect,
  completeNotionConnect,
  connectReturnPath,
  notionConnectReturnPath,
  resolveSession,
} from '@/lib/application/auth';
import {
  appRedirect,
  loginRedirect,
  logAuthFailure,
  withinRateLimit,
} from '@/lib/http/auth-endpoints';
import { newRequestId } from '@/lib/http/respond';
import {
  clearGithubConnectCookie,
  clearNotionConnectCookie,
  GITHUB_CONNECT_COOKIE,
  githubConnectCallbackUrl,
  NOTION_CONNECT_COOKIE,
  notionConnectCallbackUrl,
  SESSION_COOKIE,
} from '@/lib/http/session';

type ConnectProvider = 'github' | 'notion';

function isConnectProvider(value: string): value is ConnectProvider {
  return value === 'github' || value === 'notion';
}

/** Everything that differs between the two providers, in one place. */
function flow(provider: ConnectProvider) {
  return provider === 'github'
    ? {
        home: GITHUB_CONNECT_RETURN_TO,
        cookie: GITHUB_CONNECT_COOKIE,
        redirectUri: githubConnectCallbackUrl(),
        clear: clearGithubConnectCookie,
        returnPath: connectReturnPath,
        complete: async (input: {
          userId: string;
          code: string | null;
          state: string | null;
          sealedHandshake: string | undefined;
          redirectUri: string;
        }) => (await completeGithubConnect(input)).returnTo,
      }
    : {
        home: NOTION_CONNECT_RETURN_TO,
        cookie: NOTION_CONNECT_COOKIE,
        redirectUri: notionConnectCallbackUrl(),
        clear: clearNotionConnectCookie,
        returnPath: notionConnectReturnPath,
        complete: async (input: {
          userId: string;
          code: string | null;
          state: string | null;
          sealedHandshake: string | undefined;
          redirectUri: string;
        }) => (await completeNotionConnect(input)).returnTo,
      };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const requestId = newRequestId();
  const { provider } = await context.params;
  if (!isConnectProvider(provider)) {
    return new NextResponse('not found', { status: 404 });
  }
  const f = flow(provider);
  const land = (returnTo: string, outcome: GithubConnectOutcome): NextResponse => {
    const response = appRedirect(f.returnPath(returnTo, outcome));
    f.clear(response);
    return response;
  };

  const session = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const response = loginRedirect(undefined, f.home);
    f.clear(response);
    return response;
  }
  if (!(await withinRateLimit(request, `${provider}-connect-callback`))) {
    return land(f.home, 'failed');
  }

  const params = request.nextUrl.searchParams;
  if (params.get('error')) {
    const denied = params.get('error') === 'access_denied';
    return land(f.home, denied ? 'canceled' : 'failed');
  }

  try {
    const returnTo = await f.complete({
      userId: session.user.id,
      code: params.get('code'),
      state: params.get('state'),
      sealedHandshake: request.cookies.get(f.cookie)?.value,
      redirectUri: f.redirectUri,
    });
    return land(returnTo, 'connected');
  } catch (error) {
    const failure =
      error instanceof AuthFailure ? error : new AuthFailure('oauth_failed', 'unexpected failure');
    logAuthFailure({
      requestId,
      provider: `${provider}-connect`,
      error: failure.loginError,
      detail: error instanceof Error ? error.message : 'unknown',
    });
    return land(f.home, 'failed');
  }
}
