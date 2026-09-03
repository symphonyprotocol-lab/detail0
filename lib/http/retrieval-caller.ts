/**
 * Who is asking, for the retrieval endpoints. architecture.md 12.1: Bearer API
 * keys authenticate a workspace; anonymous requests are allowed onto the open
 * Search/Context subset, but only through the anonymous rate limit -- which
 * fails CLOSED (architecture.md 11.2: a limiter that cannot count must not
 * wave unmetered trial traffic through).
 */
import type { NextRequest } from 'next/server';
import { AppError } from '@/contracts/errors';
import { resolveApiKey } from '@/lib/application/auth/api-key';
import { resolveSession } from '@/lib/application/auth';
import type { CallerContext } from '@/lib/application/retrieval';
import { rateLimitKey } from '@/lib/http/auth-endpoints';
import { SESSION_COOKIE } from '@/lib/http/session';
import type { RateLimitRule } from '@/lib/infrastructure/cache/redis';
import { strictRateLimit } from '@/lib/infrastructure/cache/strict-rate-limit';

/**
 * Wide enough to try the product, narrow enough that scraping the corpus
 * anonymously costs more than signing up.
 */
const ANONYMOUS_RATE_RULE: RateLimitRule = { limit: 30, windowSeconds: 3_600 };

export async function retrievalCaller(
  request: NextRequest,
  requestId: string,
): Promise<CallerContext> {
  const principal = await resolveApiKey(request.headers.get('authorization'));

  if (principal) {
    return {
      workspaceId: principal.workspaceId,
      apiKeyId: principal.apiKeyId,
      requestId,
      anonymous: false,
    };
  }

  const verdict = await strictRateLimit(
    await rateLimitKey(request, 'retrieval'),
    ANONYMOUS_RATE_RULE,
  );
  if (!verdict.allowed) {
    throw new AppError('rate_limited', 'anonymous limit reached; retry later or use an API key');
  }

  return { workspaceId: null, apiKeyId: null, requestId, anonymous: true };
}

/**
 * The playground's caller: an API key, else the browser session, else
 * anonymous.
 *
 * The retrieval endpoints above stay key-only -- a cookie must not
 * authenticate a cross-site POST to /v1. The playground is the site's own
 * page, and its promise to a signed-in visitor ("each exchange counts as one
 * API call") is only kept if the session is what the request runs as: metered
 * by the workspace's quota rather than the anonymous limit, and answered by
 * the models the workspace's plan buys. A session that cannot be resolved --
 * expired, or the database briefly unreachable -- degrades to anonymous, the
 * way the marketing header does.
 */
export async function playgroundCaller(
  request: NextRequest,
  requestId: string,
): Promise<CallerContext> {
  const principal = await resolveApiKey(request.headers.get('authorization'));
  if (principal) {
    return {
      workspaceId: principal.workspaceId,
      apiKeyId: principal.apiKeyId,
      requestId,
      anonymous: false,
    };
  }

  const session = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value).catch(
    (error: unknown) => {
      console.warn(`session lookup failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    },
  );
  if (session) {
    return { workspaceId: session.workspace.id, apiKeyId: null, requestId, anonymous: false };
  }

  return retrievalCaller(request, requestId);
}
