/**
 * One build: a set of sources in, one indexed but unpublished Version out.
 *
 * This is architecture.md 8.2 steps 2 through 9 -- fetch, scan, discover,
 * normalize, cite, chunk, embed-index, profile, evaluate. Step 10 (review) does
 * not apply to a platform library (architecture.md 8.1 routes it straight to
 * publishing) and step 11 is `publish-version.ts`, deliberately separate: a version that is
 * built but not pointed at is a safe state, and one this module can leave
 * behind if publishing has to wait.
 *
 * The version is written as `processing` and only becomes `ready` once every
 * chunk of it is in the table. requirement.md 8.1 forbids switching
 * `current_version` before a version is completely ready, and the cheapest way
 * to keep that promise is for "ready" to be the last thing written.
 */
import { and, count, eq, like, or } from 'drizzle-orm';
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
  summarizeFetch,
  textSearchConfig,
  versionLabel,
  type Citation,
  type ParsedDocument,
} from '@/lib/domain/ingestion';
import { uuidv7 } from '@/lib/domain/id';
import { segmentCjkForIndex } from '@/lib/domain/cjk';
import {
  CentroidAccumulator,
  extractTerms,
  PROFILE_LIMITS,
  PROFILE_VERSION,
  profileSearchText,
} from '@/lib/domain/profile';
import { isConnectedSourceType } from '@/lib/domain/library';
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

/**
 * Independent object-store writes run this many at a time. Serial PUTs make a
 * large library's build latency-bound (thousands of round trips, one by one);
 * unbounded fan-out makes it a burst the store throttles. Eight is neither.
 */
const PUT_CONCURRENCY = 8;

/**
 * How many chunks are embedded and written before their vectors are released.
 *
 * Large enough that the provider still sees full batches (the adapter splits
 * this into its own requests), small enough that peak memory is a few megabytes
 * whatever the size of the library.
 */
