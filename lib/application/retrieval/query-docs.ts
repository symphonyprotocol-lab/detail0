/**
 * Retrieval within one library. architecture.md 9.2, and the order is the
 * contract: authorize and pin the version, reserve one call, then recall --
 * never the other way around.
 *
 *   resolve library (alias-aware) -> enforce visibility -> pin ready version
 *   -> reserve one call -> FTS + vector recall within library + version
 *   -> reciprocal-rank fusion -> dedupe and safety filter -> trim to maxTokens
 *   -> commit the usage event
 *
 * Vector recall is an exact scan of the pinned version's rows (architecture.md
 * 9.1: no chunk-level ANN index exists, deliberately), so recall is full and
 * the cost is bounded by the version, not the platform. The keyword half uses
 * the text-search configuration frozen on the version, so query stemming
 * always matches how the chunks were indexed.
 *
 * Not in this increment, recorded rather than implied: the workspace Policy
 * Evaluator (architecture.md 10.2 -- its check belongs between visibility and
 * reservation), the rerank stage (the adapter is not implemented; RRF order
 * stands), the Redis result cache (9.4 -- correctness never depended on it),
 * and the earning event (11.4 -- lands with publisher accounting).
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { AppError } from '@/contracts/errors';
import type { ChunkResult, QueryDocsInput, QueryDocsOutput } from '@/contracts/schemas';
import { isQueryable } from '@/lib/domain';
import { commitCall, releaseCall, reserveCall, type ReservedCall } from '@/lib/application/plans';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import {
  embeddingAdapter,
  isEmbeddingConfigured,
  type EmbeddingAdapter,
} from '@/lib/infrastructure/ai/providers';
import type { CallerContext } from './index';
import { toTsquery } from './resolve-library';
import { searchTokens } from '@/lib/domain/profile';

export interface RetrievalDependencies {
  embeddings(): EmbeddingAdapter;
  configured(): { embeddings: boolean };
}

const defaultDependencies: RetrievalDependencies = {
  embeddings: embeddingAdapter,
  configured: () => ({ embeddings: isEmbeddingConfigured() }),
};

/** Per-path recall width inside the version. §9.3: bounded, never a full scan. */
const RECALL_LIMIT = 50;
const RRF_K = 60;

