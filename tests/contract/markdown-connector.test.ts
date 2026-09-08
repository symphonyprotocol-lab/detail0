/**
 * How uploaded Markdown and MDX become files for the build.
 * architecture.md 8.2, step 2.
 *
 * The store is in memory; what is under test is that the connector reads
 * what the source config lists, hands the text on as the text it already is,
 * keeps the name -- and so the extension the parse step reads the format
 * from -- and fails with the right code when a file is missing.
 */
import { describe, expect, it } from 'vitest';
import { memoryObjectStore } from '@/lib/application/ingestion';
import { IngestionFailure } from '@/lib/domain/ingestion';
import { fetchMarkdownSnapshot } from '@/lib/infrastructure/connectors/markdown';

const KEY = 'uploads/ws/batch/file-1.md';

const encoder = new TextEncoder();

async function storeWith(text: string, key = KEY) {
  const store = memoryObjectStore();
  await store.put(key, encoder.encode(text), 'text/markdown');
  return store;
}

const listing = (name: string, size: number, key = KEY, id = 'f1') => ({
  files: [{ id, name, size, key }],
});

describe('fetchMarkdownSnapshot', () => {
  it('hands every listed file on as text, named as uploaded', async () => {
    const body = '# Onboarding\n\nRead this first.\n';
    const store = await storeWith(body);
    const snapshot = await fetchMarkdownSnapshot({
      config: listing('Getting started.md', body.length),
      store,
    });
    expect(snapshot.files).toHaveLength(1);
    const [file] = snapshot.files;
    expect(file?.path).toBe('Getting started.md');
    expect(file?.format).toBe('markdown');
    expect(file?.url).toBe('/dashboard/files/f1');
    expect(file?.content).toBe(body);
    expect(snapshot.revision).toBeNull();
    expect(snapshot.hasLicense).toBe(false);
  });

  it('keeps an .mdx name, which is what tells the parse step the format', async () => {
    const store = await storeWith('# Components\n', 'uploads/ws/batch/file-2.md');
    const snapshot = await fetchMarkdownSnapshot({
      config: listing('Components.mdx', 13, 'uploads/ws/batch/file-2.md', 'f2'),
      store,
    });
    expect(snapshot.files[0]?.path).toBe('Components.mdx');
  });

  it('strips a byte order mark rather than leaving it in the first heading', async () => {
    const store = await storeWith('﻿# Title\n');
    const snapshot = await fetchMarkdownSnapshot({ config: listing('Title.md', 9), store });
    expect(snapshot.files[0]?.content.startsWith('# Title')).toBe(true);
  });

  it('fails as source_empty when the source lists nothing', async () => {
    const store = memoryObjectStore();
    await expect(fetchMarkdownSnapshot({ config: {}, store })).rejects.toThrow(IngestionFailure);
    await expect(fetchMarkdownSnapshot({ config: {}, store })).rejects.toMatchObject({
      code: 'source_empty',
    });
  });

  it('fails as source_unreachable when a listed file is gone from storage', async () => {
    const store = memoryObjectStore();
    await expect(
      fetchMarkdownSnapshot({ config: listing('Missing.md', 10), store }),
    ).rejects.toMatchObject({ code: 'source_unreachable' });
  });
});
