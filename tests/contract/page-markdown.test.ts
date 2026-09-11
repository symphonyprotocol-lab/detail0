import { describe, expect, it } from 'vitest';
import { markdownSourcePath, pageHtmlToMarkdown } from '@/lib/http/page-markdown';

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
});
