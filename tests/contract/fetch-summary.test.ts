/**
 * How a build's pages were fetched, tallied for the console's refresh queue:
 * our own fetch, a rendering provider, or both -- and nothing at all for a
 * source that never had the choice.
 */
import { describe, expect, it } from 'vitest';
import { summarizeFetch } from '@/lib/domain/ingestion';

describe('fetch summary', () => {
  it('counts direct and rendered pages and names the renderer', () => {
    expect(
      summarizeFetch([
        { fetchedVia: 'direct' },
        { fetchedVia: 'firecrawl' },
        { fetchedVia: 'direct' },
      ]),
    ).toEqual({ direct: 2, rendered: 1, renderer: 'firecrawl' });
    expect(summarizeFetch([{ fetchedVia: 'jina' }])).toEqual({
      direct: 0,
      rendered: 1,
      renderer: 'jina',
    });
  });

  it('reports nothing for sources whose files say nothing', () => {
    expect(summarizeFetch([{}, {}])).toBeNull();
    expect(summarizeFetch([])).toBeNull();
    /* Files that say nothing do not count as direct either. */
    expect(summarizeFetch([{}, { fetchedVia: 'direct' }])).toEqual({
      direct: 1,
      rendered: 0,
      renderer: null,
    });
  });
});
