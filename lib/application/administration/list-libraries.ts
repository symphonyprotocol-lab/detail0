/**
 * Use cases: user libraries and their review queue, and ownership claims.
 *
 * Both read `library`; what separates them is the join to `library_claim`.
 * Ingestion is not built yet (architecture.md 21), so these lists are
 * legitimately empty rather than seeded with something that looks like content.
 */
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { ref } from './column-ref';
import { likePattern } from './like-pattern';

export type LibraryReviewFilter = 'all' | 'pending' | 'approved' | 'rejected';

export interface ConsoleLibraryRow {
  id: string;
  publicId: string;
  title: string;
  ownerName: string | null;
  sourceType: string | null;
  storageBytes: number;
  visibility: 'public' | 'private';
  lifecycleStatus: string;
  createdAt: Date;
}

/** The one source a library was built from, when it has exactly one. */
const sourceType = sql<string | null>`(
  select ${ref(schema.source.type)} from ${schema.source}
  where ${ref(schema.source.libraryId)} = ${ref(schema.library.id)}
  order by ${ref(schema.source.id)} limit 1
)`;

const ownerName = sql<string | null>`(
  select ${ref(schema.workspace.name)} from ${schema.workspace}
  where ${ref(schema.workspace.id)} = ${ref(schema.library.ownerWorkspaceId)}
)`;

/**
 * The design's review tabs against the lifecycle enum. There is no single
 * `rejected` state: requirement.md 5.3 gives a reviewer approve, reject and
 * request-changes, and the schema spells the last two as `changes_requested`
 * and `suspended`, with `archived` for a library taken out of circulation.
 */
const REVIEW_STATUSES = {
  pending: ['submitted', 'reviewing'],
  approved: ['published'],
  rejected: ['changes_requested', 'suspended', 'archived'],
} as const;

function reviewCondition(filter: LibraryReviewFilter) {
  /*
   * The filter arrives as a cast, not a parse -- the export route hands
   * whatever `?status=` said straight through -- so an unknown value must fall
   * back to `all` rather than spreading `undefined` into a 500.
   */
  switch (filter) {
    case 'pending':
    case 'approved':
    case 'rejected':
      return inArray(schema.library.lifecycleStatus, [...REVIEW_STATUSES[filter]]);
    default:
      return undefined;
  }
}

export async function listUserLibraries(input: {
  query?: string;
  review?: LibraryReviewFilter;
  limit?: number;
} = {}): Promise<{ rows: ConsoleLibraryRow[]; total: number; counts: Record<string, number> }> {
  const database = db();
  const term = input.query?.trim();

  /* User libraries that still exist; a deleted one is a tombstone (8.4). */
  const base = and(eq(schema.library.isPlatformLibrary, false), isNull(schema.library.deletedAt))!;
  const conditions = [
    base,
    term
      ? or(ilike(schema.library.title, likePattern(term)), ilike(schema.library.publicId, likePattern(term)))
      : undefined,
    reviewCondition(input.review ?? 'all'),
  ].filter(Boolean);

  const [rows, [totalRow], statusRows, [claimRow]] = await Promise.all([
    database
      .select({
        id: schema.library.id,
        publicId: schema.library.publicId,
        title: schema.library.title,
        storageBytes: schema.library.storageBytes,
        visibility: schema.library.visibility,
        lifecycleStatus: schema.library.lifecycleStatus,
        createdAt: schema.library.createdAt,
        ownerName,
        sourceType,
      })
      .from(schema.library)
      .where(and(...conditions))
      .orderBy(desc(schema.library.createdAt))
      .limit(input.limit ?? 50),
    database.select({ n: count() }).from(schema.library).where(and(...conditions)),
    database
      .select({ status: schema.library.lifecycleStatus, n: count() })
      .from(schema.library)
      .where(base)
      .groupBy(schema.library.lifecycleStatus),
    database
      .select({ n: count() })
      .from(schema.libraryClaim)
      .where(eq(schema.libraryClaim.status, 'pending')),
  ]);

  const byStatus = new Map<string, number>(statusRows.map((row) => [row.status, row.n]));
  const sum = (statuses: readonly string[]) =>
    statuses.reduce((total, status) => total + (byStatus.get(status) ?? 0), 0);

  return {
    rows: rows.map(normalize),
    total: totalRow?.n ?? 0,
    counts: {
      all: [...byStatus.values()].reduce((a, b) => a + b, 0),
      pending: sum(REVIEW_STATUSES.pending),
      approved: sum(REVIEW_STATUSES.approved),
      rejected: sum(REVIEW_STATUSES.rejected),
      claims: claimRow?.n ?? 0,
    },
  };
}

