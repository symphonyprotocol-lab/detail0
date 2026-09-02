/**
 * Routing admission and retrieval confirmation, as decisions. architecture.md
 * 9.6: recall returns its nearest neighbours whatever the distance, so the
 * judgement of whether a library is about the question at all lives here.
 */
import { describe, expect, it } from 'vitest';
import {
  admitsCandidate,
  CENTROID_ADMIT_DISTANCE,
  CHUNK_CONFIRM_DISTANCE,
  confirmsRetrieval,
} from '@/lib/domain/routing';

const nothing = { profileRank: 0, centroidDistance: null, rareTerms: 0, nameHint: false };

describe('candidate admission', () => {
  it('refuses a candidate no path found evidence for', () => {
    expect(admitsCandidate(nothing)).toBe(false);
    /* The nearest centroid of a one-library platform is not evidence. */
    expect(admitsCandidate({ ...nothing, centroidDistance: 0.9 })).toBe(false);
    expect(admitsCandidate({ ...nothing, centroidDistance: CENTROID_ADMIT_DISTANCE + 0.01 })).toBe(
      false,
    );
  });

  it('admits on a profile term, a rare term, a name hint, or a close centroid', () => {
    expect(admitsCandidate({ ...nothing, profileRank: 0.001 })).toBe(true);
    expect(admitsCandidate({ ...nothing, rareTerms: 1 })).toBe(true);
    expect(admitsCandidate({ ...nothing, nameHint: true })).toBe(true);
    expect(admitsCandidate({ ...nothing, centroidDistance: CENTROID_ADMIT_DISTANCE })).toBe(true);
    expect(admitsCandidate({ ...nothing, centroidDistance: 0.33 })).toBe(true);
  });
});

describe('retrieval confirmation', () => {
  it('trusts keyword recall when no vector leg ran', () => {
    expect(confirmsRetrieval({ bestDistance: null, keywordHits: 1 }, { crossScript: false })).toBe(true);
    expect(confirmsRetrieval({ bestDistance: null, keywordHits: 0 }, { crossScript: false })).toBe(false);
  });

  it('judges by the best chunk distance when a vector leg ran, keyword hits or not', () => {
    /* An ORM question hits "transaction" in any corpus; that is not context. */
    expect(confirmsRetrieval({ bestDistance: 0.575, keywordHits: 12 }, { crossScript: false })).toBe(
      false,
    );
    expect(confirmsRetrieval({ bestDistance: 0.34, keywordHits: 0 }, { crossScript: false })).toBe(true);
    expect(
      confirmsRetrieval(
        { bestDistance: CHUNK_CONFIRM_DISTANCE.sameScript, keywordHits: 0 },
        { crossScript: false },
      ),
    ).toBe(true);
  });

  it('opens the gate wider for a question in another script than the corpus', () => {
    /* A Chinese question an English corpus answers sits around 0.54. */
    expect(confirmsRetrieval({ bestDistance: 0.55, keywordHits: 1 }, { crossScript: true })).toBe(true);
    expect(confirmsRetrieval({ bestDistance: 0.55, keywordHits: 1 }, { crossScript: false })).toBe(
      false,
    );
    /* Small talk stays out in any script. */
    expect(confirmsRetrieval({ bestDistance: 0.86, keywordHits: 0 }, { crossScript: true })).toBe(false);
  });
});
