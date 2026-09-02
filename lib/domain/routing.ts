/**
 * When a library may answer a question at all. architecture.md 9.6.
 *
 * Recall is generous by design: every routing path returns its nearest
 * neighbours whatever the distance, and reciprocal-rank fusion only keeps
 * their order. Left alone, that means a platform with one library routes
 * every question to it -- "what is the weather today" included -- and the
 * playground then asks a model to answer from thirty unrelated passages.
 *
 * The rules here are the missing judgement: what counts as evidence that a
 * candidate is *about* the question, and what a retrieval has to show before
 * its passages are presented as context. Both were set from measurements on
 * a real corpus (ethereum.org, text-embedding-3-small), recorded next to each
 * constant so the next person can re-measure rather than guess.
 *
 * Pure TypeScript, no imports -- domain layer rules apply.
 */

/**
 * Cosine distance to a library's nearest centroid at or under which the
 * semantic path alone admits it.
 *
 * Measured: same-language questions about the corpus sat at 0.33-0.45,
 * unrelated same-language questions (an ORM, a web server, a payments API)
 * at 0.59-0.77. Questions in another language than the corpus land at
 * 0.58-0.68 whether or not they are about it -- the embedding model is not
 * cross-lingual enough to tell -- so those must be admitted by evidence the
 * lexical paths find, never by this number.
 */
export const CENTROID_ADMIT_DISTANCE = 0.5;

/**
 * How many chunks, platform-wide, a query term may appear in and still count
 * as a *rare* term -- one that lives in a paragraph or two and therefore
 * says which library the question is about. Above this the term is
 * vocabulary ("transaction", "next", "app") and is evidence of nothing.
 */
export const RARE_TERM_MAX_DOCUMENTS = 8;

/** What the routing paths found for one candidate. */
export interface CandidateSignals {
  /** The profile keyword path's ts_rank; zero when the profile did not match. */
  profileRank: number;
  /** Cosine distance to the nearest centroid; null when the path did not run. */
  centroidDistance: number | null;
  /** Rare query terms (see above) found in this library's own chunks. */
  rareTerms: number;
  /** The caller named this library. */
  nameHint: boolean;
}

/**
 * A candidate is admitted when at least one path found *evidence*: a term of
 * the library's own vocabulary in the question, a rare term in its chunks,
 * a caller's name hint, or a same-language semantic match close enough to
 * stand alone. Ranking among the admitted is fusion's job, not this one's.
 */
export function admitsCandidate(signals: CandidateSignals): boolean {
  if (signals.nameHint) return true;
  if (signals.profileRank > 0) return true;
  if (signals.rareTerms > 0) return true;
  return signals.centroidDistance !== null && signals.centroidDistance <= CENTROID_ADMIT_DISTANCE;
}

/**
 * What one retrieval can say about how well its passages fit the question.
 *
 * `bestDistance` is the smallest chunk-level cosine distance the vector leg
 * saw, null when that leg did not run; `keywordHits` is how many chunks the
 * keyword leg recalled.
 */
export interface RetrievalConfidence {
  bestDistance: number | null;
  keywordHits: number;
}

/**
 * The chunk-level distance under which a retrieval is confirmed, by whether
 * the question shares the corpus's script.
 *
 * Measured against an English corpus: English questions it answers had a
 * best chunk at 0.28-0.34, unrelated English questions at 0.52-0.71.
 * Chinese questions it answers sat at 0.53-0.55 and Chinese small talk at
 * 0.86 -- a wider gate, and the honest limit of a non-multilingual embedding:
 * a mixed-script question about another framework (0.58) still passes it.
 */
export const CHUNK_CONFIRM_DISTANCE = { sameScript: 0.5, crossScript: 0.62 } as const;

/**
 * Whether the passages are close enough to be shown as context.
 *
 * With a vector leg, its best distance decides: keyword hits are not enough,
 * because a question's ordinary words ("write", "transaction") hit chunks in
 * any technical corpus. Without one, keyword recall is all there is, and a
 * hit is taken at its word.
 */
export function confirmsRetrieval(
  confidence: RetrievalConfidence,
  options: { crossScript: boolean },
): boolean {
  if (confidence.bestDistance === null) return confidence.keywordHits > 0;
  const gate = options.crossScript
    ? CHUNK_CONFIRM_DISTANCE.crossScript
    : CHUNK_CONFIRM_DISTANCE.sameScript;
  return confidence.bestDistance <= gate;
}
