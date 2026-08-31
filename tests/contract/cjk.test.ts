/**
 * The CJK segmentation contract. Both sides of a match run through
 * lib/domain/cjk.ts, so what these tests freeze is the meaning of every
 * stored `body_segmented` value: change the scheme and these fail, which is
 * the cue to bump CHUNKER_VERSION rather than let two schemes share a table.
 */
import { describe, expect, it } from 'vitest';
import { cjkSearchTokens, containsCjk, segmentCjkForIndex } from '@/lib/domain/cjk';

describe('index-side segmentation', () => {
  it('splits a Han run into overlapping bigrams', () => {
    expect(segmentCjkForIndex('隐翅虫的防治')).toBe('隐翅 翅虫 虫的 的防 防治');
  });

  it('segments each run separately across non-Han text', () => {
    expect(segmentCjkForIndex('见 docs/guide.md 中的防治章节')).toBe(
      '见 中的 的防 防治 治章 章节',
    );
  });

  it('keeps a lone character as its own token', () => {
    expect(segmentCjkForIndex('虫')).toBe('虫');
  });

  it('stores null for text with no Han runs', () => {
    expect(segmentCjkForIndex('plain english, punctuation, 123')).toBeNull();
  });
});

describe('query-side tokens', () => {
  it('produces the same bigrams the index stored', () => {
    const indexed = new Set(segmentCjkForIndex('隐翅虫的防治与危害')!.split(' '));
    for (const token of cjkSearchTokens('隐翅虫')) {
      expect(indexed.has(token)).toBe(true);
    }
  });

  it('deduplicates repeated bigrams', () => {
    const tokens = cjkSearchTokens('防治防治防治');
    expect(tokens.filter((token) => token === '防治')).toHaveLength(1);
  });

  it('detects Han text', () => {
    expect(containsCjk('any 防治 mix')).toBe(true);
    expect(containsCjk('none here')).toBe(false);
  });
});
