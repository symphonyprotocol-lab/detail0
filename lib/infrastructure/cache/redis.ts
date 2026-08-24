/**
 * Upstash Redis. Two jobs only: anonymous rate limiting and retrieval cache.
 *
 * Explicitly out of scope (architecture.md 1.2):
 * - no vector storage
 * - no long-running workflows or queues
 * - no quota counting -- reservations and usage events are billing facts and
 *   must stay in the same transaction as the business database (11.1)
 */
export interface RateLimiter {
  check(key: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

export interface RetrievalCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  invalidateTag(tag: string): Promise<void>;
}

export function rateLimiter(): RateLimiter {
  throw new Error('not implemented: rateLimiter adapter');
}

export function retrievalCache(): RetrievalCache {
  throw new Error('not implemented: retrievalCache adapter');
}
