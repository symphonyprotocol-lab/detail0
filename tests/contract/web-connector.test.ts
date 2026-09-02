/**
 * How a website becomes a list of files. architecture.md 8.2, step 2.
 *
 * The network is faked; what is under test is discovery -- which pages a crawl
 * asks for, in which order, and what it calls them -- plus the two request
 * headers that decide whether a documentation host answers at all, and with
 * what. Each of these is a decision a real site would only reveal by failing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { fetchWebSnapshot } from '@/lib/infrastructure/connectors/web';

type Page = { body: string; type?: string };

const HOST = 'https://docs.example.test';

/** A fake site. Anything not listed is a 404. */
function serve(pages: Record<string, Page>) {
  const requests: { url: string; headers: Headers }[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, headers: new Headers(init?.headers) });
    const page = pages[url.replace(HOST, '')];
    if (!page) return new Response('missing', { status: 404 });
    return new Response(page.body, {
      status: 200,
      headers: { 'content-type': page.type ?? 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;
  return requests;
}

const html = (links: string[]) =>
  `<html><body><h1>Page</h1>${links.map((l) => `<a href="${l}">x</a>`).join('')}</body></html>`;

const urlset = (locs: string[]) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs
    .map((l) => `<url><loc>${HOST}${l}</loc></url>`)
    .join('')}</urlset>`;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function crawlPaths(pages: Record<string, Page>) {
  const requests = serve(pages);
  const snapshot = await fetchWebSnapshot({ type: 'website', location: `${HOST}/docs/` });
  return { requests, paths: snapshot.files.map((f) => f.path).sort() };
}

describe('the request a site sees', () => {
  it('identifies as a browser-shaped crawler with a contact URL', async () => {
    const { requests } = await crawlPaths({ '/docs/': { body: html([]) } });
    const agent = requests.find((r) => r.url === `${HOST}/docs/`)?.headers.get('user-agent');
    expect(agent).toMatch(/^Mozilla\/5\.0 \(compatible; re0-ingestion\/\d/);
    expect(agent).toContain('+https://');
  });

  it('asks for markdown ahead of html', async () => {
    const { requests } = await crawlPaths({ '/docs/': { body: html([]) } });
    const accept = requests.find((r) => r.url === `${HOST}/docs/`)?.headers.get('accept') ?? '';
    expect(accept.startsWith('text/markdown')).toBe(true);
    expect(accept).toContain('text/html');
  });
});

describe('what a fetched page is called', () => {
  it('names an extensionless page by what the server said it was', async () => {
    const { paths } = await crawlPaths({
      '/docs/': { body: html(['/docs/routing', '/docs/notes']) },
      '/docs/routing': { body: '# Routing\n\nText.', type: 'text/markdown' },
      '/docs/notes': { body: 'plain', type: 'text/plain' },
    });
    // `docs` for the entry, not `docs/`: a trailing slash would hide the suffix.
    expect(paths).toEqual(['docs.html', 'docs/notes.txt', 'docs/routing.md']);
  });

  it('leaves a path that already has an extension alone', async () => {
    const { paths } = await crawlPaths({
      '/docs/': { body: html(['/docs/guide.html']) },
      '/docs/guide.html': { body: '# Guide', type: 'text/markdown' },
    });
    expect(paths).toEqual(['docs.html', 'docs/guide.html']);
  });
});

describe('discovery', () => {
  it('follows links inside a page served as markdown', async () => {
    const { paths } = await crawlPaths({
      '/docs/': { body: '# Docs\n\nSee [routing](/docs/routing).', type: 'text/markdown' },
      '/docs/routing': { body: '# Routing', type: 'text/markdown' },
    });
    expect(paths).toEqual(['docs.md', 'docs/routing.md']);
  });

  it('seeds the crawl from /sitemap.xml, inside the entry scope only', async () => {
    const { paths, requests } = await crawlPaths({
      '/docs/': { body: html([]) },
      '/sitemap.xml': { body: urlset(['/docs/unlinked', '/blog/post']), type: 'application/xml' },
      '/docs/unlinked': { body: html([]) },
      '/blog/post': { body: html([]) },
    });
    expect(paths).toEqual(['docs.html', 'docs/unlinked.html']);
    expect(requests.some((r) => r.url.endsWith('/blog/post'))).toBe(false);
  });

  it('reads sitemap locations from robots.txt and follows a sitemap index', async () => {
    const { paths, requests } = await crawlPaths({
      '/docs/': { body: html([]) },
      '/robots.txt': {
        body: `User-agent: *\nAllow: /\nSitemap: ${HOST}/maps/index.xml\nSitemap: https://elsewhere.test/sitemap.xml\n`,
        type: 'text/plain',
      },
      '/maps/index.xml': {
        body: `<sitemapindex><sitemap><loc>${HOST}/maps/docs.xml</loc></sitemap><sitemap><loc>${HOST}/maps/old.xml.gz</loc></sitemap></sitemapindex>`,
        type: 'application/xml',
      },
      '/maps/docs.xml': { body: urlset(['/docs/deep/page']), type: 'application/xml' },
      '/docs/deep/page': { body: html([]) },
    });
    expect(paths).toEqual(['docs.html', 'docs/deep/page.html']);
    expect(requests.some((r) => r.url.startsWith('https://elsewhere.test'))).toBe(false);
    expect(requests.some((r) => r.url.endsWith('.gz'))).toBe(false);
    expect(requests.some((r) => r.url === `${HOST}/sitemap.xml`)).toBe(false);
  });

  it('falls back to following links when there is no sitemap at all', async () => {
    const { paths } = await crawlPaths({
      '/docs/': { body: html(['/docs/a']) },
      '/docs/a': { body: html(['/docs/b']) },
      '/docs/b': { body: html([]) },
    });
    expect(paths).toEqual(['docs.html', 'docs/a.html', 'docs/b.html']);
  });
});
