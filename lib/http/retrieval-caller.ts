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
import type { CallerContext } from '@/lib/application/retrieval';
import { rateLimitKey } from '@/lib/http/auth-endpoints';
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
