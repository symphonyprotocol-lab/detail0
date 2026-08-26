import { afterEach, describe, expect, it } from 'vitest';
import { resetStrictRateLimit, strictRateLimit } from '@/lib/infrastructure/cache/strict-rate-limit';

/**
 * The console sign-in verifies a password, so every request is a guess and an
 * unmetered endpoint is worth more to an attacker than a refused one is to us.
 * `rateLimiter()` fails open by design for the OAuth handshake; this one must
 * not inherit that.
 */
const RULE = { limit: 3, windowSeconds: 60 };
const ORIGINAL_URL = process.env.UPSTASH_REDIS_REST_URL;
const ORIGINAL_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

afterEach(() => {
  resetStrictRateLimit();
  const env = process.env as Record<string, string | undefined>;
  if (ORIGINAL_URL === undefined) delete env.UPSTASH_REDIS_REST_URL;
  else env.UPSTASH_REDIS_REST_URL = ORIGINAL_URL;
  if (ORIGINAL_TOKEN === undefined) delete env.UPSTASH_REDIS_REST_TOKEN;
  else env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_TOKEN;
});

describe('strictRateLimit without Upstash', () => {
  it('still counts, rather than waving everything through', async () => {
    for (let attempt = 1; attempt <= RULE.limit; attempt += 1) {
      await expect(strictRateLimit('k', RULE)).resolves.toMatchObject({ allowed: true });
    }
    await expect(strictRateLimit('k', RULE)).resolves.toMatchObject({ allowed: false });
  });

  it('keys buckets separately', async () => {
    for (let attempt = 0; attempt <= RULE.limit; attempt += 1) await strictRateLimit('a', RULE);
    await expect(strictRateLimit('a', RULE)).resolves.toMatchObject({ allowed: false });
    await expect(strictRateLimit('b', RULE)).resolves.toMatchObject({ allowed: true });
  });

  it('lets the window lapse', async () => {
    const start = Date.now();
    for (let attempt = 0; attempt <= RULE.limit; attempt += 1) {
      await strictRateLimit('k', RULE, start);
    }
    await expect(strictRateLimit('k', RULE, start)).resolves.toMatchObject({ allowed: false });
    await expect(
      strictRateLimit('k', RULE, start + RULE.windowSeconds * 1000 + 1),
    ).resolves.toMatchObject({ allowed: true });
  });

  it('reports a retry hint when it refuses', async () => {
    const start = Date.now();
    for (let attempt = 0; attempt <= RULE.limit; attempt += 1) {
      await strictRateLimit('k', RULE, start);
    }
    const verdict = await strictRateLimit('k', RULE, start);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('strictRateLimit with a configured but broken Upstash', () => {
  it('refuses rather than falling back to allowing', async () => {
    const env = process.env as Record<string, string | undefined>;
    // Points at an address that cannot answer, so `check` reports degraded.
    env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:1';
    env.UPSTASH_REDIS_REST_TOKEN = 'token';

    await expect(strictRateLimit('k', RULE)).resolves.toMatchObject({ allowed: false });
  });
});