export type ClaimFilter = 'all' | 'pending' | 'claimed' | 'revoked' | 'disputed' | 'expired';

/**
 * `claim_status` has no `disputed` value, and should not: requirement.md 7.3
 * defines a dispute as a claim opened on a library that already has an owner,
 * which is a fact about the pair rather than a state of the claim. It is
 * derived here so the tab means what the rule says.
 */
const DISPUTED = sql`${schema.libraryClaim.status} = 'pending' and ${schema.library.ownerWorkspaceId} is not null`;

export interface ConsoleClaimRow {
  id: string;
  libraryTitle: string;
  libraryPublicId: string;
  claimantName: string;
  method: string;
  openedAt: Date;
  currentOwner: string | null;
  status: string;
}

export async function listClaims(input: { query?: string; status?: ClaimFilter; limit?: number } = {}): Promise<{
  rows: ConsoleClaimRow[];
  total: number;
  counts: Record<string, number>;
}> {
  const database = db();
  const term = input.query?.trim();

  const statusCondition = claimCondition(input.status ?? 'all');
  const conditions = [
    /* A claim on a deleted library is moot; the queue does not show it. */
    isNull(schema.library.deletedAt),
    statusCondition,
    term
      ? or(ilike(schema.library.title, likePattern(term)), ilike(schema.library.publicId, likePattern(term)))
      : undefined,
  ].filter(Boolean);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const claimant = sql<string>`(
    select ${ref(schema.workspace.name)} from ${schema.workspace}
    where ${ref(schema.workspace.id)} = ${ref(schema.libraryClaim.claimantWorkspaceId)}
  )`;

  const [rows, [totalRow], statusRows, [disputedRow]] = await Promise.all([
    database
      .select({
        id: schema.libraryClaim.id,
        libraryTitle: schema.library.title,
        libraryPublicId: schema.library.publicId,
        method: schema.libraryClaim.method,
        status: schema.libraryClaim.status,
        openedAt: schema.libraryClaim.createdAt,
        currentOwner: ownerName,
        claimantName: claimant,
      })
      .from(schema.libraryClaim)
      .innerJoin(schema.library, eq(schema.library.id, schema.libraryClaim.libraryId))
      .where(where)
      .orderBy(desc(schema.libraryClaim.createdAt))
      .limit(input.limit ?? 50),
    database
      .select({ n: count() })
      .from(schema.libraryClaim)
      .innerJoin(schema.library, eq(schema.library.id, schema.libraryClaim.libraryId))
      .where(where),
    database
      .select({ status: schema.libraryClaim.status, n: count() })
      .from(schema.libraryClaim)
      .groupBy(schema.libraryClaim.status),
    database
      .select({ n: count() })
      .from(schema.libraryClaim)
      .innerJoin(schema.library, eq(schema.library.id, schema.libraryClaim.libraryId))
      .where(DISPUTED),
  ]);

  const byStatus = new Map<string, number>(statusRows.map((row) => [row.status, row.n]));
  return {
    rows: rows.map((row) => ({
      ...row,
      claimantName: row.claimantName ?? '',
      currentOwner: row.currentOwner,
    })),
    total: totalRow?.n ?? 0,
    counts: {
      all: [...byStatus.values()].reduce((a, b) => a + b, 0),
      pending: byStatus.get('pending') ?? 0,
      claimed: byStatus.get('verified') ?? 0,
      revoked: byStatus.get('revoked') ?? 0,
      expired: byStatus.get('expired') ?? 0,
      disputed: disputedRow?.n ?? 0,
    },
  };
}

function claimCondition(filter: ClaimFilter) {
  switch (filter) {
    case 'pending':
      return eq(schema.libraryClaim.status, 'pending');
    case 'claimed':
      return eq(schema.libraryClaim.status, 'verified');
    case 'revoked':
      return eq(schema.libraryClaim.status, 'revoked');
    case 'expired':
      return eq(schema.libraryClaim.status, 'expired');
    case 'disputed':
      return DISPUTED;
    default:
      return undefined;
  }
}

function normalize(row: {
  id: string;
  publicId: string;
  title: string;
  storageBytes: number;
  visibility: 'public' | 'private';
  lifecycleStatus: string;
  createdAt: Date;
  ownerName: string | null;
  sourceType: string | null;
}): ConsoleLibraryRow {
  return {
    id: row.id,
    publicId: row.publicId,
    title: row.title,
    ownerName: row.ownerName,
    sourceType: row.sourceType,
    storageBytes: row.storageBytes,
    visibility: row.visibility,
    lifecycleStatus: row.lifecycleStatus,
    createdAt: row.createdAt,
  };
}
