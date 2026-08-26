import { describe, expect, it } from 'vitest';
import {
  ADMIN_CAPABILITIES,
  ADMIN_LOGIN_ERRORS,
  ADMIN_LOCKOUT_MS,
  ADMIN_MAX_FAILED_ATTEMPTS,
  ADMIN_SESSION_IDLE_MS,
  adminSessionExpiryFrom,
  capabilitiesForRoles,
  isAdminLoginError,
  isAdminRoleId,
  isAdminSessionLive,
  isLockedOut,
  lockoutUntil,
  roleAllows,
  safeAdminReturnTo,
  shouldTouchAdminSession,
} from '@/lib/domain/admin';

const NOW = new Date('2026-08-26T12:00:00.000Z');

/**
 * requirement.md 3.1 and 5.3: least privilege. Widening a preset role by
 * accident is the kind of change that looks harmless in a diff, so the shape
 * of the matrix is pinned here rather than only drawn on a page.
 */
describe('admin capabilities', () => {
  it('gives the super administrator everything and no one else', () => {
    expect(capabilitiesForRoles(['super'])).toEqual([...ADMIN_CAPABILITIES]);
    for (const role of ['operator', 'reviewer', 'support'] as const) {
      expect(capabilitiesForRoles([role])).not.toEqual([...ADMIN_CAPABILITIES]);
    }
  });

  it('keeps administrators and audit out of every non-super role', () => {
    for (const role of ['operator', 'reviewer', 'support'] as const) {
      expect(roleAllows(role, 'administrators')).toBe(false);
      expect(roleAllows(role, 'audit')).toBe(false);
    }
  });

  it('grants nothing at all when no role is assigned', () => {
    expect(capabilitiesForRoles([])).toEqual([]);
  });

  it('unions roles without inventing a capability', () => {
    const granted = capabilitiesForRoles(['reviewer', 'support']);
    expect(granted).toEqual(['users', 'libraries']);
  });

  it('rejects a role id that is not one of the presets', () => {
    expect(isAdminRoleId('super')).toBe(true);
    expect(isAdminRoleId('root')).toBe(false);
    expect(isAdminRoleId(undefined)).toBe(false);
  });
});

/**
 * A console session holds the power to suspend accounts and rewrite quotas, so
 * it expires within a working day and idles out over a coffee break -- far
 * shorter than the 30-day product session.
 */
describe('admin session lifetime', () => {
  const live = { expiresAt: new Date(NOW.getTime() + 3_600_000), lastSeenAt: NOW, revokedAt: null };

  it('accepts a session that is fresh, unexpired and not revoked', () => {
    expect(isAdminSessionLive(live, NOW)).toBe(true);
  });

  it('refuses a revoked session even inside its window', () => {
    expect(isAdminSessionLive({ ...live, revokedAt: NOW }, NOW)).toBe(false);
  });

  it('refuses an expired session', () => {
    expect(isAdminSessionLive({ ...live, expiresAt: NOW }, NOW)).toBe(false);
  });

  it('idles out well before the absolute window closes', () => {
    const idled = { ...live, lastSeenAt: new Date(NOW.getTime() - ADMIN_SESSION_IDLE_MS - 1) };
    expect(isAdminSessionLive(idled, NOW)).toBe(false);
    expect(ADMIN_SESSION_IDLE_MS).toBeLessThan(
      adminSessionExpiryFrom(NOW).getTime() - NOW.getTime(),
    );
  });

  it('expires within a working day', () => {
    expect(adminSessionExpiryFrom(NOW).getTime() - NOW.getTime()).toBeLessThanOrEqual(
      8 * 60 * 60 * 1000,
    );
  });

  it('only rewrites last_seen_at once the touch interval has passed', () => {
    expect(shouldTouchAdminSession(live, NOW)).toBe(false);
    expect(
      shouldTouchAdminSession({ ...live, lastSeenAt: new Date(NOW.getTime() - 120_000) }, NOW),
    ).toBe(true);
  });
});

describe('admin lockout', () => {
  it('does not lock before the threshold', () => {
    expect(lockoutUntil(ADMIN_MAX_FAILED_ATTEMPTS - 1, NOW)).toBeNull();
  });

  it('locks at the threshold and stays locked for the window', () => {
    const until = lockoutUntil(ADMIN_MAX_FAILED_ATTEMPTS, NOW);
    expect(until).not.toBeNull();
    expect(isLockedOut(until, NOW)).toBe(true);
    expect(isLockedOut(until, new Date(NOW.getTime() + ADMIN_LOCKOUT_MS + 1))).toBe(false);
  });

  it('treats an absent lock as unlocked', () => {
    expect(isLockedOut(null, NOW)).toBe(false);
  });
});

/**
 * An open redirect out of the console is worth more to an attacker than one out
 * of the dashboard, so the allow list is narrower: `/admin/...` and nothing
 * else, and never back onto the sign-in itself.
 */
describe('safeAdminReturnTo', () => {
  it('keeps a console path', () => {
    expect(safeAdminReturnTo('/admin/users')).toBe('/admin/users');
    expect(safeAdminReturnTo('/admin/audit?page=2')).toBe('/admin/audit?page=2');
  });

  it('refuses anything outside the console', () => {
    for (const input of [
      '/dashboard',
      '/',
      'https://evil.example/admin/users',
      '//evil.example',
      '/admin',
      '\\/admin/users',
      '/admin/users\\..\\..',
      '/adminevil',
      undefined,
      42,
    ]) {
      expect(safeAdminReturnTo(input)).toBe('/admin/overview');
    }
  });

  it('refuses the sign-in page, which would loop', () => {
    expect(safeAdminReturnTo('/admin/login')).toBe('/admin/overview');
    expect(safeAdminReturnTo('/admin/login?error=locked')).toBe('/admin/overview');
  });

  it('refuses a path carrying control characters', () => {
    expect(safeAdminReturnTo('/admin/users\nLocation: https://evil.example')).toBe(
      '/admin/overview',
    );
  });
});

describe('admin login errors', () => {
  it('does not leak which factor failed', () => {
    // A separate "wrong code" reply would confirm the password was right.
    expect(isAdminLoginError('mfa_invalid')).toBe(false);
    expect(isAdminLoginError('invalid_credentials')).toBe(true);
  });

  it('has no code that would reveal an address belongs to an administrator', () => {
    // `locked` would say "this address is one of ours" to an anonymous caller,
    // undoing the decoy-hash work in sign-in-admin.
    expect(isAdminLoginError('locked')).toBe(false);
    expect(ADMIN_LOGIN_ERRORS).toEqual(['invalid_credentials', 'rate_limited', 'unavailable']);
  });
});
