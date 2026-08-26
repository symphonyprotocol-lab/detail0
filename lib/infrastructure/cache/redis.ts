/**
 * Upstash Redis. Two jobs only: anonymous rate limiting and retrieval cache.
 *
 * Explicitly out of scope (architecture.md 1.2):
 * - no vector storage
 * - no long-running workflows or queues
 * - no quota counting -- reservations and usage events are billing facts and
 *   must stay in the same transaction as the business database (11.1)
 */

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  /**
   * True when nothing was actually counted -- Upstash is unconfigured or did
   * not answer -- so `allowed` is a fallback, not a verdict. Callers that fail
   * open ignore it; callers that must not (`strictRateLimit`) refuse on it.
   */
  degraded?: boolean;
}

export interface RateLimiter {
  check(key: string, rule: RateLimitRule): Promise<RateLimitVerdict>;
}

export interface RetrievalCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  invalidateTag(tag: string): Promise<void>;
}

function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

/**
 * Fixed window counter over the Upstash REST pipeline.
 *
 * Deliberately simpler than the anonymous playground limiter of §11.2 (sliding
 * window plus an in-process ban cache): the endpoints protected here are login
 * start and callback, where the goal is to blunt bursts, not to price out a
 * sustained attack on a metered resource.
 *
 * Degradation differs from §11.2 as well. Anonymous playground calls fail
 * closed; login does not, because an Upstash outage would otherwise lock every
 * user out of a core capability while offering an attacker nothing to guess --
 * no credential is verified at our endpoint. Missing configuration in
 * development is likewise allowed, so the flow runs without Redis locally.
 */
export function rateLimiter(): RateLimiter {
  return {
    async check(key, rule) {
      const config = credentials();
      if (!config) {
        return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, degraded: true };
      }

      try {
        const response = await fetch(`${config.url}/pipeline`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify([
            ['INCR', key],
            ['EXPIRE', key, String(rule.windowSeconds), 'NX'],
          ]),
          signal: AbortSignal.timeout(2_000),
          cache: 'no-store',
        });
        if (!response.ok) {
          return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, degraded: true };
        }

        const [incr] = (await response.json()) as { result: number }[];
        const used = Number(incr?.result ?? 0);
        const remaining = Math.max(0, rule.limit - used);
        return {
          allowed: used <= rule.limit,
          remaining,
          retryAfterSeconds: used <= rule.limit ? 0 : rule.windowSeconds,
        };
      } catch {
        return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, degraded: true };
      }
    },
  };
}

export function retrievalCache(): RetrievalCache {
  throw new Error('not implemented: retrievalCache adapter');
}
