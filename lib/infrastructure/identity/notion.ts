/**
 * Notion OAuth (public integration).
 *
 * Notion's authorize endpoint takes `client_id`, `redirect_uri`,
 * `response_type=code`, `owner=user` and `state`; there is no PKCE, so the
 * handshake is protected the way GitHub's is (see github.ts): a sealed state
 * cookie, a fixed redirect URI registered on the integration, and a
 * server-side exchange that carries the client secret as HTTP Basic auth.
 *
 * Unlike the login providers this is never an identity: the token it yields
 * is kept, sealed, by the application layer, because Notion content can only
 * be read with it -- at creation and at every refresh after.
 */
import { AppError } from '@/contracts/errors';
import { AuthFailure } from '@/lib/domain/auth';
import type { PageFacts } from '@/lib/domain/notion';

const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const API_URL = 'https://api.notion.com/v1';

/** Pinned: Notion versions its API by date and changes object shapes between. */
export const NOTION_VERSION = '2022-06-28';

const TIMEOUT_MS = 8_000;

function clientId(): string {
  const value = process.env.NOTION_OAUTH_CLIENT_ID;
  if (!value) throw new Error('NOTION_OAUTH_CLIENT_ID is not set');
  return value;
}

function clientSecret(): string {
  const value = process.env.NOTION_OAUTH_CLIENT_SECRET;
  if (!value) throw new Error('NOTION_OAUTH_CLIENT_SECRET is not set');
  return value;
}

/** Whether the connect flow can be offered at all. */
export function isNotionOAuthConfigured(): boolean {
  return Boolean(process.env.NOTION_OAUTH_CLIENT_ID && process.env.NOTION_OAUTH_CLIENT_SECRET);
}

export function connectAuthorizeUrl(input: { state: string; redirectUri: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  /* The person picks the pages on Notion's consent screen; the grant is theirs. */
  url.searchParams.set('owner', 'user');
  url.searchParams.set('state', input.state);
  return url.toString();
}

export interface PageGrant {
  accessToken: string;
  /** The integration's bot id in this workspace; one per connection. */
  botId: string;
  workspaceId: string;
  workspaceName: string | null;
  /** The Notion user who granted; null when Notion reports a workspace owner. */
  notionUserId: string | null;
  /** How the wizard names the connection: the person, else the workspace. */
  ownerName: string | null;
}

interface TokenResponse {
  access_token?: string;
  bot_id?: string;
  workspace_id?: string;
  workspace_name?: string | null;
  owner?: {
    type?: string;
    user?: { id?: string; name?: string | null; person?: { email?: string } };
  };
  error?: string;
}

/** Exchanges a connect code for the token and the workspace it opens. */
export async function exchangeForPageGrant(input: {
  code: string;
  redirectUri: string;
}): Promise<PageGrant> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`, 'utf8').toString('base64');
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'notion-version': NOTION_VERSION,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new AuthFailure('provider_unavailable', 'notion token endpoint unreachable');
  }

  /* Notion answers a bad code with 400 and an `error` body, not a 5xx. */
  if (!response.ok && response.status >= 500) {
    throw new AuthFailure('provider_unavailable', `notion token endpoint ${response.status}`);
  }
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!body.access_token || !body.bot_id || !body.workspace_id) {
    throw new AuthFailure('oauth_failed', `notion token exchange rejected: ${body.error ?? 'no token'}`);
  }
  const user = body.owner?.type === 'user' ? body.owner.user : undefined;
  return {
    accessToken: body.access_token,
    botId: body.bot_id,
    workspaceId: body.workspace_id,
    workspaceName: body.workspace_name ?? null,
    notionUserId: user?.id ?? null,
    ownerName: user?.name ?? body.workspace_name ?? null,
  };
}

/* ------------------------------------------------------------- page reads */

/**
 * A token Notion no longer honours answers 401; the caller forgets the
 * connection and asks the person to connect again.
 */
export class NotionGrantRevoked extends Error {
  constructor() {
    super('notion grant revoked');
    this.name = 'NotionGrantRevoked';
  }
}

export function notionHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'notion-version': NOTION_VERSION,
  };
}

async function pageApi<T>(
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...notionHeaders(token),
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new AppError('provider_unavailable', `notion ${path} unreachable`);
  }
  if (response.status === 401) throw new NotionGrantRevoked();
  /* A page the grant does not cover is a 404 from Notion, never a 403. */
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new AppError('provider_unavailable', `notion ${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

interface RichText {
  plain_text?: string;
}

interface PageRecord {
  object?: string;
  id?: string;
  url?: string;
  last_edited_time?: string;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, { type?: string; title?: RichText[] }>;
}

interface SearchResponse {
  results?: PageRecord[];
  next_cursor?: string | null;
  has_more?: boolean;
}

function pageFrom(record: PageRecord): PageFacts | null {
  if (record.object !== 'page' || !record.id) return null;
  let title = '';
  for (const property of Object.values(record.properties ?? {})) {
    if (property.type === 'title') {
      title = (property.title ?? []).map((entry) => entry.plain_text ?? '').join('');
      break;
    }
  }
  return {
    id: record.id,
    title: title.trim() || 'Untitled',
    url: record.url ?? `https://www.notion.so/${record.id.replace(/-/g, '')}`,
    lastEditedAt: record.last_edited_time ?? null,
    archived: record.archived === true || record.in_trash === true,
  };
}

/** At most this many pages are listed for the wizard, newest edit first. */
const LIST_PAGES = 3;
const PAGE_SIZE = 100;

/**
 * The pages the grant can read, newest edit first.
 *
 * Search with no query and the `page` filter is Notion's own "everything
 * shared with this integration"; database rows are pages too and show up
 * here, which is fine -- each is importable on its own.
 */
export async function listAccessiblePages(token: string): Promise<PageFacts[]> {
  const all: PageFacts[] = [];
  let cursor: string | null = null;
  for (let page = 1; page <= LIST_PAGES; page += 1) {
    const list: SearchResponse | null = await pageApi<SearchResponse>('/search', token, {
      filter: { property: 'object', value: 'page' },
      sort: { timestamp: 'last_edited_time', direction: 'descending' },
      page_size: PAGE_SIZE,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    if (!list) break;
    for (const record of list.results ?? []) {
      const facts = pageFrom(record);
      if (facts && !facts.archived) all.push(facts);
    }
    cursor = list.has_more ? (list.next_cursor ?? null) : null;
    if (!cursor) break;
  }
  return all;
}

/** One page by id, or null when the grant cannot see it. */
export async function readPage(token: string, pageId: string): Promise<PageFacts | null> {
  const record = await pageApi<PageRecord>(`/pages/${encodeURIComponent(pageId)}`, token);
  return record ? pageFrom(record) : null;
}
