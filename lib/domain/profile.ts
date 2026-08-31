/**
 * The library profile: what a library is *about*, derived from its content.
 *
 * architecture.md 9.6 -- on a platform where anyone can upload a library, the
 * name the owner typed carries no routing signal (the rove-beetle article
 * lives in a library called "昆虫大全"). Library-level discovery therefore
 * searches a content-derived profile, never the display name: the document
 * titles, a term table extracted from the chunk bodies, and a handful of
 * centroid vectors that stand in for the library's topic clusters.
 *
 * Everything here is derived data (architecture.md 6.4): rebuildable from the
 * published version's content, written in the `profile` step of a build
 * (architecture.md 8.2), and never edited afterwards.
 *
 * Pure TypeScript, like the rest of the domain layer. The extraction is the
 * statistical baseline architecture.md 22 leaves open to revision -- what must
 * stay fixed is the shape: titles + terms + centroids, versioned by
 * PROFILE_VERSION so a smarter extractor rebuilds rather than mixes.
 */

/** Frozen into `library_profile.profile_version`; bump on any change here. */
export const PROFILE_VERSION = 're0-profile-1';

export const PROFILE_LIMITS = {
  /** Titles kept on the profile row. Routing only needs the vocabulary. */
  maxTitles: 500,
  /** Terms kept from the extraction below. */
  maxTerms: 256,
  /**
   * Centroids per library. Enough that an encyclopedic library's topic
   * clusters each get a representative (architecture.md 9.6: one summary
   * vector dilutes them), few enough that the platform-wide vector table
   * stays libraries x centroids, not chunks.
   */
  maxCentroids: 32,
} as const;

/* ------------------------------------------------------------------ terms */

/**
 * Word runs for space-delimited scripts; Han runs handled separately below.
 * Latin terms shorter than three characters are mostly stopwords and markup.
 */
const WORD_RUN = /[\p{L}\p{N}][\p{L}\p{N}_-]*/gu;
const HAN_RUN = /\p{Script=Han}+/gu;
/** Unanchored and non-global: `.test` on a global regex keeps state between calls. */
const HAS_HAN = /\p{Script=Han}/u;

/**
 * Extract the terms that characterise a set of texts.
 *
 * Two token streams, because the failure modes differ by script:
 *
 * - Space-delimited words are counted as-is, lowercased, dropping runs shorter
 *   than three characters or made only of digits.
 * - Han runs are counted as n-grams of two to four characters. This is the
 *   pre-segmentation escape hatch architecture.md 22 records: stock Postgres
 *   cannot segment CJK, so the profile carries terms that are already split,
 *   and `to_tsvector('simple', ...)` over space-joined terms indexes them
 *   correctly. Longer grams score higher (count x length), and a gram that is
 *   contained in a kept longer gram with comparable frequency is absorbed --
 *   「隐翅虫」 survives, its 「隐翅」 shadow does not.
 *
 * Deterministic: same texts, same terms, same order.
 */
export function extractTerms(
  texts: readonly string[],
  limit: number = PROFILE_LIMITS.maxTerms,
): string[] {
  const counts = new Map<string, number>();
  const bump = (term: string, by: number) => counts.set(term, (counts.get(term) ?? 0) + by);

  for (const text of texts) {
    for (const match of text.matchAll(WORD_RUN)) {
      const run = match[0];
      if (HAS_HAN.test(run)) continue; // counted below, as grams
      const word = run.toLowerCase();
      if (word.length < 3 || /^[\p{N}_-]+$/u.test(word)) continue;
      bump(word, 1);
    }
    for (const match of text.matchAll(HAN_RUN)) {
      const run = match[0];
      for (let size = 2; size <= 4; size += 1) {
        for (let at = 0; at + size <= run.length; at += 1) {
          bump(run.slice(at, at + size), size);
        }
      }
    }
  }

  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  const kept: { term: string; score: number }[] = [];
  for (const [term, score] of ranked) {
    if (kept.length >= limit) break;
    const absorbed = kept.some(
      (longer) =>
        longer.term.length > term.length &&
        longer.term.includes(term) &&
        score <= longer.score * 2,
    );
    if (!absorbed) kept.push({ term, score });
  }

  return kept.map((entry) => entry.term);
}

