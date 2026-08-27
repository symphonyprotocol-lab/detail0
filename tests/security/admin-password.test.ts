import { describe, expect, it } from 'vitest';
import { auditHash } from '@/lib/application/administration/audit';
import { hashAdminPassword, verifyAdminPassword } from '@/lib/application/administration/password';

describe('administrator password hashing', () => {
  it('produces an Argon2id encoded hash, never the password', async () => {
    const hash = await hashAdminPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('correct horse');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashAdminPassword('same'), hashAdminPassword('same')]);
    expect(a).not.toBe(b);
    await expect(verifyAdminPassword('same', a)).resolves.toBe(true);
    await expect(verifyAdminPassword('same', b)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashAdminPassword('right');
    await expect(verifyAdminPassword('wrong', hash)).resolves.toBe(false);
    await expect(verifyAdminPassword('', hash)).resolves.toBe(false);
  });

  it('treats a malformed hash as a failed verification rather than throwing', async () => {
    for (const hash of ['', 'not-a-hash', '$argon2id$truncated']) {
      await expect(verifyAdminPassword('anything', hash)).resolves.toBe(false);
    }
  });
});

/**
 * architecture.md 14: the chain is what makes the log tamper-evident, so a
 * changed field or a re-ordered pair has to produce a different hash.
 */
describe('audit chain', () => {
  const base = {
    prevHash: null as string | null,
    administratorId: '11111111-1111-4111-8111-111111111111',
    action: 'admin.sign_in',
    targetType: 'administrator' as string | null,
    targetId: 'admin@re0.com' as string | null,
    reason: null as string | null,
    beforeValue: undefined as unknown,
    afterValue: undefined as unknown,
    ipDigest: 'abcd1234' as string | null,
    result: 'success',
    createdAt: new Date('2026-08-26T12:00:00.000Z'),
  };

  it('is deterministic for the same entry', async () => {
    expect(await auditHash(base)).toBe(await auditHash(base));
  });

  it('changes when any field changes', async () => {
    const original = await auditHash(base);
    for (const mutation of [
      { result: 'failure' },
      { action: 'admin.sign_out' },
      { targetId: 'other@re0.com' },
      { prevHash: 'earlier' },
      { createdAt: new Date('2026-08-26T12:00:01.000Z') },
      { ipDigest: null },
    ]) {
      expect(await auditHash({ ...base, ...mutation })).not.toBe(original);
    }
  });

  it('cannot be forged by shifting a delimiter between fields', async () => {
    // Length prefixes are what stop "a|b" and "a|" + "b" colliding.
    const left = await auditHash({ ...base, targetType: 'ab', targetId: 'c' });
    const right = await auditHash({ ...base, targetType: 'a', targetId: 'bc' });
    expect(left).not.toBe(right);
  });
});
