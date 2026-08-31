/**
 * Websites, `llms.txt` indexes and OpenAPI documents.
 *
 * Three source types share one connector because they differ only in how the
 * list of documents is discovered: a crawl finds it by following links, an
 * `llms.txt` is handed the list, and an OpenAPI document is a list of one.
 * Everything after discovery -- fetching, capping, ordering -- is identical,
 * and duplicating it three times is how the three would drift apart.
 */
import { IngestionFailure, INGESTION_LIMITS, parseSourceConfig } from '@/lib/domain/ingestion';
import { fetchDocument } from './http';
import type { FetchedFile, SourceSnapshot } from './types';

export type WebSourceType = 'website' | 'llms_txt' | 'openapi';

export async function fetchWebSnapshot(input: {
  type: WebSourceType;
  location: string;
}): Promise<SourceSnapshot> {
  const entry = new URL(input.location);
  const files =
    input.type === 'openapi'
      ? [await fetchOne(entry.toString(), entry)]
      : input.type === 'llms_txt'
        ? await fetchIndex(entry)
        : await crawl(entry);

  if (files.length === 0) {
    throw new IngestionFailure('source_empty', 'discover-parse', 'nothing was fetched');
  }

  return {
    files,
    config: parseSourceConfig(''),
    /* A page has no revision of its own; the snapshot digest is the identity. */
    revision: null,
    lastModifiedAt: null,
    /*
     * A crawled site says nothing machine-readable about its licence. Trust
     * treats that as absent rather than guessing from a footer.
     */
    hasLicense: false,
    stale: false,
  };
}

async function fetchOne(target: string, entry: URL): Promise<FetchedFile> {
  const resource = await fetchDocument(target, {
    maxBytes: INGESTION_LIMITS.maxDocumentBytes,
  });
  return { path: pathOf(resource.url, entry), url: resource.url, content: resource.body };
}

/**
 * An `llms.txt` index: fetch it, then fetch every document it links to.
 *
 * Links are restricted to the host the index was served from. An index is a
 * list of *this* site's documentation, and following it to another host would
 * let one site's index decide what gets published under another site's Library
 * ID -- the same reason architecture.md 15.1 treats source scope as a security
 * property rather than a convenience.
 */
async function fetchIndex(entry: URL): Promise<FetchedFile[]> {
  const index = await fetchDocument(entry.toString(), {
    maxBytes: INGESTION_LIMITS.maxDocumentBytes,
  });

  const files: FetchedFile[] = [
    { path: pathOf(index.url, entry), url: index.url, content: index.body },
  ];

  const targets = markdownLinks(index.body, entry)
    .filter((url) => url.hostname === entry.hostname)
    .slice(0, INGESTION_LIMITS.maxCrawlPages);

  for (const target of targets) {
    try {
      files.push(await fetchOne(target.toString(), entry));
    } catch (error) {
      /*
       * One dead link in an index is not a reason to abandon the build. A
       * failure that means the whole source is unusable -- the index itself --
       * has already been thrown above, before this loop.
       */
      if (error instanceof IngestionFailure && error.code === 'source_too_large') continue;
      if (error instanceof IngestionFailure) continue;
      throw error;
    }
  }
  return dedupe(files);
}

/**
 * A breadth-first crawl from one entry point, same host only.
 *
 * Breadth-first because depth-first on a documentation site walks straight into
 * the deepest changelog and spends the page budget there. The first pages a
 * crawl reaches from the entry point are the ones the site itself considers
 * important.
 */
async function crawl(entry: URL): Promise<FetchedFile[]> {
  const seen = new Set<string>([normalizeUrl(entry)]);
  let frontier: URL[] = [entry];
  const files: FetchedFile[] = [];

  for (let depth = 0; depth <= INGESTION_LIMITS.maxCrawlDepth; depth += 1) {
    const next: URL[] = [];
    for (const target of frontier) {
      if (files.length >= INGESTION_LIMITS.maxCrawlPages) break;

      let resource;
      try {
        resource = await fetchDocument(target.toString(), {
          maxBytes: INGESTION_LIMITS.maxDocumentBytes,
        });
      } catch (error) {
        // The entry point failing is fatal; a page discovered from it is not.
        if (files.length === 0) throw error;
        continue;
      }

      files.push({
        path: pathOf(resource.url, entry),
        url: resource.url,
        content: resource.body,
      });

      if (depth === INGESTION_LIMITS.maxCrawlDepth) continue;
      if (!resource.contentType.includes('html')) continue;

      for (const link of htmlLinks(resource.body, new URL(resource.url))) {
        const key = normalizeUrl(link);
        if (seen.has(key)) continue;
        if (link.hostname !== entry.hostname) continue;
        if (!link.pathname.startsWith(basePath(entry))) continue;
        seen.add(key);
        next.push(link);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return dedupe(files);
}

/**
 * The directory the entry point sits in.
 *
 * A crawl starting at `https://example.com/docs/` stays under `/docs/`. Without
 * this, one documentation section's Library ID would quietly acquire the whole
 * marketing site.
 */
function basePath(entry: URL): string {
  const path = entry.pathname;
  if (path.endsWith('/')) return path;
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut + 1);
}

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)/g;

function markdownLinks(body: string, base: URL): URL[] {
  const found: URL[] = [];
  for (const match of body.matchAll(MARKDOWN_LINK)) {
    const href = match[1];
    if (!href) continue;
    const url = toUrl(href, base);
    if (url) found.push(url);
  }
  return found;
}

const HREF = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;

function htmlLinks(body: string, base: URL): URL[] {
  const found: URL[] = [];
  for (const match of body.matchAll(HREF)) {
    const href = match[1];
    if (!href) continue;
    const url = toUrl(href, base);
    if (url) found.push(url);
  }
  return found;
}

/** Only absolute-resolvable https links; fragments and `mailto:` are dropped. */
function toUrl(href: string, base: URL): URL | null {
  if (href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) {
    return null;
  }
  try {
    const url = new URL(href, base);
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

/** Same page, one with a trailing slash and one without, is one page. */
function normalizeUrl(url: URL): string {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.host}${path}${url.search}`;
}

function pathOf(target: string, entry: URL): string {
  const url = new URL(target);
  const path = `${url.pathname}${url.search}`.replace(/^\/+/, '');
  if (url.hostname !== entry.hostname) return `${url.hostname}/${path}`;
  return path.length > 0 ? path : 'index';
}

/** A crawl reaches the same page by two paths often; a library should not. */
function dedupe(files: FetchedFile[]): FetchedFile[] {
  const byPath = new Map<string, FetchedFile>();
  for (const file of files) {
    if (!byPath.has(file.path)) byPath.set(file.path, file);
  }
  return [...byPath.values()];
}
