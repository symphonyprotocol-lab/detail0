/**
 * Replaceable identity adapter. GitHub and Google OAuth at launch.
 *
 * OAuth establishes identity only. It never implies the right to publish a
 * repository, website or document -- ownership goes through the claim flow.
 * requirement.md 3.2 and 7.3.
 */
import type { IdentityProfile, IdentityProvider } from '@/lib/domain/auth';
import * as github from '@/lib/infrastructure/identity/github';
import * as google from '@/lib/infrastructure/identity/google';

export type { IdentityProvider };

export interface AuthorizeInput {
  provider: IdentityProvider;
  state: string;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface ExchangeInput {
  provider: IdentityProvider;
  code: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
}

export interface IdentityAdapter {
  /** GitHub's web flow has no `code_challenge`; see github.ts. */
  supportsPkce(provider: IdentityProvider): boolean;
  authorizeUrl(input: AuthorizeInput): string;
  exchange(input: ExchangeInput): Promise<IdentityProfile>;
}

export function identityAdapter(): IdentityAdapter {
  return {
    supportsPkce: (provider) => provider === 'google',

    authorizeUrl: (input) =>
      input.provider === 'github'
        ? github.authorizeUrl({ state: input.state, redirectUri: input.redirectUri })
        : google.authorizeUrl({
            state: input.state,
            nonce: input.nonce,
            codeChallenge: input.codeChallenge,
            redirectUri: input.redirectUri,
          }),

    exchange: (input) =>
      input.provider === 'github'
        ? github.exchange({ code: input.code, redirectUri: input.redirectUri })
        : google.exchange({
            code: input.code,
            codeVerifier: input.codeVerifier,
            nonce: input.nonce,
            redirectUri: input.redirectUri,
          }),
  };
}

/** Reads the caller's own permission level on a repository. Used only by claim verification. */
export interface GithubPermissionReader {
  repositoryPermission(input: { accessToken: string; owner: string; repo: string }): Promise<{
    repositoryId: string;
    permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none';
  }>;
}
