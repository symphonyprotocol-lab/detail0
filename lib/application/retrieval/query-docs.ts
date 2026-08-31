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
 * reservation), the Redis result cache (9.4 -- correctness never depended on
 * it), and the earning event (11.4 -- lands with publisher accounting).
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
  isRerankConfigured,
  rerankAdapter,
  type EmbeddingAdapter,
  type RerankAdapter,
} from '@/lib/infrastructure/ai/providers';
import type { CallerContext } from './index';
import { toTsquery } from './resolve-library';
import { searchTokens } from '@/lib/domain/profile';
import { cjkSearchTokens, containsCjk } from '@/lib/domain/cjk';
import { sha256Hex } from '@/lib/domain/ingestion';
import { cacheSetTagged, retrievalCache, type RetrievalCache } from '@/lib/infrastructure/cache/redis';

export interface RetrievalDependencies {
  embeddings(): EmbeddingAdapter;
  rerank(): RerankAdapter;
  cache(): RetrievalCache;
  configured(): { embeddings: boolean; rerank: boolean };
}

const defaultDependencies: RetrievalDependencies = {
  embeddings: embeddingAdapter,
  rerank: rerankAdapter,
  cache: retrievalCache,
  configured: () => ({ embeddings: isEmbeddingConfigured(), rerank: isRerankConfigured() }),
};

/**
 * Participates in every cache key (architecture.md 9.4): recall widths,
 * fusion constants, rerank windows and trim rules all change what a cached
 * result means. Bump on any change to the retrieval pipeline's behaviour.
 */
export const RETRIEVAL_CONFIG_VERSION = 're0-retrieval-1';
/** Entries expire on their own; the version in the key is the invalidation. */
const CACHE_TTL_SECONDS = 21_600;
/** Policy versions are not implemented yet; the key carries a fixed slot. */
const POLICY_VERSION_PLACEHOLDER = 'p0';

/** Per-path recall width inside the version. §9.3: bounded, never a full scan. */
const RECALL_LIMIT = 50;
const RRF_K = 60;
/** §9.3: rerank only touches the fused head, never the whole recall. */
const RERANK_WINDOW = 30;
/** Enough of a chunk for a reranker to judge it; the rest is cost. */
const RERANK_DOCUMENT_CHARS = 1_500;

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
    /* ----------------------------------------------------------- cache */

    /*
     * architecture.md 9.4, checked only now: a hit has already passed the
     * same visibility, state and quota gates as a miss. Public libraries
     * only -- a public version's chunks are identical for every caller, so
     * one shared entry is safe, while caching private responses would demand
     * the per-workspace encrypted partition 9.4 prescribes and is deferred
     * with it. The canonical JSON is the only cached shape; TXT derives from
     * it downstream, so one entry serves both response types. Metering runs
     * on hits exactly as on misses: a cached answer is still a served call.
     */
    const cacheable = library.visibility === 'public';
    const cacheKey = cacheable
      ? `ctx:pub:${version.id}:${POLICY_VERSION_PLACEHOLDER}:${await sha256Hex(input.query)}:${input.maxTokens}:${RETRIEVAL_CONFIG_VERSION}`
      : null;

    if (cacheKey) {
      const hit = await dependencies
        .cache()
        .get(cacheKey)
        .catch(() => null);
      if (hit) {
        let chunks: ChunkResult[] | null = null;
        try {
          chunks = (JSON.parse(hit) as { chunks: ChunkResult[] }).chunks;
        } catch {
          chunks = null; /* a corrupt entry is a miss, never an error */
        }
        if (chunks) {
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
              returnedTokens: chunks.reduce((total, chunk) => total + chunk.tokens, 0),
            });
          }
          return {
            libraryId: library.publicId,
            version: version.label,
            chunks,
            usage: usageOf(reservation),
            requestId: caller.requestId,
          };
        }
      }
    }

    /* ---------------------------------------------------------- recall */

    /*
     * OR over the query's tokens, ranked -- AND semantics (plainto) would
     * demand every word in one chunk, and a question's words usually straddle
     * chunks. Each quoted token is still normalised through the version's
     * frozen configuration, so stemming matches how the chunks were indexed.
     *
     * A query with Han text also matches the pre-segmented CJK vector
     * (lib/domain/cjk.ts) -- the main vector cannot see inside a Han run, and
     * without this branch Chinese keyword recall is silently zero.
     */
    const tsquery = toTsquery(searchTokens(input.query));
    const cjkQuery = containsCjk(input.query) ? toTsquery(cjkSearchTokens(input.query)) : null;

    const matches = tsquery
      ? cjkQuery
        ? sql`(${schema.chunk.searchVector} @@ to_tsquery(${version.searchConfig}::regconfig, ${tsquery})
              or ${schema.chunk.searchVectorCjk} @@ to_tsquery('simple', ${cjkQuery}))`
        : sql`${schema.chunk.searchVector} @@ to_tsquery(${version.searchConfig}::regconfig, ${tsquery})`
      : null;
    const rank = tsquery
      ? cjkQuery
        ? sql`ts_rank(${schema.chunk.searchVector}, to_tsquery(${version.searchConfig}::regconfig, ${tsquery}))
              + ts_rank(${schema.chunk.searchVectorCjk}, to_tsquery('simple', ${cjkQuery}))`
        : sql`ts_rank(${schema.chunk.searchVector}, to_tsquery(${version.searchConfig}::regconfig, ${tsquery}))`
      : null;

    const keyword =
      matches && rank
        ? await database
            .select({
              id: schema.chunk.id,
              body: schema.chunk.body,
              tokens: schema.chunk.tokens,
              citation: schema.chunk.citation,
            })
            .from(schema.chunk)
            .where(and(scopedTo(library.id, version.id), matches))
            .orderBy(desc(rank))
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

    let ordered = [...fused.values()].sort((a, b) => b.score - a.score);

    /*
     * §9.2 rerank, over the fused head only. A failure keeps fusion order:
     * rerank refines an already-correct list, so it is never worth an error
     * or a retry -- the adapter carries a tight timeout for the same reason.
     */
    if (dependencies.configured().rerank && ordered.length > 1) {
      const head = ordered.slice(0, RERANK_WINDOW);
      try {
        const scores = await dependencies
          .rerank()
          .rerank(input.query, head.map((entry) => entry.row.body.slice(0, RERANK_DOCUMENT_CHARS)));
        if (scores.length === head.length) {
          const reranked = head
            .map((entry, at) => ({ ...entry, score: scores[at]! }))
            .sort((a, b) => b.score - a.score);
          ordered = [...reranked, ...ordered.slice(RERANK_WINDOW)];
        }
      } catch {
        /* fusion order stands */
      }
    }

    const seenBodies = new Set<string>();
    const chunks: ChunkResult[] = [];
    let budget = input.maxTokens;

    for (const { score, row } of ordered) {
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

    /* Stored under the library's tag so a safety suspension can revoke every
       entry at once (9.4); best-effort, and never on the request's account. */
    if (cacheKey) {
      cacheSetTagged(dependencies.cache(), {
        key: cacheKey,
        value: JSON.stringify({ chunks }),
        ttlSeconds: CACHE_TTL_SECONDS,
        tag: `ctxtag:${library.id}`,
      }).catch(() => {});
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
