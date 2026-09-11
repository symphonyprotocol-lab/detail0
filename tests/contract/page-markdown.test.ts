import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { GET as renderMarkdownPage } from '@/app/api/page-markdown/route';
import { markdownSourcePath, pageHtmlToMarkdown } from '@/lib/http/page-markdown';
import { middleware } from '@/middleware';

describe('Markdown page representations', () => {
  it('accepts local page paths and keeps their query string', () => {
    expect(markdownSourcePath('/libraries?q=next.js&sort=recent')).toBe(
      '/libraries?q=next.js&sort=recent',
    );
    expect(markdownSourcePath('/')).toBe('/');
  });

  it('rejects non-pages and recursive representations', () => {
    for (const source of [
      'https://attacker.example/',
      '//attacker.example/',
      '/api/v1/context',
      '/_next/static/app.js',
      '/.well-known/agent-skills/index.json',
      '/about.md',
    ]) {
      expect(markdownSourcePath(source)).toBeNull();
    }
  });

  it('keeps semantic page content while dropping layout and executable noise', () => {
    const html = `<!doctype html>
      <html><body>
        <nav>Site navigation</nav>
        <main>
          <h1>Guide</h1>
          <p>Read the <a href="/docs/start?mode=fast">quick start</a>.</p>
          <table><thead><tr><th>Name</th><th>State</th></tr></thead>
          <tbody><tr><td>Index</td><td>Ready</td></tr></tbody></table>
          <script>ignoreMe()</script>
        </main>
        <footer>Footer</footer>
      </body></html>`;

    const markdown = pageHtmlToMarkdown(html, new URL('https://re0.test/about'));

    expect(markdown).toContain('# Guide');
    expect(markdown).toContain('[quick start](https://re0.test/docs/start?mode=fast)');
    expect(markdown).toContain('| Name | State |');
    expect(markdown).not.toContain('Site navigation');
    expect(markdown).not.toContain('ignoreMe');
    expect(markdown).not.toContain('Footer');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('carries the source in the rewritten request instead of relying on rewritten searchParams', () => {
    const response = middleware(
      new NextRequest('https://re0.test/status.md?probe=1', {
        headers: { 'accept-language': 'en' },
      }),
    );

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://re0.test/api/page-markdown?source=%2Fstatus%3Fprobe%3D1',
    );
    expect(response.headers.get('x-middleware-request-x-re0-markdown-page')).toBe(
      '/status?probe=1',
    );
  });

  it('renders the source supplied by a middleware rewrite header', async () => {
    const fetchPage = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body><main><h1>Service status</h1></main></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    try {
      /* Next can leave this URL as the original URL after a middleware
         rewrite, so there is intentionally no `source` search parameter. */
      const response = await renderMarkdownPage(
        new NextRequest('https://re0.test/status.md', {
          headers: { 'x-re0-markdown-page': '/status' },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('# Service status\n');
      expect(fetchPage.mock.calls[0]?.[0]).toEqual(new URL('https://re0.test/status'));
    } finally {
      fetchPage.mockRestore();
    }
  });
});
