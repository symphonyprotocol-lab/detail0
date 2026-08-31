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

/**
 * The retrieval result cache. architecture.md 9.4: it only ever holds results
 * of immutable versions, so entries never need updating -- the version in the
 * key is the invalidation. Every operation degrades to a miss or a no-op:
 * the cache buys p95, never correctness, and an Upstash outage must not fail
 * a request that the database can serve (9.4: "缓存不可用时直接穿透回源").
 *
 * `invalidateTag` supports the safety-suspension path: set() under a tag also
 * records the key in a Redis set (`tag -> key set`, 9.4), and revoking the
 * tag deletes every recorded key plus the set itself.
 */
export function retrievalCache(): RetrievalCache {
  const config = credentials();

  const command = async (parts: string[][]): Promise<{ result: unknown }[] | null> => {
    if (!config) return null;
    try {
      const response = await fetch(`${config.url}/pipeline`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(parts),
        signal: AbortSignal.timeout(2_000),
        cache: 'no-store',
      });
      if (!response.ok) return null;
      return (await response.json()) as { result: unknown }[];
    } catch {
      return null;
    }
  };

  return {
    async get(key) {
      const rows = await command([['GET', key]]);
      const value = rows?.[0]?.result;
      return typeof value === 'string' ? value : null;
    },
    async set(key, value, ttlSeconds) {
      await command([['SET', key, value, 'EX', String(ttlSeconds)]]);
    },
    async invalidateTag(tag) {
      const rows = await command([['SMEMBERS', tag]]);
      const members = Array.isArray(rows?.[0]?.result) ? (rows[0].result as string[]) : [];
      await command([['DEL', tag, ...members]]);
    },
  };
}

/** set() plus tag bookkeeping, for entries a safety suspension must revoke. */
export async function cacheSetTagged(
  cache: RetrievalCache,
  input: { key: string; value: string; ttlSeconds: number; tag: string },
): Promise<void> {
  await cache.set(input.key, input.value, input.ttlSeconds);
  const config = credentials();
  if (!config) return;
  try {
    await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify([
        ['SADD', input.tag, input.key],
        ['EXPIRE', input.tag, String(input.ttlSeconds * 2), 'NX'],
      ]),
      signal: AbortSignal.timeout(2_000),
      cache: 'no-store',
    });
  } catch {
    /* tag bookkeeping is best-effort; the entry still expires by TTL */
  }
}
