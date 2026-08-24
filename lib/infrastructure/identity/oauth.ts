/**
 * Replaceable identity adapter. GitHub and Google OAuth at launch.
 *
 * OAuth establishes identity only. It never implies the right to publish a
 * repository, website or document -- ownership goes through the claim flow.
 * requirement.md 3.2 and 7.3.
 */
export type IdentityProvider = 'github' | 'google';

export interface IdentityAdapter {
  authorizeUrl(input: { provider: IdentityProvider; state: string; codeChallenge: string }): string;
  exchange(input: { provider: IdentityProvider; code: string; codeVerifier: string }): Promise<{
    subject: string;
    email: string;
    displayName: string | null;
  }>;
}

export function identityAdapter(): IdentityAdapter {
  throw new Error('not implemented: identityAdapter');
}

/** Reads the caller's own permission level on a repository. Used only by claim verification. */
export interface GithubPermissionReader {
  repositoryPermission(input: { accessToken: string; owner: string; repo: string }): Promise<{
    repositoryId: string;
    permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none';
  }>;
}
