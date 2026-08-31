/**
 * Library-level discovery: route a question to candidate libraries.
 * architecture.md 9.6.
 *
 * The display name is not the search key -- on a platform of user-uploaded
 * libraries it usually says nothing about the content ("昆虫大全" holds the
 * rove-beetle article). Recall therefore runs over the content-derived profile
 * (`library_profile`, written by the build's `profile` step), through up to
 * three paths that are fused by reciprocal rank:
 *
 *   1. profile FTS  -- the query's tokens against the pre-segmented profile
 *                      index (`simple` config; segmentation happened at build
 *                      and query time in the domain tokenizer, so CJK works);
 *   2. profile ANN  -- the query embedding against the centroid vectors, when
 *                      an embedding provider is configured. Semantic fallback
 *                      for synonyms and paraphrase;
 *   3. name hint    -- optional `libraryName`, for Context7-style callers.
 *
 * Ranking folds in Trust/Benchmark deliberately (architecture.md 9.6: routing
 * over content invites entity-stuffing, and quality scores are the counter),
 * and every candidate carries evidence -- which titles and terms matched -- so
 * the calling agent can decide in one round without trusting the name.
 *
 * What is NOT here yet, by design: the rare-term global GIN path (needs the
 * corpus word-frequency table) and the scatter-gather confirmation stage,
 * which belongs to query-docs. The workspace Policy Evaluator hook lands here
 * when policies are implemented (architecture.md 10.2: Library Search applies
 * Policy at the metadata stage).
 */
