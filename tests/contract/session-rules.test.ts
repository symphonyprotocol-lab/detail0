import { describe, expect, it } from 'vitest';
import {
  firstBillingPeriod,
  isSessionLive,
  personalWorkspaceName,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  sessionExpiryFrom,
  shouldTouchSession,
  workspaceInitial,
  type IdentityProfile,
} from '@/lib/domain/auth';
import { uuidv7 } from '@/lib/domain/id';

const now = new Date('2026-08-25T10:00:00.000Z');
const live = {
  expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
  lastSeenAt: now,
  revokedAt: null,
};

describe('session lifetime', () => {
  it('accepts a fresh session', () => {
    expect(isSessionLive(live, now)).toBe(true);
  });

  it('rejects a revoked session even before it expires', () => {
    expect(isSessionLive({ ...live, revokedAt: now }, now)).toBe(false);
  });

  it('rejects an expired session', () => {
    expect(isSessionLive({ ...live, expiresAt: now }, now)).toBe(false);
  });

  it('rejects a session that idled out', () => {
    const idle = { ...live, lastSeenAt: new Date(now.getTime() - SESSION_IDLE_MS - 1) };
    expect(isSessionLive(idle, now)).toBe(false);
  });

  it('rewrites last_seen_at at most once an hour', () => {
    expect(shouldTouchSession(live, now)).toBe(false);
    const stale = { ...live, lastSeenAt: new Date(now.getTime() - 61 * 60 * 1000) };
    expect(shouldTouchSession(stale, now)).toBe(true);
  });

  it('expires 30 days out', () => {
    expect(sessionExpiryFrom(now).toISOString()).toBe('2026-09-24T10:00:00.000Z');
  });
});

describe('first login', () => {
  const profile: IdentityProfile = {
    provider: 'github',
    subject: '1',
    email: 'dev@example.com',
    emailVerified: true,
    displayName: 'Ada Lovelace',
    avatarUrl: null,
  };

  it('opens a one-month billing period', () => {
    const period = firstBillingPeriod(now);
    expect(period.start).toBe(now);
    expect(period.end.toISOString()).toBe('2026-09-25T10:00:00.000Z');
  });

  it('names the personal workspace after the profile, falling back to the mailbox', () => {
    const naming = { personalWorkspace: '{owner} 的空间', fallbackOwner: '个人' };
    expect(personalWorkspaceName(profile, naming)).toBe('Ada Lovelace 的空间');
    expect(personalWorkspaceName({ ...profile, displayName: null }, naming)).toBe('dev 的空间');
  });

  it('takes the monogram from the first character, including CJK', () => {
    expect(workspaceInitial('Ada Lovelace 的空间')).toBe('A');
    expect(workspaceInitial('个人空间')).toBe('个');
  });
});

describe('uuidv7', () => {
  it('is a v7 uuid that sorts by time', () => {
    const early = uuidv7(now.getTime());
    const later = uuidv7(now.getTime() + 1000);
    expect(early).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(early < later).toBe(true);
  });
});
