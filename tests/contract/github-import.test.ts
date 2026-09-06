/**
 * The import rule for GitHub repositories (lib/domain/github.ts): a
 * workspace imports its own public, non-fork repositories and nothing else,
 * decided by the owner's account id rather than the login, and the same
 * predicate filters the wizard's list and refuses at submit.
 */
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

import { describe, expect, it } from 'vitest';
import {
  GITHUB_CONNECT_SCOPE,
  importableRepositories,
  importRefusal,
  isGithubConnectHandshake,
  isGithubConnectOutcome,
  type RepositoryFacts,
} from '@/lib/domain/github';
import { connectReturnPath } from '@/lib/application/auth/github-connection';

const mine: RepositoryFacts = {
  id: 1,
  fullName: 'octocat/docs',
  ownerId: 42,
  private: false,
  fork: false,
  archived: false,
};

describe('repository import rule', () => {
  it('accepts a public, non-fork repository the account owns', () => {
    expect(importRefusal(mine, '42')).toBeNull();
    expect(importRefusal({ ...mine, archived: true }, '42')).toBeNull();
  });

  it('refuses forks and private repositories', () => {
    expect(importRefusal({ ...mine, fork: true }, '42')).toBe('fork');
    expect(importRefusal({ ...mine, private: true }, '42')).toBe('private');
  });

  it('refuses another account’s repository first, whatever else is wrong with it', () => {
    expect(importRefusal(mine, '7')).toBe('not_owner');
    expect(importRefusal({ ...mine, private: true, fork: true }, '7')).toBe('not_owner');
  });

  it('filters a listing with the same rule', () => {
    const listed = importableRepositories(
      [
        mine,
        { ...mine, id: 2, fullName: 'octocat/forked', fork: true },
        { ...mine, id: 3, fullName: 'octocat/secret', private: true },
        { ...mine, id: 4, fullName: 'someone/else', ownerId: 7 },
        { ...mine, id: 5, fullName: 'octocat/old', archived: true },
      ],
      '42',
    );
    expect(listed.map((repository) => repository.fullName)).toEqual(['octocat/docs', 'octocat/old']);
  });

  it('asks for no repository write scope', () => {
    expect(GITHUB_CONNECT_SCOPE).not.toMatch(/repo/);
  });
});

describe('connect handshake and outcome', () => {
  it('recognises only its own handshake shape', () => {
    expect(
      isGithubConnectHandshake({ purpose: 'github_connect', state: 's', returnTo: '/dashboard', expiresAt: 1 }),
    ).toBe(true);
    /* The login handshake has no purpose field; it must not pass for a connect one. */
    expect(
      isGithubConnectHandshake({ provider: 'github', state: 's', nonce: 'n', codeVerifier: 'v', returnTo: '/', expiresAt: 1 }),
    ).toBe(false);
    expect(isGithubConnectHandshake(null)).toBe(false);
  });

  it('lands back on an in-app path with the outcome, never elsewhere', () => {
    expect(connectReturnPath('/dashboard/libraries/new', 'connected')).toBe(
      '/dashboard/libraries/new?github=connected',
    );
    expect(connectReturnPath('https://evil.example/x', 'failed')).toBe('/dashboard?github=failed');
    expect(connectReturnPath('//evil.example', 'canceled')).toBe('/dashboard?github=canceled');
    expect(isGithubConnectOutcome('connected')).toBe(true);
    expect(isGithubConnectOutcome('anything')).toBe(false);
  });
});