const EMBED_WINDOW = 500;

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
      language: schema.library.language,
      deletedAt: schema.library.deletedAt,
    })
    .from(schema.library)
    .where(eq(schema.library.id, input.libraryId))
    .limit(1);

  if (!library) {
    throw new IngestionFailure('source_unsupported', 'validate-source', 'no such library');
  }
  /* A tombstone is archived too; named first so the failure says why. */
  if (library.deletedAt) {
    throw new IngestionFailure('source_unsupported', 'validate-source', 'the library is deleted');
  }
  if (library.lifecycleStatus === 'archived') {
    throw new IngestionFailure('source_unsupported', 'validate-source', 'the library is archived');
  }

  const sources = await database
    .select({
      id: schema.source.id,
      type: schema.source.type,
      location: schema.source.location,
      config: schema.source.config,
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
    if (!isConnectedSourceType(source.type)) {
      throw new IngestionFailure(
        'source_unsupported',
        'validate-source',
        `${source.type} has no connector`,
      );
    }
    const snapshot = await dependencies.fetchSnapshot({
      type: source.type,
      location: source.location,
      config: source.config,
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

  /*
   * Recorded as soon as the fetch is known, before the digest decides whether
   * anything else happens: an unchanged source still tells the operator how
   * it was read, and a build that fails later still says which pages needed a
   * renderer.
   */
  await database
    .update(schema.workflowOperation)
    .set({ fetchSummary: summarizeFetch(files) })
    .where(eq(schema.workflowOperation.id, input.operationId));

  const digest = await snapshotDigest(files);

  /*
   * Which stemmer the keyword index uses, decided once and stamped on every
   * chunk. `library.language` is free text an operator typed, so the mapping
   * is deliberately forgiving and falls back to `simple` rather than guessing.
   */
  const searchConfig = textSearchConfig(library.language);
  const adapter = dependencies.embeddings();

  const current = library.currentVersionId
    ? await database
        .select({
          digest: schema.libraryVersion.sourceDigest,
          parserVersion: schema.libraryVersion.parserVersion,
          chunkerVersion: schema.libraryVersion.chunkerVersion,
          embeddingModel: schema.libraryVersion.embeddingModel,
          searchConfig: schema.libraryVersion.searchConfig,
        })
        .from(schema.libraryVersion)
        .where(eq(schema.libraryVersion.id, library.currentVersionId))
        .limit(1)
    : [];

  /*
   * The source is only half of what decides whether a rebuild is needed.
   *
   * requirement.md 8.1 freezes the parser, chunker, embedding model and search
   * configuration on a Version, which is a statement that those four decide
   * what the version *is*. So an unchanged digest is a reason to stop only when
   * today's build would produce the same thing: correcting a library's language
   * or shipping a new chunker must rebuild, and without this check both would
   * be reported as "unchanged" and quietly do nothing.
   */
  const built = current[0];
  const sameBuild =
    built !== undefined &&
    built.digest === digest &&
    built.parserVersion === PARSER_VERSION &&
    built.chunkerVersion === CHUNKER_VERSION &&
    built.embeddingModel === adapter.model &&
    built.searchConfig === searchConfig;

  /*
   * architecture.md 8.4: an unchanged digest updates `last_checked_at` and
   * stops. Not creating an empty version is the point -- a library that is
   * checked hourly and changes yearly would otherwise accumulate thousands of
   * identical versions, each one anchored and each one a superseded row.
   */
  if (sameBuild) {
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
  const quarantined: FetchedFile[] = [];
  let flaggedFiles = 0;
  const flaggedPaths = new Set<string>();
  for (const file of files) {
    const findings = scanContent(file.content);
    const status = safetyStatusOf(findings);
    if (status === 'quarantined') {
      quarantined.push(file);
      continue;
    }
    if (status === 'flagged') {
      flaggedFiles += 1;
      flaggedPaths.add(file.path);
    }
    safe.push(file);
  }

  /*
   * Kept, but out of reach: architecture.md 7 gives quarantine its own
   * prefix that the application cannot read. Deleting the evidence would
   * leave nothing to review when someone asks why a file is missing.
   * The writes are independent of one another, so they run a bounded
   * batch at a time.
   */
  for (let at = 0; at < quarantined.length; at += PUT_CONCURRENCY) {
    await Promise.all(
      quarantined.slice(at, at + PUT_CONCURRENCY).map(async (file) =>
        store.put(
          objectKeys.quarantine(input.operationId, await sha256Hex(file.path)),
          encode({ path: file.path, url: file.url, content: file.content }),
          'application/json',
        ),
      ),
    );
  }

  if (safe.length === 0) {
    throw new IngestionFailure('unsafe_content', 'scan', 'every document was quarantined');
  }

  /* ---------------------------------- discover-parse, normalize-cite, chunk */

  const parsed: { file: FetchedFile; document: ParsedDocument }[] = [];
  for (const file of safe.slice(0, INGESTION_LIMITS.maxDocuments)) {
    const format =
      file.format ??
      documentFormat(file.path) ??
      (isFallbackDocument(file.path) ? 'text' : null);
    if (!format) continue;
    const document = parseDocument({
      path: file.path,
      format,
      content: file.content,
      /* A file the connector already extracted (an uploaded PDF) is a
         document in its own right and falls back to its own name; a fetched
         page with no heading is the library's and falls back to its title. */
      fallbackTitle: file.format ? undefined : library.title,
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
    /** True when the safety scan flagged the file this document came from. */
    flagged: boolean;
  }[] = [];

  let totalChunks = 0;
  let totalTokens = 0;
  let citedChunks = 0;
  let flaggedChunks = 0;
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
      return {
        id: uuidv7(),
        ordinal: draft.ordinal,
        body: draft.body,
        tokens: draft.tokens,
        citation,
      };
    });

    totalChunks += chunks.length;
    const flagged = flaggedPaths.has(file.path);
    if (flagged) flaggedChunks += chunks.length;
    rows.push({
      document: {
        id: documentId,
        title: document.title,
        sourceUrl: file.url,
        objectKey: objectKeys.normalized(library.id, versionId, documentId),
      },
      chunks,
      flagged,
    });
  }

  if (totalChunks === 0) {
    throw new IngestionFailure('parse_failed', 'chunk', 'nothing chunked');
  }

  /* ---------------------------------------------------------- embed-index */

  const pending = rows.flatMap((row) =>
    row.chunks.map((chunk) => ({
      id: chunk.id,
      libraryId: library.id,
      versionId,
      documentId: row.document.id,
      ordinal: chunk.ordinal,
      body: chunk.body,
      tokens: chunk.tokens,
      citation: chunk.citation as Record<string, unknown>,
      /*
       * The scan's verdict for the file, carried onto its chunks. Retrieval
       * still serves `flagged` rows (only `quarantined`/`unsafe` are excluded
       * from its predicate); the status records what the scan found rather
       * than hiding it behind a blanket `clean`.
       */
      safetyStatus: row.flagged ? 'flagged' : 'clean',
      searchConfig,
      /* Pre-segmented CJK for the keyword index Postgres cannot build itself.
         lib/domain/cjk.ts; null for chunks with no Han text. */
      bodySegmented: segmentCjkForIndex(chunk.body),
    })),
  );

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
  for (let at = 0; at < rows.length; at += PUT_CONCURRENCY) {
    await Promise.all(
      rows.slice(at, at + PUT_CONCURRENCY).map((row) =>
        store.put(
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
        ),
      ),
    );
  }
  await store.put(
    objectKeys.documentManifest(library.id, versionId),
    encode(rows.map((row) => ({ id: row.document.id, title: row.document.title, url: row.document.sourceUrl }))),
    'application/json',
  );
  await store.put(
    objectKeys.vectorManifest(library.id, versionId),
    encode({
      model: adapter.model,
      dimensions: adapter.dimensions,
      searchConfig,
      leaves,
    }),
    'application/json',
  );

  /*
   * requirement.md 4.1 measures a library's capacity in bytes of content, and a
   * JavaScript string length is UTF-16 code units -- one per Han character
   * where UTF-8 spends three. Counting the encoded form is the difference
   * between a Chinese library reporting its real size and reporting a third of
   * it. The connectors already count this way.
   */
  const encoder = new TextEncoder();
  const bytes = safe.reduce((total, file) => total + encoder.encode(file.content).length, 0);

  /*
   * The same source can now be built more than once -- a configuration change
   * rebuilds unchanged bytes -- so the label is numbered against what this
   * library already has.
   *
   * One clock read for both the base and the stored label: two would let a
   * build that crosses midnight count against yesterday's base and write
   * today's, producing a `.2` with no `.1`. The count runs inside the
   * transaction that inserts the row, so two builds racing here cannot both
   * read the same number; `library_version_label_uq` is the backstop.
   */
  const builtAt = new Date();
  const base = versionLabel(digest, builtAt);

  await database.transaction(async (tx) => {
    const [priorBuilds] = await tx
      .select({ n: count() })
      .from(schema.libraryVersion)
      .where(
        and(
          eq(schema.libraryVersion.libraryId, library.id),
          or(eq(schema.libraryVersion.label, base), like(schema.libraryVersion.label, `${base}.%`)),
        ),
      );

    await tx.insert(schema.libraryVersion).values({
      id: versionId,
      libraryId: library.id,
      label: versionLabel(digest, builtAt, (priorBuilds?.n ?? 0) + 1),
      sourceDigest: digest,
      parserVersion: PARSER_VERSION,
      chunkerVersion: CHUNKER_VERSION,
      embeddingModel: adapter.model,
      searchConfig,
      contentMerkleRoot: root,
      /* Not `ready`: nothing has been embedded yet. */
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
  });

  /*
   * Embedded and inserted a window at a time, and the vectors are dropped as
   * soon as they are written.
   *
   * Holding every vector for a build is what makes a large library impossible
   * rather than slow: the caps above permit roughly forty thousand chunks, and
   * forty thousand 1536-dimension vectors is about half a gigabyte of live
   * JavaScript numbers before a single row is sent. A window keeps that flat --
   * a few megabytes -- whatever the size of the source.
   *
   * The chunks are therefore not written in one transaction, and they do not
   * need to be. architecture.md 8.3 requires the *publication* to be atomic,
   * and `publish-version.ts` is that transaction: it refuses a version that is
   * not `ready` and counts its chunks against `total_chunks` before moving the
   * pointer. A build interrupted here leaves a `processing` version that can
   * never be published, which `discardVersion` then clears away.
   */
  /*
   * The profile (architecture.md 8.2 step 8, 9.6) is accumulated while the
   * vectors stream past, because they are dropped as soon as they are written:
   * the centroid accumulator keeps k running means, never the vectors. Terms
   * come from the same bodies being embedded; titles from the document rows.
   * All of it derived, all of it rebuilt with the version (architecture.md 6.4).
   */
  const centroids = new CentroidAccumulator();

  try {
    for (let offset = 0; offset < pending.length; offset += EMBED_WINDOW) {
      const window = pending.slice(offset, offset + EMBED_WINDOW);
      const vectors = await adapter.embed(window.map((chunk) => chunk.body));
      if (vectors.length !== window.length) {
        throw new IngestionFailure(
          'embedding_unavailable',
          'embed-index',
          'the embedding provider returned the wrong number of vectors',
        );
      }
      for (const vector of vectors) centroids.add(vector);

      for (let at = 0; at < window.length; at += INSERT_BATCH) {
        await database.insert(schema.chunk).values(
          window.slice(at, at + INSERT_BATCH).map((chunk, index) => ({
            ...chunk,
            embedding: vectors[at + index] as number[],
          })),
        );
      }
    }

    const titles = rows.map((row) => row.document.title).slice(0, PROFILE_LIMITS.maxTitles);
    const terms = extractTerms(pending.map((chunk) => chunk.body));

    await database.transaction(async (tx) => {
      /*
       * Counted from the table, not from the loop above, so `ready` is a
       * statement about rows that exist rather than about writes we believe
       * succeeded.
       */
      const [written] = await tx
        .select({ n: count() })
        .from(schema.chunk)
        .where(eq(schema.chunk.versionId, versionId));

      if ((written?.n ?? 0) !== totalChunks) {
        throw new IngestionFailure(
          'index_incomplete',
          'embed-index',
          'the version is missing chunks',
        );
      }

      /*
       * The profile rides in the `ready` transaction, so `ready` implies "this
       * version can be routed to" -- library discovery never meets a version
       * whose chunks exist but whose profile does not.
       */
      await tx.insert(schema.libraryProfile).values({
        id: uuidv7(),
        libraryId: library.id,
        versionId,
        profileVersion: PROFILE_VERSION,
        documentTitles: titles,
        terms,
        searchText: profileSearchText(titles, terms),
      });

      const vectors = centroids.centroids();
      if (vectors.length > 0) {
        await tx.insert(schema.libraryProfileVector).values(
          vectors.map((embedding, ordinal) => ({
            id: uuidv7(),
            libraryId: library.id,
            versionId,
            ordinal,
            embedding,
          })),
        );
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
  } catch (error) {
    await discardVersion(database, versionId);
    throw error;
  }

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
    flaggedChunks,
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

/**
 * Clears away a version that never became `ready`.
 *
 * Best effort, and deliberately so: it runs while another failure is already
 * being reported, and failing to tidy up must not replace the reason the build
 * stopped with a reason about the tidying. What it leaves behind if it fails is
 * a `processing` version, which nothing publishes and nothing queries.
 */
async function discardVersion(database: ReturnType<typeof db>, versionId: string): Promise<void> {
  try {
    await database
      .delete(schema.libraryProfileVector)
      .where(eq(schema.libraryProfileVector.versionId, versionId));
    await database
      .delete(schema.libraryProfile)
      .where(eq(schema.libraryProfile.versionId, versionId));
    await database.delete(schema.chunk).where(eq(schema.chunk.versionId, versionId));
    await database.delete(schema.document).where(eq(schema.document.versionId, versionId));
    await database.delete(schema.libraryVersion).where(eq(schema.libraryVersion.id, versionId));
  } catch (error) {
    console.error(
      `could not discard incomplete version ${versionId}: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
    );
  }
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function short(id: string): string {
  return id.replace(/-/g, '').slice(0, 8);
}
