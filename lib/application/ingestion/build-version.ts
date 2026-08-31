/**
 * One build: a set of sources in, one indexed but unpublished Version out.
 *
 * This is architecture.md 8.2 steps 2 through 8 -- fetch, scan, discover,
 * normalize, cite, chunk, embed-index, evaluate. Step 9 (review) does not apply
 * to a platform library (architecture.md 8.1 routes it straight to publishing)
 * and step 10 is `publish-version.ts`, deliberately separate: a version that is
 * built but not pointed at is a safe state, and one this module can leave
 * behind if publishing has to wait.
 *
 * The version is written as `processing` and only becomes `ready` once every
 * chunk of it is in the table. requirement.md 8.1 forbids switching
 * `current_version` before a version is completely ready, and the cheapest way
 * to keep that promise is for "ready" to be the last thing written.
 */
import { eq } from 'drizzle-orm';
import {
  CHUNKER_VERSION,
  chunkDocument,
  citationFor,
  documentFormat,
  IngestionFailure,
  INGESTION_LIMITS,
  isFallbackDocument,
  merkleRoot,
  parseDocument,
  PARSER_VERSION,
  safetyStatusOf,
  scanContent,
  SCORE_ALGORITHM_VERSION,
  scoreLibrary,
  sha256Hex,
  snapshotDigest,
  versionLabel,
  type Citation,
  type ParsedDocument,
} from '@/lib/domain/ingestion';
import { uuidv7 } from '@/lib/domain/id';
import { isPlatformSourceType, type PlatformSourceType } from '@/lib/domain/library';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { objectKeys } from '@/lib/infrastructure/objects/store';
import type { FetchedFile, SourceSnapshot } from '@/lib/infrastructure/connectors';
import { defaultDependencies, type IngestionDependencies } from './dependencies';

export interface BuildInput {
  libraryId: string;
  operationId: string;
  dependencies?: IngestionDependencies;
}

export type BuildOutcome =
  | { changed: false; digest: string }
  | { changed: true; digest: string; versionId: string; documents: number; chunks: number };

/** Rows are inserted in batches so one build is not one enormous statement. */
const INSERT_BATCH = 250;