export async function queryDocs(
  caller: CallerContext,
  input: QueryDocsInput,
  dependencies: RetrievalDependencies = defaultDependencies,
): Promise<QueryDocsOutput> {
  const startedAt = Date.now();
  const database = db();

  /* -------------------------------------------- resolve, authorize, pin */

  const { basePublicId, versionLabel } = splitLibraryId(input.libraryId);

  let [library] = await database
    .select(librarySelection)
    .from(schema.library)
    .where(eq(schema.library.publicId, basePublicId));

  if (!library) {
    const [alias] = await database
      .select({ libraryId: schema.libraryAlias.libraryId })
      .from(schema.libraryAlias)
      .where(eq(schema.libraryAlias.fromPublicId, basePublicId));
    if (alias) {
      [library] = await database
        .select(librarySelection)
        .from(schema.library)
        .where(eq(schema.library.id, alias.libraryId));
    }
  }

  /*
   * architecture.md 5.2: an invisible private library and a nonexistent one
   * answer identically, before anything else about them is examined.
   */
  const visible =
    library &&
    (library.visibility === 'public' ||
      (caller.workspaceId !== null && library.ownerWorkspaceId === caller.workspaceId));
  if (!library || !visible) {
    throw new AppError('library_not_found', 'no such library');
  }
  if (library.lifecycleStatus === 'suspended') {
    throw new AppError('library_suspended', 'the library is suspended');
  }
  if (
    !isQueryable({ lifecycleStatus: library.lifecycleStatus, indexStatus: library.indexStatus }) ||
    !library.currentVersionId
  ) {
    throw new AppError('library_not_ready', 'the library has no queryable version');
  }

  const version = versionLabel
    ? await pinLabeledVersion(database, library.id, versionLabel)
    : await pinVersion(database, library.currentVersionId);

  /* ---------------------------------------------------------- reserve */

  /*
   * Anonymous trial traffic is admitted by the edge rate limit
   * (architecture.md 11.2) and never touches subscription quota; only an
   * authenticated workspace reserves and is metered.
   */
  const reservation = caller.workspaceId
    ? await reserveCall({ workspaceId: caller.workspaceId, requestId: caller.requestId })
    : null;

  try {
    /* ---------------------------------------------------------- recall */

    /*
     * OR over the query's tokens, ranked -- AND semantics (plainto) would
     * demand every word in one chunk, and a question's words usually straddle
     * chunks. Each quoted token is still normalised through the version's
     * frozen configuration, so stemming matches how the chunks were indexed.
     */
    const tsquery = toTsquery(searchTokens(input.query));
    const keyword = tsquery
      ? await database
          .select({
            id: schema.chunk.id,
            body: schema.chunk.body,
            tokens: schema.chunk.tokens,
            citation: schema.chunk.citation,
          })
          .from(schema.chunk)
          .where(
            and(
              scopedTo(library.id, version.id),
              sql`${schema.chunk.searchVector} @@ to_tsquery(${version.searchConfig}::regconfig, ${tsquery})`,
            ),
          )
          .orderBy(
            desc(
              sql`ts_rank(${schema.chunk.searchVector}, to_tsquery(${version.searchConfig}::regconfig, ${tsquery}))`,
            ),
          )
          .limit(RECALL_LIMIT)
      : [];

    let semantic: typeof keyword = [];
    if (dependencies.configured().embeddings) {
      const [queryVector] = await dependencies.embeddings().embed([input.query]);
      if (queryVector) {
        const literal = `[${queryVector.join(',')}]`;
        semantic = await database
          .select({
            id: schema.chunk.id,
            body: schema.chunk.body,
            tokens: schema.chunk.tokens,
            citation: schema.chunk.citation,
          })
          .from(schema.chunk)
          .where(scopedTo(library.id, version.id))
          .orderBy(sql`${schema.chunk.embedding} <=> ${literal}::vector`)
          .limit(RECALL_LIMIT);
      }
    }

    /* --------------------------------------- fuse, dedupe, trim, format */

    const fused = new Map<string, { score: number; row: (typeof keyword)[number] }>();
    for (const list of [keyword, semantic]) {
      list.forEach((row, index) => {
        const entry = fused.get(row.id);
        const gain = 1 / (RRF_K + index + 1);
        if (entry) entry.score += gain;
        else fused.set(row.id, { score: gain, row });
      });
    }

    const seenBodies = new Set<string>();
    const chunks: ChunkResult[] = [];
    let budget = input.maxTokens;

    for (const { score, row } of [...fused.values()].sort((a, b) => b.score - a.score)) {
      /* §9.3: near-duplicates collapse; the key mirrors the builder's. */
      const bodyKey = `${row.body.length}:${row.body.slice(0, 200)}`;
      if (seenBodies.has(bodyKey)) continue;
      const citation = toCitation(row.citation);
      if (!citation) continue; /* §9.3: a chunk without a citation is not returned */
      if (row.tokens > budget) continue;
      seenBodies.add(bodyKey);
      budget -= row.tokens;
      chunks.push({
        chunkId: row.id,
        text: row.body,
        score: Number(score.toFixed(6)),
        tokens: row.tokens,
        citation,
      });
    }

    /* ----------------------------------------------------------- meter */

    const returnedTokens = chunks.reduce((total, chunk) => total + chunk.tokens, 0);
    if (reservation) {
      await commitCall({
        reservation,
        libraryId: library.id,
        versionId: version.id,
        operation: 'context',
        entrypoint: caller.apiKeyId ? 'rest' : 'web',
        statusCode: 200,
        latencyMs: Date.now() - startedAt,
        inputTokens: null,
        returnedTokens,
      });
    }

    return {
      libraryId: library.publicId,
      version: version.label,
      chunks,
      usage: usageOf(reservation),
      requestId: caller.requestId,
    };
  } catch (error) {
    /*
     * §11.1: a platform failure releases the seat and writes no event. A
     * refusal thrown before this block (quota, visibility) reserved nothing.
     */
    if (reservation && !(error instanceof AppError)) {
      await releaseCall(reservation.reservationId).catch(() => {});
    }
    throw error;
  }
}

