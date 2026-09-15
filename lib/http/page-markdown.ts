import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const CONTENT_CONTAINERS = ['main', 'article'] as const;
const REMOVED_ELEMENTS = ['script', 'style', 'template', 'noscript'] as const;

/**
 * Only local page paths may be rendered by the Markdown representation route.
 * Keeping API and asset namespaces out also prevents a `.md.md` request from
 * recursively entering the renderer.
 */
export function markdownSourcePath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, 'https://markdown.invalid');
  } catch {
    return null;
  }
  if (parsed.origin !== 'https://markdown.invalid') return null;

  const path = parsed.pathname;
  if (
    path.endsWith('.md') ||
    path === '/mcp' ||
    path.startsWith('/api/') ||
    path === '/api' ||
    path.startsWith('/_next/') ||
    path.startsWith('/files/') ||
    path.startsWith('/.well-known/')
  ) {
    return null;
  }
  return `${path}${parsed.search}`;
}

function elementContents(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1] ?? null;
}

function removeElements(html: string): string {
  return REMOVED_ELEMENTS.reduce(
    (content, tag) => content.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ''),
    html,
  );
}

/** Resolve page-relative links before Turndown discards the HTML base URL. */
function absoluteReferences(html: string, sourceUrl: URL): string {
  return html.replace(
    /\b(href|src)\s*=\s*(["'])(.*?)\2/gi,
    (attribute: string, name: string, quote: string, value: string) => {
      const reference = value.trim();
      if (
        reference === '' ||
        reference.startsWith('#') ||
        /^(?:data|mailto|tel|javascript):/i.test(reference)
      ) {
        return attribute;
      }
      try {
        return `${name}=${quote}${new URL(reference, sourceUrl).href}${quote}`;
      } catch {
        return attribute;
      }
    },
  );
}

/**
 * Convert the semantic content of a rendered page to compact GFM. The site's
 * public layout owns one `main`; `article` and finally `body` are fallbacks so
 * future content layouts gain `.md` support without registering a serializer.
 */
export function pageHtmlToMarkdown(html: string, sourceUrl: URL): string {
  const content =
    CONTENT_CONTAINERS.map((tag) => elementContents(html, tag)).find(
      (candidate): candidate is string => candidate !== null,
    ) ??
    elementContents(html, 'body') ??
    html;

  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  service.use(gfm);
  service.remove((node) => node.nodeName === 'SVG');

  const markdown = service
    .turndown(absoluteReferences(removeElements(content), sourceUrl))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return `${markdown}\n`;
}