/**
 * The text the profile's keyword index is generated from.
 *
 * Space-joined and deduplicated, so `to_tsvector('simple', ...)` sees one
 * token per title word and per extracted term -- pre-segmented, which is what
 * makes the profile searchable for CJK content while `chunk.search_vector`
 * cannot be (architecture.md 9.6, 22). Whole titles are folded through the
 * same tokenizer so a title contributes its words, not one unsplittable blob.
 */
export function profileSearchText(titles: readonly string[], terms: readonly string[]): string {
  const tokens = new Set<string>();
  for (const title of titles) collectTokens(title, tokens);
  for (const term of terms) tokens.add(term);
  return [...tokens].join(' ');
}

/**
 * The same segmentation, applied to a query. A query and the profile index
 * must be split by one tokenizer or CJK never matches: the profile stores
 * 「隐翅虫」 as its own token, so the query side has to produce that token
 * from 「隐翅虫的防治」 too. architecture.md 9.6.
 */
export function searchTokens(text: string): string[] {
  const tokens = new Set<string>();
  collectTokens(text, tokens);
  return [...tokens];
}

function collectTokens(text: string, into: Set<string>): void {
  for (const match of text.matchAll(WORD_RUN)) {
    const run = match[0];
    if (HAS_HAN.test(run)) {
      into.add(run);
      for (let size = 2; size <= 4; size += 1) {
        for (let at = 0; at + size <= run.length; at += 1) {
          into.add(run.slice(at, at + size));
        }
      }
    } else {
      into.add(run.toLowerCase());
    }
  }
}

/* -------------------------------------------------------------- centroids */

/**
 * Online k-means over a stream of embeddings.
 *
 * The build embeds in windows and drops each window's vectors as soon as the
 * rows are written (build-version.ts keeps peak memory flat whatever the size
 * of the library), so the centroids must be computed the same way: feed each
 * window in, keep only k running means. One pass, no stored vectors.
 *
 * Seeding is the first k vectors -- deterministic, and biased toward the first
 * documents, which is acceptable for a routing signal and recorded as part of
 * the baseline architecture.md 22 leaves open. No randomness anywhere: a
 * rebuilt version must produce the same profile.
 *
 * Vectors are normalised on the way in and the means on the way out, so the
 * centroids live in the same cosine space the query embedding is compared in.
 */
export class CentroidAccumulator {
  private readonly means: Float64Array[] = [];
  private readonly counts: number[] = [];

  constructor(private readonly k: number = PROFILE_LIMITS.maxCentroids) {}

  /**
   * A vector this close to an existing seed joins it instead of taking a
   * seat of its own. Near-duplicate chunks (boilerplate, repeated sections)
   * would otherwise fill the seeding phase with copies of one topic.
   */
  private static readonly SEED_DUPLICATE_DOT = 0.995;

  add(vector: readonly number[]): void {
    const unit = normalize(vector);
    if (!unit) return;

    let best = -1;
    let bestDot = -Infinity;
    for (let at = 0; at < this.means.length; at += 1) {
      const dot = dotProduct(this.means[at]!, unit);
      if (dot > bestDot) {
        bestDot = dot;
        best = at;
      }
    }

    const seeding = this.means.length < this.k;
    if (seeding && bestDot < CentroidAccumulator.SEED_DUPLICATE_DOT) {
      this.means.push(unit);
      this.counts.push(1);
      return;
    }

    const mean = this.means[best]!;
    const n = (this.counts[best] = (this.counts[best] ?? 0) + 1);
    for (let at = 0; at < mean.length; at += 1) {
      mean[at]! += (unit[at]! - mean[at]!) / n;
    }
  }

  /** Unit-length centroids, in seeding order. Empty when nothing was added. */
  centroids(): number[][] {
    const out: number[][] = [];
    for (const mean of this.means) {
      const unit = normalize(mean);
      if (unit) out.push(Array.from(unit));
    }
    return out;
  }
}

function normalize(vector: ArrayLike<number>): Float64Array | null {
  let sum = 0;
  for (let at = 0; at < vector.length; at += 1) sum += vector[at]! * vector[at]!;
  if (sum === 0) return null;
  const scale = 1 / Math.sqrt(sum);
  const out = new Float64Array(vector.length);
  for (let at = 0; at < vector.length; at += 1) out[at] = vector[at]! * scale;
  return out;
}

function dotProduct(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let at = 0; at < a.length; at += 1) sum += a[at]! * b[at]!;
  return sum;
}
