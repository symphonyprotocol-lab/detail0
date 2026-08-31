/**
 * Notion pages, through the official API.
 *
 * Notion is the one platform source that cannot be read anonymously: the page
 * has to be shared with an integration, and the integration's token is the
 * credential. There is no useful fallback to the public page HTML -- it is
 * rendered by script and carries none of the block structure -- so an
 * unconfigured token is refused as `source_unsupported` rather than half
 * indexed.
 *
 * Blocks are rendered to Markdown, not to prose, because the rest of the
 * pipeline already understands Markdown: headings become sections, sections
 * become citations, and fenced code stays intact through chunking.
 */
import { IngestionFailure, INGESTION_LIMITS, parseSourceConfig } from '@/lib/domain/ingestion';
import { fetchJson } from './http';
import type { FetchedFile, SourceSnapshot } from './types';

const API = 'https://api.notion.com/v1';

/** Pinned: Notion versions its API by date and changes block shapes between. */
const NOTION_VERSION = '2022-06-28';

/** How deep nested toggles and lists are followed. */
const MAX_BLOCK_DEPTH = 6;

interface RichText {
  plain_text?: string;
}

interface Block {
  id?: string;
  type?: string;
  has_children?: boolean;
  [key: string]: unknown;
}

interface BlockList {
  results?: Block[];
  next_cursor?: string | null;
  has_more?: boolean;
}

interface Page {
  id?: string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<string, { type?: string; title?: RichText[] }>;
}

function headers(): Record<string, string> {
  const token = process.env.NOTION_INGESTION_TOKEN;
  if (!token) {
    throw new IngestionFailure(
      'source_unsupported',
      'validate-source',
      'NOTION_INGESTION_TOKEN is not set',
    );
  }
  return {
    authorization: `Bearer ${token}`,
    'notion-version': NOTION_VERSION,
  };
}

/**
 * The 32 hex characters at the end of any Notion URL.
 *
 * Notion puts a human-readable title in front of the id and separates the two
 * with a dash, so the id is recovered from the end rather than by splitting on
 * dashes -- a page called `my-page` would otherwise take the title apart.
 */
export function notionPageId(location: string): string | null {
  const url = new URL(location);
  const last = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
  const match = /([0-9a-f]{32})$/i.exec(last.replace(/-/g, ''));
  if (!match) return null;
  const id = (match[1] ?? '').toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export async function fetchNotionSnapshot(input: { location: string }): Promise<SourceSnapshot> {
  const rootId = notionPageId(input.location);
  if (!rootId) {
    throw new IngestionFailure('source_unsupported', 'validate-source', 'not a Notion page URL');
  }
  const auth = headers();

  const files: FetchedFile[] = [];
  const queue: string[] = [rootId];
  const seen = new Set<string>([rootId]);
  let lastModifiedAt: Date | null = null;

  while (queue.length > 0 && files.length < INGESTION_LIMITS.maxCrawlPages) {
    const pageId = queue.shift() as string;
    const page = await fetchJson<Page>(`${API}/pages/${pageId}`, { headers: auth });
    const edited = page.last_edited_time ? new Date(page.last_edited_time) : null;
    if (edited && !Number.isNaN(edited.getTime())) {
      if (!lastModifiedAt || edited > lastModifiedAt) lastModifiedAt = edited;
    }

    const title = pageTitle(page) ?? 'Untitled';
    const children: string[] = [];
    const body = await renderBlocks(pageId, auth, 0, children);

    files.push({
      path: `${slug(title)}-${pageId.slice(0, 8)}.md`,
      url: page.url ?? input.location,
      content: `# ${title}\n\n${body}`.trim(),
    });

    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }

  if (files.length === 0) {
    throw new IngestionFailure('source_empty', 'discover-parse', 'the page has no content');
  }

  return {
    files,
    config: parseSourceConfig(''),
    revision: null,
    lastModifiedAt,
    hasLicense: false,
    stale: false,
  };
}

function pageTitle(page: Page): string | null {
  for (const property of Object.values(page.properties ?? {})) {
    if (property.type === 'title') return plain(property.title) || null;
  }
  return null;
}

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'page'
  );
}

/** Every block of one page, in order, as Markdown. */
async function renderBlocks(
  blockId: string,
  auth: Record<string, string>,
  depth: number,
  childPages: string[],
): Promise<string> {
  if (depth > MAX_BLOCK_DEPTH) return '';

  const lines: string[] = [];
  let cursor: string | null = null;

  do {
    const query = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : '?page_size=100';
    const list: BlockList = await fetchJson<BlockList>(`${API}/blocks/${blockId}/children${query}`, {
      headers: auth,
    });

    for (const block of list.results ?? []) {
      if (block.type === 'child_page' || block.type === 'child_database') {
        if (block.id) childPages.push(block.id);
        continue;
      }
      const rendered = renderBlock(block);
      if (rendered !== null) lines.push(rendered);

      /*
       * Nested content is indented under its parent so a toggle's body stays
       * attached to the toggle's heading when the document is chunked.
       */
      if (block.has_children && block.id) {
        const nested = await renderBlocks(block.id, auth, depth + 1, childPages);
        if (nested.trim().length > 0) {
          lines.push(nested.split('\n').map((line) => (line ? `  ${line}` : line)).join('\n'));
        }
      }
    }

    cursor = list.has_more ? (list.next_cursor ?? null) : null;
  } while (cursor);

  return lines.join('\n\n');
}

function renderBlock(block: Block): string | null {
  const type = block.type;
  if (!type) return null;
  const payload = block[type] as { rich_text?: RichText[]; language?: string; checked?: boolean } | undefined;
  const text = plain(payload?.rich_text);

  switch (type) {
    case 'heading_1':
      return `## ${text}`;
    case 'heading_2':
      return `### ${text}`;
    case 'heading_3':
      return `#### ${text}`;
    case 'bulleted_list_item':
      return `- ${text}`;
    case 'numbered_list_item':
      return `1. ${text}`;
    case 'to_do':
      return `- [${payload?.checked ? 'x' : ' '}] ${text}`;
    case 'quote':
      return `> ${text}`;
    case 'callout':
      return `> ${text}`;
    case 'code':
      return `\`\`\`${payload?.language ?? ''}\n${text}\n\`\`\``;
    case 'paragraph':
    case 'toggle':
      return text.length > 0 ? text : null;
    case 'divider':
      return '---';
    default:
      /*
       * Images, embeds and databases have no text to index. Skipped rather than
       * rendered as a placeholder, which would chunk into noise that matches
       * every query about the page and answers none of them.
       */
      return null;
  }
}

function plain(rich: RichText[] | undefined): string {
  return (rich ?? []).map((entry) => entry.plain_text ?? '').join('');
}
