/**
 * The library profile, as decisions rather than as code paths.
 *
 * What is under test is what architecture.md 9.6 promises routing can rely on:
 * a term that only ever appears inside chapter paragraphs still reaches the
 * profile (the rove-beetle case -- the clue is in the content, never in the
 * library's name), CJK terms arrive pre-segmented so `simple` can index them,
 * and the centroids are deterministic unit vectors a rebuilt version
 * reproduces exactly.
 */
import { describe, expect, it } from 'vitest';
import {
  CentroidAccumulator,
  extractTerms,
  PROFILE_LIMITS,
  PROFILE_VERSION,
  profileSearchText,
} from '@/lib/domain/profile';

describe('term extraction', () => {
  it('surfaces a rare entity that only lives in one paragraph', () => {
    const bodies = [
      '甲虫的分类学。本章讨论鞘翅目的形态特征。',
      '隐翅虫的防治与危害:隐翅虫体液含隐翅虫素,接触皮肤会引起皮炎。',
      '蛾类图谱。',
    ];
    const terms = extractTerms(bodies);
    expect(terms).toContain('隐翅虫');
  });

  it('keeps the longer CJK gram and absorbs its shadows', () => {
    const bodies = ['隐翅虫 隐翅虫 隐翅虫 隐翅虫'];
    const terms = extractTerms(bodies);
    expect(terms).toContain('隐翅虫');
    // The 2-grams exist only as substrings of the kept 3-gram.
    expect(terms).not.toContain('隐翅');
    expect(terms).not.toContain('翅虫');
  });

  it('counts latin words case-folded and skips noise', () => {
    const terms = extractTerms(['Install the Installer. install 42 -- a b cd']);
    expect(terms).toContain('install');
    expect(terms).toContain('installer');
    expect(terms).not.toContain('42');
    expect(terms).not.toContain('cd'); // shorter than three characters
  });

  it('respects the limit and is deterministic', () => {
    const bodies = Array.from({ length: 50 }, (_, i) => `term${i} `.repeat(i + 1));
    const first = extractTerms(bodies, 10);
    expect(first).toHaveLength(10);
    expect(extractTerms(bodies, 10)).toEqual(first);
  });
});

describe('profile search text', () => {
  it('pre-segments CJK titles so simple-config FTS can find their parts', () => {
    const text = profileSearchText(['隐翅虫的防治'], []);
    const tokens = text.split(' ');
    expect(tokens).toContain('隐翅虫'); // the gram a query will carry
    expect(tokens).toContain('隐翅虫的防治'); // and the exact title
  });

  it('folds titles through the tokenizer and deduplicates against terms', () => {
    const text = profileSearchText(['The OpenAI Guide'], ['openai', 'guide']);
    const tokens = text.split(' ');
    expect(tokens).toContain('openai');
    expect(tokens.filter((token) => token === 'openai')).toHaveLength(1);
  });
});

describe('centroid accumulator', () => {
  const axis = (at: number, dims = 8): number[] =>
    Array.from({ length: dims }, (_, i) => (i === at ? 1 : 0));

  it('keeps every vector while under k, as unit vectors', () => {
    const acc = new CentroidAccumulator(4);
    acc.add([2, 0, 0, 0]);
    acc.add([0, 3, 0, 0]);
    const centroids = acc.centroids();
    expect(centroids).toHaveLength(2);
    expect(centroids[0]).toEqual([1, 0, 0, 0]);
    expect(centroids[1]).toEqual([0, 1, 0, 0]);
  });

  it('never exceeds k and pulls means toward their cluster', () => {
    const acc = new CentroidAccumulator(2);
    for (let i = 0; i < 20; i += 1) acc.add(axis(0, 4));
    for (let i = 0; i < 20; i += 1) acc.add(axis(1, 4));
    const centroids = acc.centroids();
    expect(centroids).toHaveLength(2);
    for (const centroid of centroids) {
      const norm = Math.sqrt(centroid.reduce((sum, value) => sum + value * value, 0));
      expect(norm).toBeCloseTo(1, 6);
    }
    // The first seed saw only axis-0 vectors and stays on that axis.
    expect(centroids[0]![0]).toBeCloseTo(1, 6);
  });

  it('ignores a zero vector rather than dividing by it', () => {
    const acc = new CentroidAccumulator(2);
    acc.add([0, 0, 0]);
    expect(acc.centroids()).toHaveLength(0);
  });

  it('is deterministic for the same stream', () => {
    const stream = Array.from({ length: 100 }, (_, i) => axis(i % 5, 8));
    const a = new CentroidAccumulator(3);
    const b = new CentroidAccumulator(3);
    for (const v of stream) a.add(v);
    for (const v of stream) b.add(v);
    expect(a.centroids()).toEqual(b.centroids());
  });

  it('defaults to the platform cap', () => {
    const acc = new CentroidAccumulator();
    for (let i = 0; i < PROFILE_LIMITS.maxCentroids * 3; i += 1) acc.add(axis(i % 40, 64));
    expect(acc.centroids().length).toBeLessThanOrEqual(PROFILE_LIMITS.maxCentroids);
  });
});

describe('versioning', () => {
  it('stamps a stable extractor version', () => {
    expect(PROFILE_VERSION).toBe('re0-profile-1');
  });
});