const librarySelection = {
  id: schema.library.id,
  publicId: schema.library.publicId,
  visibility: schema.library.visibility,
  lifecycleStatus: schema.library.lifecycleStatus,
  indexStatus: schema.library.indexStatus,
  ownerWorkspaceId: schema.library.ownerWorkspaceId,
  currentVersionId: schema.library.currentVersionId,
};

/** §9.1: every chunk read is scoped, and unsafe rows are excluded in the same predicate. */
function scopedTo(libraryId: string, versionId: string) {
  return and(
    eq(schema.chunk.libraryId, libraryId),
    eq(schema.chunk.versionId, versionId),
    sql`${schema.chunk.safetyStatus} not in ('quarantined', 'unsafe')`,
  );
}

interface PinnedVersion {
  id: string;
  label: string;
  searchConfig: string;
}

async function pinVersion(
  database: ReturnType<typeof db>,
  versionId: string,
): Promise<PinnedVersion> {
  const [version] = await database
    .select({
      id: schema.libraryVersion.id,
      label: schema.libraryVersion.label,
      searchConfig: schema.libraryVersion.searchConfig,
      indexStatus: schema.libraryVersion.indexStatus,
    })
    .from(schema.libraryVersion)
    .where(eq(schema.libraryVersion.id, versionId));
  if (!version || version.indexStatus !== 'ready') {
    throw new AppError('library_not_ready', 'the library has no queryable version');
  }
  return version;
}

/** A /owner/name/version id pins that label instead of the current pointer. */
async function pinLabeledVersion(
  database: ReturnType<typeof db>,
  libraryId: string,
  label: string,
): Promise<PinnedVersion> {
  const [version] = await database
    .select({
      id: schema.libraryVersion.id,
      label: schema.libraryVersion.label,
      searchConfig: schema.libraryVersion.searchConfig,
      indexStatus: schema.libraryVersion.indexStatus,
    })
    .from(schema.libraryVersion)
    .where(
      and(
        eq(schema.libraryVersion.libraryId, libraryId),
        eq(schema.libraryVersion.label, label),
        inArray(schema.libraryVersion.indexStatus, ['ready', 'stale']),
      ),
    );
  if (!version) {
    throw new AppError('library_not_found', 'no such version for this library');
  }
  return version;
}

function splitLibraryId(libraryId: string): { basePublicId: string; versionLabel: string | null } {
  const segments = libraryId.split('/').filter(Boolean);
  if (segments.length <= 2) return { basePublicId: libraryId, versionLabel: null };
  return {
    basePublicId: `/${segments[0]}/${segments[1]}`,
    versionLabel: segments.slice(2).join('/'),
  };
}

function toCitation(raw: Record<string, unknown>): ChunkResult['citation'] | null {
  const url = typeof raw.url === 'string' ? raw.url : null;
  const title = typeof raw.title === 'string' ? raw.title : null;
  if (!url || !title) return null;
  return {
    sourceUrl: url,
    documentTitle: title,
    section: typeof raw.section === 'string' ? raw.section : null,
    lines: null,
  };
}

function usageOf(reservation: ReservedCall | null): QueryDocsOutput['usage'] {
  if (!reservation) {
    return { callsUsed: 1, planAllowanceRemaining: 0, addonBalanceRemaining: 0 };
  }
  return {
    callsUsed: 1,
    planAllowanceRemaining: reservation.planAllowanceRemaining,
    addonBalanceRemaining: reservation.addonBalanceRemaining,
  };
}
