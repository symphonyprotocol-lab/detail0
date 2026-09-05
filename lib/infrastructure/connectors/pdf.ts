/**
 * Uploaded PDFs, read back from object storage and turned into text.
 *
 * The other connectors fetch from somewhere; this one has nothing to fetch.
 * The wizard put the files in the bucket before the library existed
 * (architecture.md 7), and the source row's config says where. So the
 * "snapshot" is: read each key, extract its text, and hand the pipeline a
 * file per PDF -- named as the operator named it, so that a citation reads
 * `handbook.pdf` and not an object key.
 *
 * Text extraction is pdf.js, through unpdf's serverless build: no worker
 * thread, no canvas, no native module. Pages are joined with a blank line;
 * page boundaries are not headings, and pretending they are would cut
 * paragraphs mid-sentence at every page break.
 */
import { extractText, getDocumentProxy } from 'unpdf';
import { EMPTY_SOURCE_CONFIG, IngestionFailure } from '@/lib/domain/ingestion';
import { uploadedFilesOf, type UploadedFile } from '@/lib/domain/library';
import type { ObjectStore } from '@/lib/infrastructure/objects/store';
import type { FetchedFile, SourceSnapshot } from './types';

/** Reads run this many at a time; the store is one request per key. */
const READ_CONCURRENCY = 4;

export async function fetchPdfSnapshot(input: {
  config: Record<string, unknown>;
  store: Pick<ObjectStore, 'get'>;
}): Promise<SourceSnapshot> {
  const uploads = uploadedFilesOf(input.config);
  if (uploads.length === 0) {
    throw new IngestionFailure('source_empty', 'fetch-snapshot', 'the source lists no files');
  }

  const files: FetchedFile[] = [];
  for (let at = 0; at < uploads.length; at += READ_CONCURRENCY) {
    const batch = await Promise.all(
      uploads.slice(at, at + READ_CONCURRENCY).map((upload) => readOne(upload, input.store)),
    );
    files.push(...batch);
  }

  return {
    files,
    config: EMPTY_SOURCE_CONFIG,
    revision: null,
    lastModifiedAt: null,
    hasLicense: false,
    stale: false,
  };
}

async function readOne(upload: UploadedFile, store: Pick<ObjectStore, 'get'>): Promise<FetchedFile> {
  let bytes: Uint8Array | null;
  try {
    bytes = await store.get(upload.key);
  } catch (error) {
    throw new IngestionFailure(
      'storage_unavailable',
      'fetch-snapshot',
      `could not read ${upload.name}: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
  if (!bytes) {
    throw new IngestionFailure(
      'source_unreachable',
      'fetch-snapshot',
      `${upload.name} is no longer in storage`,
    );
  }

  return {
    path: upload.name,
    /* Served by the dashboard for the owning workspace; the library id is
       not known here, and the route resolves the file by its own id. */
    url: `/dashboard/files/${upload.id}`,
    content: await pdfText(bytes, upload.name),
    format: 'text',
  };
}

/**
 * The text of a PDF, one page after another. A PDF with no extractable
 * text -- a scan, an image-only export -- comes back empty, and the build's
 * parse step reports that as nothing parsed rather than this connector
 * inventing a page.
 */
export async function pdfText(bytes: Uint8Array, name: string): Promise<string> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text])
      .map((page) => page.replace(/[ \t]+\n/g, '\n').trim())
      .filter((page) => page.length > 0)
      .join('\n\n');
  } catch (error) {
    throw new IngestionFailure(
      'parse_failed',
      'discover-parse',
      `${name} is not a readable PDF: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
}
