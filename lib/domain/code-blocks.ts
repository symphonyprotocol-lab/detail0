/**
 * Fenced code inside a retrieved chunk. The playground shows a passage's code
 * as code (requirement.md 5.1: 展示…代码示例), and the chunk text is the only
 * place it can come from -- so this lifts every ``` fence out of a chunk, as
 * data, for the transcript to render. Nothing is interpreted: an unterminated
 * fence runs to the end of the chunk, which is where the chunker cut it.
 */

export interface CodeBlock {
  /** The info string's first word, lower-cased; null when the fence has none. */
  lang: string | null;
  code: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm;

/** How much code one chunk may hand to the page; a chunk is a few hundred tokens anyway. */
const MAX_BLOCK_CHARS = 4_000;

export function fencedCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const match of text.matchAll(FENCE)) {
    const code = (match[3] ?? '').replace(/\s+$/, '');
    if (code.length === 0) continue;
    const info = (match[2] ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    blocks.push({ lang: info.length > 0 ? info : null, code: code.slice(0, MAX_BLOCK_CHARS) });
  }
  return blocks;
}
