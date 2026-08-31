/**
 * Dictionary-free CJK segmentation for the keyword index. architecture.md 22.
 *
 * Stock Postgres cannot segment Han text: under `simple`, an entire run of
 * characters becomes one token and keyword retrieval silently returns nothing
 * (recorded in migration 0011). Managed Postgres will not install a segmenter
 * extension, so segmentation happens here, before Postgres ever sees the
 * text: Han runs are split into overlapping bigrams -- the classic
 * dictionary-free indexing for Chinese -- and stored space-joined, where
 * `to_tsvector('simple', ...)` treats each bigram as a token.
 *
 * Both sides of the match run through this module: `segmentCjkForIndex` at
 * build time (stored on the chunk, immutable like the rest of the row) and
 * `cjkSearchTokens` at query time. 「隐翅虫的防治」 indexes and queries as
 * 隐翅 翅虫 虫的 的防 防治 -- any two shared characters in sequence recall the
 * row, and ts_rank orders by how much of the query overlaps.
 *
 * Deterministic and dictionary-free by design: a rebuilt version must produce
 * identical rows, and a dictionary would make indexing depend on a data file
 * that can drift. A dictionary segmenter (zhparser and friends) remains the
 * recorded upgrade path; changing the scheme here changes what stored rows
 * mean, so it must ride a CHUNKER_VERSION bump that forces rebuilds.
 *
 * Pure TypeScript, no imports -- domain layer rules apply.
 */

const HAN_RUN = /\p{Script=Han}+/gu;
const HAS_HAN = /\p{Script=Han}/u;

export function containsCjk(text: string): boolean {
  return HAS_HAN.test(text);
}

/**
 * The space-joined bigram stream of every Han run, or null when the text has
 * none -- null keeps the column honest about which rows carry a CJK index.
 */
export function segmentCjkForIndex(text: string): string | null {
  if (!containsCjk(text)) return null;
  const tokens: string[] = [];
  for (const match of text.matchAll(HAN_RUN)) {
    pushBigrams(match[0], tokens);
  }
  return tokens.length > 0 ? tokens.join(' ') : null;
}

/** The query-side split. Deduplicated: repeating a bigram adds no signal. */
export function cjkSearchTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(HAN_RUN)) {
    pushBigrams(match[0], tokens);
  }
  return [...new Set(tokens)];
}

function pushBigrams(run: string, into: string[]): void {
  /* A lone character has no bigram; it is its own token, or it is lost. */
  if (run.length === 1) {
    into.push(run);
    return;
  }
  for (let at = 0; at + 2 <= run.length; at += 1) {
    into.push(run.slice(at, at + 2));
  }
}
