/**
 * A limiter for endpoints where losing the limit is not an acceptable
 * degradation.
 *
 * `rateLimiter()` in `./redis` deliberately fails *open*: it guards the OAuth
 * handshake, where an Upstash outage would lock every user out of a core
 * capability while offering an attacker nothing to guess. The console sign-in
 * is the opposite case -- it verifies a password, so every request is a guess,
 * and an unlimited endpoint is worth more to an attacker than a broken one is
 * to us.
 *
 * So this composes two layers:
 *
 * - Upstash when it is configured. If it is configured and then fails, the
 *   request is refused: a limiter that cannot count must not wave traffic past.
 * - An in-process fixed window otherwise, which is what makes local development
 *   and a not-yet-provisioned environment workable without leaving the endpoint
 *   completely unmetered. It only sees one instance's traffic, so it is a floor,
 *   never the real defence.
 */
import { rateLimiter, type RateLimitRule, type RateLimitVerdict } from './redis';

function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Live windows, partitioned by the scope their key names.
 *
 * One map for every scope meant one budget for every scope: a flood on the
 * cheapest endpoint filled it, and a full map refuses every key it has not
 * already seen. Anonymous retrieval keys hold an hour-long window, so enough
 * of them arriving at one instance denied the console sign-in -- an endpoint
 * they share no limit with, and the one an operator needs precisely then.
 * Partitioned, a scope can only exhaust its own capacity.
 */
const windows = new Map<string, Map<string, Window>>();

/** Bounded per scope, so a stream of distinct keys cannot grow one without limit. */
const MAX_TRACKED_KEYS = 10_000;

/** `ratelimit:<scope>:<digest>` (`rateLimitKey`), minus the caller's digest. */
function scopeOf(key: string): string {
  const cut = key.lastIndexOf(':');
  return cut === -1 ? key : key.slice(0, cut);
}

function localCheck(key: string, rule: RateLimitRule, now: number): RateLimitVerdict {
  const scope = scopeOf(key);
  let scoped = windows.get(scope);
  if (!scoped) {
    scoped = new Map<string, Window>();
    windows.set(scope, scoped);
  }

  const existing = scoped.get(key);
  if (!existing || existing.resetAt <= now) {
    if (scoped.size >= MAX_TRACKED_KEYS) {
      for (const [candidate, window] of scoped) {
        if (window.resetAt <= now) scoped.delete(candidate);
      }
      /* Still full: every window in *this* scope is live, so refuse rather
         than stop counting. Every other scope keeps its own budget. */
      if (scoped.size >= MAX_TRACKED_KEYS) {
        return { allowed: false, remaining: 0, retryAfterSeconds: rule.windowSeconds };
      }
    }
    scoped.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= rule.limit;
  return {
    allowed,
    remaining: Math.max(0, rule.limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

export async function strictRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): Promise<RateLimitVerdict> {
  // The local floor always runs, so a shared limiter cannot be the only brake.
  const local = localCheck(key, rule, now);
  if (!local.allowed) return local;

  if (!upstashConfigured()) return local;

  try {
    const shared = await rateLimiter().check(key, rule);
    // `check` swallows its own failures and reports `degraded`; here that is a
    // refusal, because a configured limiter that stopped counting is a fault,
    // not a green light.
    if (shared.degraded) {
      return { allowed: false, remaining: 0, retryAfterSeconds: rule.windowSeconds };
    }
    return shared;
  } catch {
    return { allowed: false, remaining: 0, retryAfterSeconds: rule.windowSeconds };
  }
}

/** Test seam: the in-process windows are module state. */
export function resetStrictRateLimit(): void {
  windows.clear();
}
