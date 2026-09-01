/**
 * The public catalogue: what an anonymous visitor may browse. Only routable
 * libraries appear -- public, published, with a ready current version -- the
 * same predicate retrieval admits, so the directory never advertises what a
 * query would then refuse (architecture.md 5.2).
 */
import { and, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';

export interface CatalogEntry {
  publicId: string;
  title: string;
  domainTag: string | null;
  trustScore: number;
  totalChunks: number;
  updatedAt: string | null;
}

const ROUTABLE: SQL = and(
  eq(schema.library.visibility, 'public'),
  eq(schema.library.lifecycleStatus, 'published'),
  eq(schema.library.indexStatus, 'ready'),
  isNotNull(schema.library.currentVersionId),
)!;

export async function countPublicLibraries(): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.library)
    .where(ROUTABLE);
  return row?.n ?? 0;
}

export async function listPublicLibraries(input: {
  sort: 'popular' | 'recent';
  limit?: number;
}): Promise<CatalogEntry[]> {
  const database = db();
  const rows = await database
    .select({
      id: schema.library.id,
      publicId: schema.library.publicId,
      title: schema.library.title,
      domainTag: schema.library.domainTag,
      lastSuccessfulRefreshAt: schema.library.lastSuccessfulRefreshAt,
      createdAt: schema.library.createdAt,
      totalChunks: schema.libraryVersion.totalChunks,
      trustScore: sql<number>`coalesce((
        select s.trust_score from ${schema.libraryScore} s
        where s.library_id = ${schema.library.id}
        order by s.computed_at desc limit 1
      ), 0)`,
    })
    .from(schema.library)
    .innerJoin(schema.libraryVersion, eq(schema.libraryVersion.id, schema.library.currentVersionId))
    .where(ROUTABLE)
    .orderBy(
      ...(input.sort === 'recent'
        ? [desc(schema.library.lastSuccessfulRefreshAt)]
        : [
            desc(sql`coalesce((
              select s.trust_score from ${schema.libraryScore} s
              where s.library_id = ${schema.library.id}
              order by s.computed_at desc limit 1
            ), 0)`),
            desc(schema.library.createdAt),
          ]),
    )
    .limit(Math.min(input.limit ?? 50, 100));

  return rows.map((row) => ({
    publicId: row.publicId,
    title: row.title,
    domainTag: row.domainTag,
    trustScore: Number(row.trustScore),
    totalChunks: row.totalChunks,
    updatedAt: (row.lastSuccessfulRefreshAt ?? row.createdAt)?.toISOString() ?? null,
  }));
}

export interface PublicLibraryDetail {
  publicId: string;
  title: string;
  description: string | null;
  domainTag: string | null;
  language: string | null;
  claimedBy: string | null;
  storageBytes: number;
  version: {
    label: string;
    totalChunks: number;
    totalTokens: number;
    documents: number;
    parserVersion: string;
    chunkerVersion: string;
    embeddingModel: string;
    publishedAt: string | null;
  };
  trustScore: number;
  benchmarkScore: number;
  sources: { type: string; location: string }[];
  updatedAt: string | null;
}

export async function publicLibraryDetail(publicId: string): Promise<PublicLibraryDetail | null> {
  const database = db();
  const [row] = await database
    .select({
      id: schema.library.id,
      publicId: schema.library.publicId,
      title: schema.library.title,
      description: schema.library.description,
      domainTag: schema.library.domainTag,
      language: schema.library.language,
      ownerWorkspaceId: schema.library.ownerWorkspaceId,
      storageBytes: schema.library.storageBytes,
      lastSuccessfulRefreshAt: schema.library.lastSuccessfulRefreshAt,
      createdAt: schema.library.createdAt,
      versionId: schema.libraryVersion.id,
      label: schema.libraryVersion.label,
      totalChunks: schema.libraryVersion.totalChunks,
      totalTokens: schema.libraryVersion.totalTokens,
      parserVersion: schema.libraryVersion.parserVersion,
      chunkerVersion: schema.libraryVersion.chunkerVersion,
      embeddingModel: schema.libraryVersion.embeddingModel,
      publishedAt: schema.libraryVersion.publishedAt,
    })
    .from(schema.library)
    .innerJoin(schema.libraryVersion, eq(schema.libraryVersion.id, schema.library.currentVersionId))
    .where(and(ROUTABLE, eq(schema.library.publicId, publicId)));
  if (!row) return null;

  const [documents] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.document)
    .where(eq(schema.document.versionId, row.versionId));

  const [score] = await database
    .select({
      trustScore: schema.libraryScore.trustScore,
      benchmarkScore: schema.libraryScore.benchmarkScore,
    })
    .from(schema.libraryScore)
    .where(eq(schema.libraryScore.libraryId, row.id))
    .orderBy(desc(schema.libraryScore.computedAt))
    .limit(1);

  const sources = await database
    .select({ type: schema.source.type, location: schema.source.location })
    .from(schema.source)
    .where(eq(schema.source.libraryId, row.id))
    .orderBy(schema.source.id);

  let claimedBy: string | null = null;
  if (row.ownerWorkspaceId) {
    const [owner] = await database
      .select({ name: schema.workspace.name })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, row.ownerWorkspaceId));
    claimedBy = owner?.name ?? null;
  }

  return {
    publicId: row.publicId,
    title: row.title,
    description: row.description,
    domainTag: row.domainTag,
    language: row.language,
    claimedBy,
    storageBytes: row.storageBytes,
    version: {
      label: row.label,
      totalChunks: row.totalChunks,
      totalTokens: row.totalTokens,
      documents: documents?.n ?? 0,
      parserVersion: row.parserVersion,
      chunkerVersion: row.chunkerVersion,
      embeddingModel: row.embeddingModel,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    },
    trustScore: score?.trustScore ?? 0,
    benchmarkScore: score?.benchmarkScore ?? 0,
    sources,
    updatedAt: (row.lastSuccessfulRefreshAt ?? row.createdAt)?.toISOString() ?? null,
  };
}