export async function buildVersion(input: BuildInput): Promise<BuildOutcome> {
  const dependencies = input.dependencies ?? defaultDependencies;
  const database = db();

  /* ------------------------------------------------------ validate-source */

  const available = dependencies.configured();
  if (!available.embeddings) {
    throw new IngestionFailure(
      'embedding_unavailable',
      'validate-source',
      'no embedding provider is configured',
    );
  }
  if (!available.storage) {
    throw new IngestionFailure(
      'storage_unavailable',
      'validate-source',
      'no object storage is configured',
    );
  }

  const [library] = await database
    .select({
      id: schema.library.id,
      publicId: schema.library.publicId,
      title: schema.library.title,
      isPlatformLibrary: schema.library.isPlatformLibrary,
      lifecycleStatus: schema.library.lifecycleStatus,
      currentVersionId: schema.library.currentVersionId,
    })
    .from(schema.library)
    .where(eq(schema.library.id, input.libraryId))
    .limit(1);

  if (!library) {
    throw new IngestionFailure('source_unsupported', 'validate-source', 'no such library');
  }
  if (library.lifecycleStatus === 'archived') {
    throw new IngestionFailure('source_unsupported', 'validate-source', 'the library is archived');
  }

  const sources = await database
    .select({
      id: schema.source.id,
      type: schema.source.type,
      location: schema.source.location,
    })
    .from(schema.source)
    .where(eq(schema.source.libraryId, library.id))
    .orderBy(schema.source.id);

  if (sources.length === 0) {
    throw new IngestionFailure('source_unsupported', 'validate-source', 'the library has no source');
  }

  /* ------------------------------------------------------- fetch-snapshot */

  const snapshots: { source: (typeof sources)[number]; snapshot: SourceSnapshot }[] = [];
  for (const source of sources) {
    if (!isPlatformSourceType(source.type)) {
      throw new IngestionFailure(
        'source_unsupported',
        'validate-source',
        `${source.type} has no connector`,
      );
    }
    const snapshot = await dependencies.fetchSnapshot({
      type: source.type as PlatformSourceType,
      location: source.location,
    });
    snapshots.push({ source, snapshot });
  }

  /*
   * Paths are namespaced by source only when there is more than one. A single
   * source is the overwhelmingly common case, and prefixing its paths would
   * put a synthetic directory into every citation for no reason.
   */
  const files: FetchedFile[] = snapshots.flatMap(({ source, snapshot }, index) =>
    snapshot.files.map((file) => ({
      ...file,
      path: snapshots.length > 1 ? `${index}-${short(source.id)}/${file.path}` : file.path,
    })),
  );

  if (files.length === 0) {
    throw new IngestionFailure('source_empty', 'fetch-snapshot', 'the source served no documents');
  }

  const digest = await snapshotDigest(files);

  /*
   * architecture.md 8.4: an unchanged digest updates `last_checked_at` and
   * stops. Not creating an empty version is the point -- a library that is
   * checked hourly and changes yearly would otherwise accumulate thousands of
   * identical versions, each one anchored and each one a superseded row.
   */
  const current = library.currentVersionId
    ? await database
        .select({ digest: schema.libraryVersion.sourceDigest })
        .from(schema.libraryVersion)
        .where(eq(schema.libraryVersion.id, library.currentVersionId))
        .limit(1)
    : [];

  if (current[0]?.digest === digest) {
    await database
      .update(schema.library)
      .set({ lastCheckedAt: new Date() })
      .where(eq(schema.library.id, library.id));
    return { changed: false, digest };
  }

  const store = dependencies.store();
  await store.put(
    objectKeys.snapshot(library.id, input.operationId, 'json'),
    encode({ digest, files: files.map((file) => ({ path: file.path, url: file.url })) }),
    'application/json',
  );

  /* ---------------------------------------------------------------- scan */

  const safe: FetchedFile[] = [];
  let flaggedFiles = 0;
  for (const file of files) {
    const findings = scanContent(file.content);
    const status = safetyStatusOf(findings);
    if (status === 'quarantined') {
      /*
       * Kept, but out of reach: architecture.md 7 gives quarantine its own
       * prefix that the application cannot read. Deleting the evidence would
       * leave nothing to review when someone asks why a file is missing.
       */
      await store.put(
        objectKeys.quarantine(input.operationId, await sha256Hex(file.path)),
        encode({ path: file.path, url: file.url, content: file.content }),
        'application/json',
      );
      continue;
    }
    if (status === 'flagged') flaggedFiles += 1;
    safe.push(file);
  }

  if (safe.length === 0) {
    throw new IngestionFailure('unsafe_content', 'scan', 'every document was quarantined');
  }

  /* ---------------------------------- discover-parse, normalize-cite, chunk */

  const parsed: { file: FetchedFile; document: ParsedDocument }[] = [];
  for (const file of safe.slice(0, INGESTION_LIMITS.maxDocuments)) {
    const format = documentFormat(file.path) ?? (isFallbackDocument(file.path) ? 'text' : null);
    if (!format) continue;
    const document = parseDocument({
      path: file.path,
      format,
      content: file.content,
      fallbackTitle: library.title,
    });
    if (document.body.trim().length === 0) continue;
    parsed.push({ file, document });
  }

  if (parsed.length === 0) {
    throw new IngestionFailure('parse_failed', 'discover-parse', 'nothing parsed to text');
  }

  const versionId = uuidv7();
  const rows: {
    document: { id: string; title: string; sourceUrl: string; objectKey: string };
    chunks: { id: string; ordinal: number; body: string; tokens: number; citation: Citation }[];
  }[] = [];

  let totalChunks = 0;
  let totalTokens = 0;
  let citedChunks = 0;
  const bodies: string[] = [];
  const seenBodies = new Set<string>();
  let duplicates = 0;

  for (const { file, document } of parsed) {
    if (totalChunks >= INGESTION_LIMITS.maxChunks) break;

    const documentId = uuidv7();
    const drafts = chunkDocument(document);
    if (drafts.length === 0) continue;

    const chunks = drafts.map((draft) => {
      const citation = citationFor({ document, sourceUrl: file.url, headings: draft.headings });
      if (citation.section) citedChunks += 1;
      totalTokens += draft.tokens;
      const key = `${draft.body.length}:${draft.body.slice(0, 200)}`;
      if (seenBodies.has(key)) duplicates += 1;
      else seenBodies.add(key);
      bodies.push(draft.body);
      return {
        id: uuidv7(),
        ordinal: draft.ordinal,
        body: draft.body,
        tokens: draft.tokens,
        citation,
      };
    });

    totalChunks += chunks.length;
    rows.push({
      document: {
        id: documentId,
        title: document.title,
        sourceUrl: file.url,
        objectKey: objectKeys.normalized(library.id, versionId, documentId),
      },
      chunks,
    });
  }

  if (totalChunks === 0) {
    throw new IngestionFailure('parse_failed', 'chunk', 'nothing chunked');
  }

  /* ---------------------------------------------------------- embed-index */

  const adapter = dependencies.embeddings();
  const vectors = await adapter.embed(bodies);
  if (vectors.length !== bodies.length) {
    throw new IngestionFailure(
      'embedding_unavailable',
      'embed-index',
      'the embedding provider returned the wrong number of vectors',
    );
  }

  const leaves = await Promise.all(
    rows.flatMap((row) =>
      row.chunks.map((chunk) => sha256Hex(`${row.document.id}:${chunk.ordinal}:${chunk.body}`)),
    ),
  );
  const root = await merkleRoot(leaves);

  /*
   * Objects first, transaction second. architecture.md 8.3: the only ordering
   * that crosses systems is that an object referenced by a committed row must
   * already exist. An object with no row is collected by the store's lifecycle
   * rules; a row pointing at an object that was never written is a broken
   * library.
   */
  for (const row of rows) {
    await store.put(
      row.document.objectKey,
      encode({
        title: row.document.title,
        url: row.document.sourceUrl,
        chunks: row.chunks.map((chunk) => ({
          ordinal: chunk.ordinal,
          tokens: chunk.tokens,
          citation: chunk.citation,
          body: chunk.body,
        })),
      }),
      'application/json',
    );
  }
  await store.put(
    objectKeys.documentManifest(library.id, versionId),
    encode(rows.map((row) => ({ id: row.document.id, title: row.document.title, url: row.document.sourceUrl }))),
    'application/json',
  );
  await store.put(
    objectKeys.vectorManifest(library.id, versionId),
    encode({ model: adapter.model, dimensions: adapter.dimensions, leaves }),
    'application/json',
  );

  const bytes = safe.reduce((total, file) => total + file.content.length, 0);

  await database.transaction(async (tx) => {
    await tx.insert(schema.libraryVersion).values({
      id: versionId,
      libraryId: library.id,
      label: versionLabel(digest, new Date()),
      sourceDigest: digest,
      parserVersion: PARSER_VERSION,
      chunkerVersion: CHUNKER_VERSION,
      embeddingModel: adapter.model,
      contentMerkleRoot: root,
      indexStatus: 'processing',
      totalTokens,
      totalChunks,
    });

    await tx.insert(schema.document).values(
      rows.map((row) => ({
        id: row.document.id,
        libraryId: library.id,
        versionId,
        title: row.document.title,
        sourceUrl: row.document.sourceUrl,
        objectKey: row.document.objectKey,
      })),
    );

    let cursor = 0;
    const flat = rows.flatMap((row) =>
      row.chunks.map((chunk) => ({
        id: chunk.id,
        libraryId: library.id,
        versionId,
        documentId: row.document.id,
        ordinal: chunk.ordinal,
        body: chunk.body,
        tokens: chunk.tokens,
        citation: chunk.citation as Record<string, unknown>,
        safetyStatus: 'clean',
        embedding: vectors[cursor++] ?? [],
      })),
    );

    for (let offset = 0; offset < flat.length; offset += INSERT_BATCH) {
      await tx.insert(schema.chunk).values(flat.slice(offset, offset + INSERT_BATCH));
    }

    /* Last, so `ready` is never true of a version that is missing chunks. */
    await tx
      .update(schema.libraryVersion)
      .set({ indexStatus: 'ready' })
      .where(eq(schema.libraryVersion.id, versionId));

    await tx
      .update(schema.library)
      .set({
        lastCheckedAt: new Date(),
        lastSuccessfulRefreshAt: new Date(),
        storageBytes: bytes,
      })
      .where(eq(schema.library.id, library.id));
  });

  /* ------------------------------------------------------------- evaluate */

  const newest = snapshots
    .map(({ snapshot }) => snapshot.lastModifiedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const scores = scoreLibrary({
    verified: false,
    isPlatformLibrary: library.isPlatformLibrary,
    documents: rows.length,
    chunks: totalChunks,
    duplicateRatio: totalChunks === 0 ? 0 : duplicates / totalChunks,
    citedRatio: totalChunks === 0 ? 0 : citedChunks / totalChunks,
    flaggedChunks: flaggedFiles,
    ageDays: newest ? Math.max(0, (Date.now() - newest.getTime()) / 86_400_000) : 3_650,
    hasLicense: snapshots.some(({ snapshot }) => snapshot.hasLicense),
  });

  await database.insert(schema.libraryScore).values({
    id: uuidv7(),
    libraryId: library.id,
    algorithmVersion: SCORE_ALGORITHM_VERSION,
    trustScore: scores.trust,
    benchmarkScore: scores.benchmark,
    breakdown: {
      documents: rows.length,
      chunks: totalChunks,
      tokens: totalTokens,
      flaggedFiles,
      quarantinedFiles: files.length - safe.length,
    },
  });

  return { changed: true, digest, versionId, documents: rows.length, chunks: totalChunks };
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function short(id: string): string {
  return id.replace(/-/g, '').slice(0, 8);
}
