/**
 * How uploaded PDFs become files for the build. architecture.md 8.2, step 2.
 *
 * The store is in memory and the PDF is a fixture; what is under test is that
 * the connector reads what the source config lists, extracts text, names each
 * file as the operator did, and fails with the right code when a file is
 * missing or not a PDF.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { memoryObjectStore } from '@/lib/application/ingestion';
import { IngestionFailure } from '@/lib/domain/ingestion';
import { fetchPdfSnapshot } from '@/lib/infrastructure/connectors/pdf';

const KEY = 'uploads/ws/batch/file-1.pdf';

async function storeWith(bytes: Uint8Array) {
  const store = memoryObjectStore();
  await store.put(KEY, bytes, 'application/pdf');
  return store;
}

describe('fetchPdfSnapshot', () => {
  it('extracts the text of every listed file, named as uploaded', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/handbook.pdf', import.meta.url)));
    const store = await storeWith(bytes);
    const snapshot = await fetchPdfSnapshot({
      config: { files: [{ id: 'f1', name: 'Team Handbook.pdf', size: bytes.byteLength, key: KEY }] },
      store,
    });
    expect(snapshot.files).toHaveLength(1);
    const [file] = snapshot.files;
    expect(file?.path).toBe('Team Handbook.pdf');
    expect(file?.format).toBe('text');
    expect(file?.url).toBe('/dashboard/files/f1');
    expect(file?.content).toContain('Team Handbook');
    expect(file?.content).toContain('quartzloft onboarding checklist');
    expect(snapshot.revision).toBeNull();
  });

  it('refuses a config that lists no files', async () => {
    await expect(fetchPdfSnapshot({ config: {}, store: memoryObjectStore() })).rejects.toMatchObject({
      code: 'source_empty',
    });
  });

  it('fails when a listed file is gone from storage', async () => {
    const error = await fetchPdfSnapshot({
      config: { files: [{ id: 'f1', name: 'gone.pdf', size: 1, key: KEY }] },
      store: memoryObjectStore(),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IngestionFailure);
    expect((error as IngestionFailure).code).toBe('source_unreachable');
  });

  it('reports bytes that are not a PDF as a parse failure', async () => {
    const store = await storeWith(new TextEncoder().encode('not a pdf at all'));
    const error = await fetchPdfSnapshot({
      config: { files: [{ id: 'f1', name: 'notes.pdf', size: 16, key: KEY }] },
      store,
    }).catch((caught: unknown) => caught);
    expect((error as IngestionFailure).code).toBe('parse_failed');
  });
});
