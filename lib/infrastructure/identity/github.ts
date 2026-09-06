/**
 * GitHub OAuth (web application flow).
 *
 * GitHub's authorize endpoint documents `client_id`, `redirect_uri`, `scope`,
 * `state` and `allow_signup` -- there is no `code_challenge`, so PKCE is not
 * available here. The handshake is protected by the sealed state cookie, a
 * fixed redirect URI registered on the OAuth app, and a server-side exchange
 * that carries the client secret. Google (see google.ts) does use PKCE.
 */
import { AppError } from '@/contracts/errors';
import { AuthFailure, type IdentityProfile } from '@/lib/domain/auth';
import { GITHUB_CONNECT_SCOPE, type RepositoryFacts } from '@/lib/domain/github';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API_URL = 'https://api.github.com';

/** Identity only. Repository access for imports is granted later, on its own consent (below). */
const SCOPE = 'read:user user:email';

const TIMEOUT_MS = 8_000;

function clientId(): string {
  const value = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!value) throw new Error('GITHUB_OAUTH_CLIENT_ID is not set');
  return value;
}

function clientSecret(): string {
  const value = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!value) throw new Error('GITHUB_OAUTH_CLIENT_SECRET is not set');
  return value;
}

export function authorizeUrl(input: { state: string; redirectUri: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', input.state);
  url.searchParams.set('allow_signup', 'true');
  return url.toString();
}

async function accessToken(code: string, redirectUri: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId(),
        client_secret: clientSecret(),
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new AuthFailure('provider_unavailable', 'github token endpoint unreachable');
  }

  if (!response.ok) {
    throw new AuthFailure('provider_unavailable', `github token endpoint ${response.status}`);
  }

  const body = (await response.json()) as { access_token?: string; error?: string };
  if (!body.access_token) {
    throw new AuthFailure('oauth_failed', `github token exchange rejected: ${body.error ?? 'no token'}`);
  }
  return body.access_token;
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 're0',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new AuthFailure('provider_unavailable', `github ${path} unreachable`);
  }

  if (!response.ok) {
    throw new AuthFailure('oauth_failed', `github ${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Exchanges the code for a profile.
 *
 * The access token is used for these two reads and then dropped: nothing
 * persists it, so no provider credential enters the database at login time
 * (requirement.md 12). Claim verification asks for its own token later.
 */
export async function exchange(input: {
  code: string;
  redirectUri: string;
}): Promise<IdentityProfile> {
  const token = await accessToken(input.code, input.redirectUri);
  const [profile, emails] = await Promise.all([
    apiGet<GithubUser>('/user', token),
    apiGet<GithubEmail[]>('/user/emails', token),
  ]);

  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  if (!primary) {
    throw new AuthFailure('email_unverified', 'github account has no verified email');
  }

  return {
    provider: 'github',
    subject: String(profile.id),
    email: primary.email,
    emailVerified: true,
    displayName: profile.name ?? profile.login,
    avatarUrl: profile.avatar_url,
  };
}

/* ------------------------------------------------- repository connection */

/**
 * The second consent: connecting the account for repository imports.
 *
 * Same OAuth app, its own redirect URI (a sub-path of the registered
 * callback, which GitHub permits) and the read-only scope from
 * lib/domain/github.ts. The token this yields *is* kept, sealed, by the
 * application layer -- unlike the login token above.
 */
export function connectAuthorizeUrl(input: { state: string; redirectUri: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', GITHUB_CONNECT_SCOPE);
  url.searchParams.set('state', input.state);
  url.searchParams.set('allow_signup', 'false');
  return url.toString();
}

export interface RepositoryGrant {
  accessToken: string;
  scope: string;
  /** GitHub's numeric account id, as text. */
  githubUserId: string;
  login: string;
}

/** Exchanges a connect code for the token and the account it belongs to. */
export async function exchangeForRepositoryGrant(input: {
  code: string;
  redirectUri: string;
}): Promise<RepositoryGrant> {
  const { accessToken: token, scope } = await accessTokenWithScope(input.code, input.redirectUri);
  const profile = await apiGet<GithubUser>('/user', token);
  return { accessToken: token, scope, githubUserId: String(profile.id), login: profile.login };
}

async function accessTokenWithScope(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; scope: string }> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId(),
        client_secret: clientSecret(),
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new AuthFailure('provider_unavailable', 'github token endpoint unreachable');
  }
  if (!response.ok) {
    throw new AuthFailure('provider_unavailable', `github token endpoint ${response.status}`);
  }
  const body = (await response.json()) as { access_token?: string; scope?: string; error?: string };
  if (!body.access_token) {
    throw new AuthFailure('oauth_failed', `github token exchange rejected: ${body.error ?? 'no token'}`);
  }
  return { accessToken: body.access_token, scope: body.scope ?? '' };
}

/** What GitHub says about a repository, reduced to what import rules read. */
export interface GithubRepository extends RepositoryFacts {
  name: string;
  description: string | null;
  defaultBranch: string | null;
  /** ISO timestamp of the last push, or null. */
  pushedAt: string | null;
}

interface RepositoryRecord {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  default_branch?: string;
  pushed_at?: string | null;
  private: boolean;
  fork: boolean;
  archived?: boolean;
  owner: { id: number };
}

function repositoryFrom(record: RepositoryRecord): GithubRepository {
  return {
    id: record.id,
    name: record.name,
    fullName: record.full_name,
    description: record.description,
    defaultBranch: record.default_branch ?? null,
    pushedAt: record.pushed_at ?? null,
    ownerId: record.owner.id,
    private: record.private,
    fork: record.fork,
    archived: record.archived === true,
  };
}

/**
 * A token the account revoked on GitHub's side answers 401; the caller
 * forgets the connection and asks the person to connect again.
 */
export class GithubGrantRevoked extends Error {
  constructor() {
    super('github grant revoked');
    this.name = 'GithubGrantRevoked';
  }
}

async function repositoryApi<T>(path: string, token: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 're0',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new AppError('provider_unavailable', `github ${path} unreachable`);
  }
  if (response.status === 401) throw new GithubGrantRevoked();
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new AppError('provider_unavailable', `github ${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

/** At most this many repositories are listed for the wizard, newest push first. */
const LIST_PAGES = 3;
const PAGE_SIZE = 100;

/**
 * The public repositories the token's account owns, newest push first.
 *
 * `affiliation=owner` and `visibility=public` are GitHub's own filters; the
 * fork rule is ours and is applied by the caller through the domain, so the
 * list and the submit-time check cannot drift apart.
 */
export async function listOwnedPublicRepositories(token: string): Promise<GithubRepository[]> {
  const all: GithubRepository[] = [];
  for (let page = 1; page <= LIST_PAGES; page += 1) {
    const records = await repositoryApi<RepositoryRecord[]>(
      `/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=${PAGE_SIZE}&page=${page}`,
      token,
    );
    if (!records || records.length === 0) break;
    all.push(...records.map(repositoryFrom));
    if (records.length < PAGE_SIZE) break;
  }
  return all;
}

/** One repository by `owner/name`, or null when GitHub has none by that name. */
export async function readRepository(
  token: string,
  location: string,
): Promise<GithubRepository | null> {
  const [owner, name] = location.split('/');
  if (!owner || !name) return null;
  const record = await repositoryApi<RepositoryRecord>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    token,
  );
  return record ? repositoryFrom(record) : null;
}
