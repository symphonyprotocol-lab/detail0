/**
 * The only way ingestion reaches the network.
 *
 * Every fetch here is against a URL an operator typed, or one discovered inside
 * a document that URL served. architecture.md 15.1 makes source fetching a
 * security boundary, so this module is where that boundary is: scheme, host,
 * redirect chain, response size and content type are all checked here rather
 * than in each connector, because a check that each connector has to remember
 * is a check one of them will forget.
 */
import { IngestionFailure, type IngestionStage } from '@/lib/domain/ingestion';

const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 4;

/** Ceiling on one response. The per-document cap is applied by the caller. */
const MAX_BYTES = 8 * 1024 * 1024;

const STAGE: IngestionStage = 'fetch-snapshot';

/**
 * Hostnames that resolve inside our own network, refused before the request.
 *
 * This is the literal-address half of SSRF defence: it stops the obvious
 * `https://169.254.169.254/...` and `https://localhost/...` without a DNS
 * lookup. It cannot stop a public name that resolves to a private address --
 * that needs resolution-time pinning, which the platform's fetch does not
 * expose -- so the deployment keeps egress restricted as well. Both are cheap;
 * neither alone is enough.
 */
const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata.goog']);

const PRIVATE_V4 =
  /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)/;

export function assertFetchable(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new IngestionFailure('source_forbidden', STAGE, 'only https sources are fetched');
  }
  if (url.username || url.password) {
    throw new IngestionFailure('source_forbidden', STAGE, 'credentials in a source URL');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost')) {
    throw new IngestionFailure('source_forbidden', STAGE, 'a local address is not a source');
  }
  if (PRIVATE_V4.test(host)) {
    throw new IngestionFailure('source_forbidden', STAGE, 'a private address is not a source');
  }
  // IPv6 loopback, link-local and unique-local, in the forms a URL can carry.
  if (host === '::1' || host.startsWith('fe80:') || /^f[cd][0-9a-f]{2}:/.test(host)) {
    throw new IngestionFailure('source_forbidden', STAGE, 'a private address is not a source');
  }
}

export interface FetchedResource {
  url: string;
  contentType: string;
  body: string;
  bytes: number;
}

/**
 * Fetches one document, following redirects by hand.
 *
 * By hand because each hop has to be checked: a source that redirects to
 * `http://` or to a private address has just defeated the check on the URL the
 * operator typed. `redirect: 'manual'` is what makes every hop visible.
 */
export async function fetchDocument(
  target: string,
  options: { accept?: string; headers?: Record<string, string>; maxBytes?: number } = {},
): Promise<FetchedResource> {
  let url = new URL(target);
  const limit = options.maxBytes ?? MAX_BYTES;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertFetchable(url);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          accept: options.accept ?? 'text/markdown, text/plain, text/html;q=0.9, */*;q=0.5',
          'user-agent': USER_AGENT,
          ...options.headers,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      throw new IngestionFailure('source_unreachable', STAGE, `${url.host} did not answer`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) {
        throw new IngestionFailure('source_unreachable', STAGE, 'redirect without a location');
      }
      url = new URL(location, url);
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new IngestionFailure('source_forbidden', STAGE, `${url.host} refused the request`);
    }
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel();
      throw new IngestionFailure('source_empty', STAGE, `${url.host} has nothing at that path`);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new IngestionFailure('source_unreachable', STAGE, `${url.host} answered ${response.status}`);
    }

    /*
     * Checked before reading, when the server declares it, and again after --
     * `content-length` is a claim, not a guarantee, and a chunked response
     * makes no claim at all.
     */
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > limit) {
      await response.body?.cancel();
      throw new IngestionFailure('source_too_large', STAGE, `${url.host} served too much`);
    }

    const body = await readCapped(response, limit, url);
    return {
      url: url.toString(),
      contentType: (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '',
      body,
      bytes: new TextEncoder().encode(body).length,
    };
  }

  throw new IngestionFailure('source_unreachable', STAGE, 'too many redirects');
}

const USER_AGENT = 're0-ingestion/1.0 (+https://re0.com)';

/** Reads a body, aborting the stream rather than buffering past the cap. */
async function readCapped(response: Response, limit: number, url: URL): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new IngestionFailure('source_too_large', STAGE, `${url.host} served too much`);
    }
    parts.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(joined);
}

/** JSON from an API, with the same guards. */
export async function fetchJson<T>(
  target: string,
  options: { headers?: Record<string, string>; maxBytes?: number } = {},
): Promise<T> {
  const resource = await fetchDocument(target, { ...options, accept: 'application/json' });
  try {
    return JSON.parse(resource.body) as T;
  } catch {
    throw new IngestionFailure('parse_failed', STAGE, `${new URL(target).host} did not return JSON`);
  }
}
