process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

import { describe, expect, it } from 'vitest';
import { seal, unseal } from '@/lib/infrastructure/crypto/sealed';
import {
  base64UrlDecode,
  base64UrlEncode,
  codeChallengeS256,
  randomToken,
  timingSafeEqual,
} from '@/lib/infrastructure/crypto/tokens';
import { isHandshakeShape, type Handshake } from '@/lib/application/auth/handshake';

const handshake: Handshake = {
  provider: 'google',
  state: 'state-value',
  nonce: 'nonce-value',
  codeVerifier: 'verifier-value',
  returnTo: '/dashboard',
  expiresAt: 1_800_000_000_000,
};

describe('sealed handshake cookie', () => {
  it('round trips', async () => {
    const sealed = await seal(handshake);
    expect(sealed).not.toContain('state-value');
    await expect(unseal<Handshake>(sealed)).resolves.toEqual(handshake);
  });

  it('returns null instead of throwing on a tampered or foreign value', async () => {
    const sealed = await seal(handshake);
    const [iv, data] = sealed.split('.');
    /* A deterministic bit-flip in the ciphertext: decode, XOR the last byte,
       re-encode. (Rewriting base64url characters can be the identity when the
       payload already ends in them, which made this assertion flaky.) */
    const bytes = base64UrlDecode(data!);
    bytes[bytes.length - 1]! ^= 0x01;
    const flipped = `${iv}.${base64UrlEncode(bytes)}`;
    expect(flipped).not.toBe(sealed);

    await expect(unseal(flipped)).resolves.toBeNull();
    await expect(unseal('not-a-sealed-value')).resolves.toBeNull();
    await expect(unseal(undefined)).resolves.toBeNull();
  });

  it('rejects payloads that decrypt but are not a handshake', () => {
    expect(isHandshakeShape({ ...handshake, provider: 'facebook' })).toBe(false);
    expect(isHandshakeShape({ state: 'only-state' })).toBe(false);
    expect(isHandshakeShape(null)).toBe(false);
    expect(isHandshakeShape(handshake)).toBe(true);
  });
});

describe('token helpers', () => {
  it('mints distinct, URL safe tokens', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('compares without leaking on length or content', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('derives the documented PKCE S256 challenge', async () => {
    // RFC 7636 appendix B vector.
    await expect(codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});
