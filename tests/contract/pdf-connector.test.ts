/**
 * How uploaded PDFs become files for the build. architecture.md 8.2, step 2.
 *
 * The store is in memory and the PDF is a fixture; what is under test is that
 * the connector reads what the source config lists, extracts text, names each
 * file as the operator did, and fails with the right code when a file is
 * missing or not a PDF -- and that a PDF with no text layer goes to the OCR
 * provider when there is one, and comes back empty when there is not.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { memoryObjectStore } from '@/lib/application/ingestion';
import { IngestionFailure } from '@/lib/domain/ingestion';
import { fetchPdfSnapshot, needsOcr } from '@/lib/infrastructure/connectors/pdf';
import type { PdfOcr } from '@/lib/infrastructure/connectors/ocr';

const KEY = 'uploads/ws/batch/file-1.pdf';

async function storeWith(bytes: Uint8Array) {
  const store = memoryObjectStore();
  await store.put(KEY, bytes, 'application/pdf');
  return store;
}

const fixture = async (name: string) =>
  new Uint8Array(await readFile(new URL(`../fixtures/${name}`, import.meta.url)));

/** A provider that answers a fixed text and records what it was asked. */
function fakeOcr(text: string) {
  const asked: { bytes: Uint8Array; name: string }[] = [];
  const ocr: PdfOcr = {
    name: 'ocrspace',
    async recognize(pdf) {
      asked.push(pdf);
      return text;
    },
  };
  return { ocr, asked };
}

describe('fetchPdfSnapshot', () => {
  it('extracts the text of every listed file, named as uploaded', async () => {
    const bytes = await fixture('handbook.pdf');
    const store = await storeWith(bytes);
    const snapshot = await fetchPdfSnapshot({
      config: { files: [{ id: 'f1', name: 'Team Handbook.pdf', size: bytes.byteLength, key: KEY }] },
      store,
      ocr: null,
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

  it('leaves a PDF with a text layer alone even when OCR is configured', async () => {
    const bytes = await fixture('handbook.pdf');
    const { ocr, asked } = fakeOcr('should not be used');
    const snapshot = await fetchPdfSnapshot({
      config: { files: [{ id: 'f1', name: 'handbook.pdf', size: bytes.byteLength, key: KEY }] },
      store: await storeWith(bytes),
      ocr,
    });
    expect(asked).toHaveLength(0);
    expect(snapshot.files[0]?.content).toContain('Team Handbook');
  });

  it('sends a PDF with no text layer to the OCR provider and indexes its reading', async () => {
    const bytes = await fixture('scan.pdf');
    const { ocr, asked } = fakeOcr('Scanned minutes\n\nSecond page');
    const snapshot = await fetchPdfSnapshot({
      config: { files: [{ id: 'f1', name: 'minutes.pdf', size: bytes.byteLength, key: KEY }] },
      store: await storeWith(bytes),
      ocr,
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.name).toBe('minutes.pdf');
    /* pdf.js detaches the buffer it parses; the provider must still get the file. */
    expect(asked[0]?.bytes.byteLength).toBeGreaterThan(0);
    expect(asked[0]?.bytes.byteLength).toBe(bytes.byteLength);
    expect(snapshot.files[0]?.content).toBe('Scanned minutes\n\nSecond page');
  });

  it('yields an empty file for a scan when no OCR provider is configured', async () => {
    const bytes = await fixture('scan.pdf');
    const snapshot = await fetchPdfSnapshot({
      config: { files: [{ id: 'f1', name: 'minutes.pdf', size: bytes.byteLength, key: KEY }] },
      store: await storeWith(bytes),
      ocr: null,
    });
    expect(snapshot.files[0]?.content).toBe('');
  });

  it('lets an OCR failure fail the build as a parse failure', async () => {
    const bytes = await fixture('scan.pdf');
    const ocr: PdfOcr = {
      name: 'ocrspace',
      async recognize() {
        throw new IngestionFailure('parse_failed', 'discover-parse', 'ocrspace could not read minutes.pdf');
      },
    };
    await expect(
      fetchPdfSnapshot({
        config: { files: [{ id: 'f1', name: 'minutes.pdf', size: bytes.byteLength, key: KEY }] },
        store: await storeWith(bytes),
        ocr,
      }),
    ).rejects.toMatchObject({ code: 'parse_failed' });
  });

  it('asks for OCR only when at most half of the pages carry text', () => {
    expect(needsOcr([])).toBe(true);
    expect(needsOcr(['', ''])).toBe(true);
    expect(needsOcr(['cover', '', ''])).toBe(true);
    expect(needsOcr(['cover', 'body', '', ''])).toBe(true);
    expect(needsOcr(['a', 'b', ''])).toBe(false);
    expect(needsOcr(['a'])).toBe(false);
  });

  it('refuses a config that lists no files', async () => {
    await expect(fetchPdfSnapshot({ config: {}, store: memoryObjectStore(), ocr: null })).rejects.toMatchObject({
      code: 'source_empty',
    });
  });

  it('fails when a listed file is gone from storage', async () => {
    const error = await fetchPdfSnapshot({
      config: { files: [{ id: 'f1', name: 'gone.pdf', size: 1, key: KEY }] },
      store: memoryObjectStore(),
      ocr: null,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IngestionFailure);
    expect((error as IngestionFailure).code).toBe('source_unreachable');
  });

  it('reports bytes that are not a PDF as a parse failure', async () => {
    const store = await storeWith(new TextEncoder().encode('not a pdf at all'));
    const error = await fetchPdfSnapshot({
      config: { files: [{ id: 'f1', name: 'notes.pdf', size: 16, key: KEY }] },
      store,
      ocr: null,
    }).catch((caught: unknown) => caught);
    expect((error as IngestionFailure).code).toBe('parse_failed');
  });
});