import { and, desc, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { CallerContext } from './index';
import type { LibraryCandidate, ResolveLibraryInput, ResolveLibraryOutput } from '@/contracts/schemas';
import { searchTokens } from '@/lib/domain/profile';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import {
  embeddingAdapter,
  isEmbeddingConfigured,
  type EmbeddingAdapter,
} from '@/lib/infrastructure/ai/providers';

export interface ResolveDependencies {
  embeddings(): EmbeddingAdapter;
  configured(): { embeddings: boolean };
}

const defaultDependencies: ResolveDependencies = {
  embeddings: embeddingAdapter,
  configured: () => ({ embeddings: isEmbeddingConfigured() }),
};

/** Per-path recall width; the fusion sees at most this many per path. */
const RECALL_LIMIT = 24;
/** Candidates returned to the caller. */
const RESULT_LIMIT = 10;
/** Standard reciprocal-rank-fusion constant. */
const RRF_K = 60;
/**
 * How much a perfect quality score (Trust + Benchmark = 200) adds. Sized to a
 * fraction of one top rank step (1 / (RRF_K + 1)), so quality reorders
 * near-ties but a stuffed library cannot out-rank a genuine content match.
 */
const QUALITY_WEIGHT = 0.008;

const EVIDENCE_TERMS = 8;
const EVIDENCE_TITLES = 5;

export async function resolveLibrary(
  caller: CallerContext,
  input: ResolveLibraryInput,
  dependencies: ResolveDependencies = defaultDependencies,
): Promise<ResolveLibraryOutput> {
  const database = db();
  const visible = visibleTo(caller);
  const tokens = searchTokens(input.query);

  /* ------------------------------------------------------- path 1: profile FTS */

  const tsquery = toTsquery(tokens);
  const keyword = tsquery
    ? await database
        .select({
          libraryId: schema.library.id,
          rank: sql<number>`ts_rank(${schema.libraryProfile.searchVector}, to_tsquery('simple', ${tsquery}))`,
        })
        .from(schema.library)
        .innerJoin(
          schema.libraryProfile,
          eq(schema.libraryProfile.versionId, schema.library.currentVersionId),
        )
        .where(
          and(
            visible,
            sql`${schema.libraryProfile.searchVector} @@ to_tsquery('simple', ${tsquery})`,
          ),
        )
        .orderBy(desc(sql`ts_rank(${schema.libraryProfile.searchVector}, to_tsquery('simple', ${tsquery}))`))
        .limit(RECALL_LIMIT)
    : [];

  /* ------------------------------------------------------- path 2: profile ANN */

  let semantic: { libraryId: string }[] = [];
  if (dependencies.configured().embeddings) {
    const [queryVector] = await dependencies.embeddings().embed([input.query]);
    if (queryVector) {
      const literal = `[${queryVector.join(',')}]`;
      semantic = await database
        .select({
          libraryId: schema.libraryProfileVector.libraryId,
          distance: sql<number>`min(${schema.libraryProfileVector.embedding} <=> ${literal}::vector)`,
        })
        .from(schema.libraryProfileVector)
        .innerJoin(
          schema.library,
          and(
            eq(schema.library.id, schema.libraryProfileVector.libraryId),
            /* Centroids of superseded versions must not route. */
            eq(schema.library.currentVersionId, schema.libraryProfileVector.versionId),
          ),
        )
        .where(visible)
        .groupBy(schema.libraryProfileVector.libraryId)
        .orderBy(sql`min(${schema.libraryProfileVector.embedding} <=> ${literal}::vector)`)
        .limit(RECALL_LIMIT);
    }
  }

  /* -------------------------------------------------------- path 3: name hint */

  const named = input.libraryName
    ? await database
        .select({ libraryId: schema.library.id })
        .from(schema.library)
        .where(
          and(
            visible,
            or(
              sql`${schema.library.title} ilike ${`%${escapeLike(input.libraryName)}%`}`,
              sql`${schema.library.publicId} ilike ${`%${escapeLike(input.libraryName)}%`}`,
            ),
          ),
        )
        .orderBy(schema.library.publicId)
        .limit(RECALL_LIMIT)
    : [];

  /* ------------------------------------------------------------------- fusion */

  const fused = new Map<string, number>();
  for (const list of [keyword, semantic, named]) {
    list.forEach((row, index) => {
      fused.set(row.libraryId, (fused.get(row.libraryId) ?? 0) + 1 / (RRF_K + index + 1));
    });
  }
  if (fused.size === 0) return { results: [], requestId: caller.requestId };

  const candidateIds = [...fused.keys()];

  const details = await database
    .select({
      libraryId: schema.library.id,
      publicId: schema.library.publicId,
      title: schema.library.title,
      description: schema.library.description,
      versionLabel: schema.libraryVersion.label,
      versionCreatedAt: schema.libraryVersion.createdAt,
      totalChunks: schema.libraryVersion.totalChunks,
      documentTitles: schema.libraryProfile.documentTitles,
      terms: schema.libraryProfile.terms,
    })
    .from(schema.library)
    .innerJoin(schema.libraryVersion, eq(schema.libraryVersion.id, schema.library.currentVersionId))
    .innerJoin(schema.libraryProfile, eq(schema.libraryProfile.versionId, schema.library.currentVersionId))
    .where(inArray(schema.library.id, candidateIds));

  const scores = await database
    .select({
      libraryId: schema.libraryScore.libraryId,
      trustScore: schema.libraryScore.trustScore,
      benchmarkScore: schema.libraryScore.benchmarkScore,
      computedAt: schema.libraryScore.computedAt,
    })
    .from(schema.libraryScore)
    .where(inArray(schema.libraryScore.libraryId, candidateIds))
    .orderBy(desc(schema.libraryScore.computedAt));

  const newestScore = new Map<string, { trust: number; benchmark: number }>();
  for (const row of scores) {
    if (!newestScore.has(row.libraryId)) {
      newestScore.set(row.libraryId, { trust: row.trustScore, benchmark: row.benchmarkScore });
    }
  }

  const tokenSet = new Set(tokens);
  const ranked = details
    .map((row) => {
      const quality = newestScore.get(row.libraryId) ?? { trust: 0, benchmark: 0 };
      return {
        row,
        quality,
        score:
          (fused.get(row.libraryId) ?? 0) +
          ((quality.trust + quality.benchmark) / 200) * QUALITY_WEIGHT,
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.row.publicId.localeCompare(b.row.publicId),
    )
    .slice(0, RESULT_LIMIT);

  const results: LibraryCandidate[] = ranked.map(({ row, quality }) => ({
    libraryId: row.publicId,
    title: row.title,
    description: row.description,
    version: row.versionLabel,
    trustScore: quality.trust,
    benchmarkScore: quality.benchmark,
    chunks: row.totalChunks,
    updatedAt: row.versionCreatedAt.toISOString(),
    evidence: {
      matchedTitles: row.documentTitles
        .filter((title) => searchTokens(title).some((token) => tokenSet.has(token)))
        .slice(0, EVIDENCE_TITLES),
      matchedTerms: row.terms.filter((term) => tokenSet.has(term)).slice(0, EVIDENCE_TERMS),
    },
  }));

  return { results, requestId: caller.requestId };
}

/**
 * architecture.md 5.2 and 9.6: an invisible private library and a nonexistent
 * one must be indistinguishable, so invisibility is a recall predicate, never
 * an application-layer filter over recalled rows.
 */
function visibleTo(caller: CallerContext): SQL {
  const routable = and(
    eq(schema.library.lifecycleStatus, 'published'),
    eq(schema.library.indexStatus, 'ready'),
    isNotNull(schema.library.currentVersionId),
  )!;
  if (!caller.workspaceId) return and(routable, eq(schema.library.visibility, 'public'))!;
  return and(
    routable,
    or(
      eq(schema.library.visibility, 'public'),
      eq(schema.library.ownerWorkspaceId, caller.workspaceId),
    ),
  )!;
}

/**
 * An OR-query over the segmented tokens. `plainto_tsquery` would AND them,
 * and a natural-language question rarely has every token in one profile --
 * or in one chunk (query-docs recalls with this too, through the version's
 * own configuration, which still stems each quoted token). Tokens are quoted
 * for `to_tsquery`, with quote characters stripped first.
 */
export function toTsquery(tokens: readonly string[]): string | null {
  const safe = tokens
    .map((token) => token.replace(/['\\]/g, ''))
    .filter((token) => token.length > 0)
    .map((token) => `'${token}'`);
  return safe.length > 0 ? safe.join(' | ') : null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
