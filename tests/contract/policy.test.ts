/**
 * The policy evaluator's precedence, as decisions. architecture.md 10.2 is a
 * hierarchy, not a checklist: switches and the blocklist refuse first and
 * nothing overrides them, select mode admits only its list, and "always
 * allow" bypasses exactly the quality thresholds -- no more.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluatePolicy,
  OPEN_POLICY,
  type PolicySubject,
  type WorkspacePolicy,
} from '@/lib/domain/policy';

const subject = (overrides: Partial<PolicySubject> = {}): PolicySubject => ({
  publicId: '/websites/target',
  sourceTypes: ['website'],
  trustScore: 80,
  verified: true,
  ageDays: 10,
  ...overrides,
});

const policy = (overrides: Partial<WorkspacePolicy>): WorkspacePolicy => ({
  ...OPEN_POLICY,
  quality: { ...OPEN_POLICY.quality },
  ...overrides,
});

describe('precedence', () => {
  it('the open policy admits everything', () => {
    expect(evaluatePolicy(OPEN_POLICY, subject()).allowed).toBe(true);
  });

  it('a disabled source type refuses, and excepted does not override it', () => {
    const p = policy({
      mode: 'quality',
      sourceTypes: { website: false },
      exceptedLibraries: ['/websites/target'],
    });
    expect(evaluatePolicy(p, subject())).toEqual({
      allowed: false,
      reason: 'source_type_disabled',
    });
  });

  it('one disabled source among several still refuses the library', () => {
    const p = policy({ sourceTypes: { notion: false } });
    expect(evaluatePolicy(p, subject({ sourceTypes: ['github', 'notion'] })).allowed).toBe(false);
  });

  it('the blocklist wins over excepted and over the select allowlist', () => {
    const both = policy({
      mode: 'quality',
      blockedLibraries: ['/websites/target'],
      exceptedLibraries: ['/websites/target'],
    });
    expect(evaluatePolicy(both, subject())).toEqual({ allowed: false, reason: 'library_blocked' });

    const selected = policy({
      mode: 'select',
      blockedLibraries: ['/websites/target'],
      allowedLibraries: ['/websites/target'],
    });
    expect(evaluatePolicy(selected, subject()).allowed).toBe(false);
  });

  it('select mode admits only the allowlist', () => {
    const p = policy({ mode: 'select', allowedLibraries: ['/websites/other'] });
    expect(evaluatePolicy(p, subject())).toEqual({
      allowed: false,
      reason: 'not_in_allowlist',
    });
    expect(evaluatePolicy(p, subject({ publicId: '/websites/other' })).allowed).toBe(true);
  });
});

describe('quality thresholds', () => {
  it('refuses below the trust threshold, and excepted bypasses exactly that', () => {
    const p = policy({
      mode: 'quality',
      quality: { requireVerified: false, minTrustScore: 90, maxAgeDays: null },
      exceptedLibraries: ['/websites/excepted'],
    });
    expect(evaluatePolicy(p, subject({ trustScore: 80 }))).toEqual({
      allowed: false,
      reason: 'below_trust_threshold',
    });
    expect(
      evaluatePolicy(p, subject({ publicId: '/websites/excepted', trustScore: 0 })).allowed,
    ).toBe(true);
  });

  it('requires verification when asked', () => {
    const p = policy({
      mode: 'quality',
      quality: { requireVerified: true, minTrustScore: null, maxAgeDays: null },
    });
    expect(evaluatePolicy(p, subject({ verified: false }))).toEqual({
      allowed: false,
      reason: 'unverified_library',
    });
  });

  it('refuses stale content, and unknown age passes', () => {
    const p = policy({
      mode: 'quality',
      quality: { requireVerified: false, minTrustScore: null, maxAgeDays: 30 },
    });
    expect(evaluatePolicy(p, subject({ ageDays: 45 }))).toEqual({
      allowed: false,
      reason: 'stale_library',
    });
    expect(evaluatePolicy(p, subject({ ageDays: null })).allowed).toBe(true);
  });

  it('quality thresholds do not apply outside quality mode', () => {
    const p = policy({
      quality: { requireVerified: true, minTrustScore: 100, maxAgeDays: 1 },
    });
    expect(evaluatePolicy(p, subject({ trustScore: 0, verified: false })).allowed).toBe(true);
  });
});
