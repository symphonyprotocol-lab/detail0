import { describe, expect, it } from 'vitest';
import {
  TOTP_STEP_SECONDS,
  base32Decode,
  base32Encode,
  randomTotpSecret,
  totpCounter,
  totpProvisioningUri,
  verifyTotp,
  verifyTotpCounter,
} from '@/lib/domain/totp';

/** RFC 4648 §10 test vectors, so the encoder matches what an app expects. */
describe('base32', () => {
  const encoder = new TextEncoder();

  it('matches the RFC 4648 vectors', () => {
    expect(base32Encode(encoder.encode('f'))).toBe('MY');
    expect(base32Encode(encoder.encode('fo'))).toBe('MZXQ');
    expect(base32Encode(encoder.encode('foo'))).toBe('MZXW6');
    expect(base32Encode(encoder.encode('foobar'))).toBe('MZXW6YTBOI');
  });

  it('round-trips random secrets', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect(Array.from(base32Decode(base32Encode(bytes)) ?? [])).toEqual(Array.from(bytes));
  });

  it('returns null rather than throwing on junk', () => {
    expect(base32Decode('not base32!')).toBeNull();
    expect(base32Decode('')).toBeNull();
  });
});

/**
 * RFC 6238 Appendix B, the SHA-1 rows: secret "12345678901234567890" as base32.
 * These are the vectors every authenticator implementation is checked against.
 */
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

describe('verifyTotp', () => {
  it('accepts the RFC 6238 reference codes', async () => {
    const vectors: [number, string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ];
    for (const [seconds, code] of vectors) {
      await expect(verifyTotp(RFC_SECRET, code, new Date(seconds * 1000), 0)).resolves.toBe(true);
    }
  });

  it('accepts one step of clock drift either side, and no more', async () => {
    const at = new Date(1111111109 * 1000);
    const oneStepEarlier = new Date(at.getTime() - TOTP_STEP_SECONDS * 1000);
    const oneStepLater = new Date(at.getTime() + TOTP_STEP_SECONDS * 1000);
    const twoStepsEarlier = new Date(at.getTime() - 2 * TOTP_STEP_SECONDS * 1000);
    const twoStepsLater = new Date(at.getTime() + 2 * TOTP_STEP_SECONDS * 1000);
    const threeStepsLater = new Date(at.getTime() + 3 * TOTP_STEP_SECONDS * 1000);

    // One step of drift in either direction is inside the window...
    await expect(verifyTotp(RFC_SECRET, '081804', oneStepEarlier)).resolves.toBe(true);
    await expect(verifyTotp(RFC_SECRET, '081804', oneStepLater)).resolves.toBe(true);
    // ...and exactly two steps, either side, is already outside it.
    await expect(verifyTotp(RFC_SECRET, '081804', twoStepsEarlier)).resolves.toBe(false);
    await expect(verifyTotp(RFC_SECRET, '081804', twoStepsLater)).resolves.toBe(false);
    await expect(verifyTotp(RFC_SECRET, '081804', threeStepsLater)).resolves.toBe(false);
  });

  it('refuses a wrong code, a wrong shape and a wrong secret', async () => {
    const at = new Date(1111111109 * 1000);
    await expect(verifyTotp(RFC_SECRET, '000000', at)).resolves.toBe(false);
    await expect(verifyTotp(RFC_SECRET, '81804', at)).resolves.toBe(false);
    await expect(verifyTotp(RFC_SECRET, '0818040', at)).resolves.toBe(false);
    await expect(verifyTotp(RFC_SECRET, 'abcdef', at)).resolves.toBe(false);
    await expect(verifyTotp(randomTotpSecret(), '081804', at)).resolves.toBe(false);
  });

  it('refuses an empty or malformed secret instead of accepting anything', async () => {
    await expect(verifyTotp('', '081804', new Date(1111111109 * 1000))).resolves.toBe(false);
    await expect(verifyTotp('!!!!', '081804', new Date(1111111109 * 1000))).resolves.toBe(false);
  });

  it('steps every 30 seconds', () => {
    expect(totpCounter(new Date(59_000))).toBe(1);
    expect(totpCounter(new Date(60_000))).toBe(2);
  });
});

describe('totpProvisioningUri', () => {
  it('carries the parameters an authenticator needs', () => {
    const uri = totpProvisioningUri({
      secret: 'JBSWY3DPEHPK3PXP',
      account: 'admin@re0.com',
      issuer: 're0',
    });
    expect(uri.startsWith('otpauth://totp/re0%3Aadmin%40re0.com?')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=re0');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});

/**
 * RFC 6238 5.2: a code must be spendable once. Without this an observed code
 * stays usable for its whole step plus the drift window either side.
 */
describe('replay protection', () => {
  const at = new Date(1111111109 * 1000);
  const step = Math.floor(1111111109 / 30);

  it('reports the step a code matched, so it can be marked spent', async () => {
    await expect(verifyTotpCounter(RFC_SECRET, '081804', at, { window: 0 })).resolves.toBe(step);
  });

  it('refuses a step at or below the last one spent', async () => {
    await expect(
      verifyTotpCounter(RFC_SECRET, '081804', at, { minCounter: step }),
    ).resolves.toBeNull();
    await expect(
      verifyTotpCounter(RFC_SECRET, '081804', at, { minCounter: step + 1 }),
    ).resolves.toBeNull();
  });

  it('still accepts a later step once an earlier one is spent', async () => {
    const later = new Date(at.getTime() + 30_000);
    const code = String(await verifyTotpCounter(RFC_SECRET, '081804', at, { window: 0 }));
    expect(code).toBe(String(step));
    // The next step's own code is unaffected by the previous step being spent.
    await expect(
      verifyTotpCounter(RFC_SECRET, '050471', later, { minCounter: step, window: 1 }),
    ).resolves.toBe(step + 1);
  });

  it('treats a null last-counter as nothing spent yet', async () => {
    await expect(
      verifyTotpCounter(RFC_SECRET, '081804', at, { minCounter: null }),
    ).resolves.toBe(step);
  });
});
