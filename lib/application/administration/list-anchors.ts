/**
 * Use case: what the anchor tables hold, for the console's anchoring view.
 *
 * The boundary architecture.md 14 draws is a property of these queries, not a
 * rule someone has to remember in the page: everything here reads
 * `anchor_batch` and `anchor_leaf` and stops there. No join to
 * `library_version`, `revenue_period` or any other subject table -- one join
 * walks `subject_id` straight past the visibility rules in requirement.md 6.4
 * and puts a private library's contents, or a publisher's settlement amount, on
 * an administrator's screen. Batch rows on their own leak nothing: the chain
 * publishes roots and batch metadata anyway.
 *
 * That is also why the backlog below counts leaves inside open batches rather
 * than published versions still waiting for one. The second number would be the
 * forbidden join, and until the anchor workflow exists there is nothing it
 * could count that this does not.
 */
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';

export type AnchorSubjectFilter = 'all' | 'version' | 'audit_head' | 'earning_statement';

export type AnchorStatusFilter =
  | 'all'
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'superseded';

/** A batch's non-terminal states: submitted but not yet known to have landed. */
const OPEN_STATUSES = ['pending', 'submitted'] as const;

/**
 * aptos-anchoring-proposal.md 4.8: 99% of published versions confirmed within
 * two hours. Measured per batch, from the close of its window to the moment the
 * transaction confirmed.
 */
export const ANCHOR_SLO_HOURS = 2;

export interface ConsoleAnchorBatchRow {
  id: string;
  subjectType: string;
  leafSchemaVersion: number;
  merkleRoot: string;
  leafCount: number;
  windowStart: Date;
  windowEnd: Date;
  network: string;
  txHash: string | null;
  status: string;
  attempts: number;
  confirmedAt: Date | null;
}

export interface AnchorStats {
  /** Batches by state, every state present even at zero. */
  byStatus: Record<string, number>;
  total: number;
  /** Leaves sitting in batches that have not confirmed -- the actual backlog. */
  openLeaves: number;
  confirmed: number;
  /** Of those, how many landed inside the SLO window. */
  withinSlo: number;
  lastConfirmedAt: Date | null;
}

export interface AnchorListInput {
  subject?: AnchorSubjectFilter;
  status?: AnchorStatusFilter;
  limit?: number;
  offset?: number;
}

export interface AnchorList {
  rows: ConsoleAnchorBatchRow[];
  total: number;
  stats: AnchorStats;
}

const BATCH_ROW = {
  id: schema.anchorBatch.id,
  subjectType: schema.anchorBatch.subjectType,
  leafSchemaVersion: schema.anchorBatch.leafSchemaVersion,
  merkleRoot: schema.anchorBatch.merkleRoot,
  leafCount: schema.anchorBatch.leafCount,
  windowStart: schema.anchorBatch.windowStart,
  windowEnd: schema.anchorBatch.windowEnd,
  network: schema.anchorBatch.network,
  txHash: schema.anchorBatch.txHash,
  status: schema.anchorBatch.status,
  attempts: schema.anchorBatch.attempts,
  confirmedAt: schema.anchorBatch.confirmedAt,
};

export const ANCHOR_BATCH_STATUSES = [
  'pending',
  'submitted',
  'confirmed',
  'failed',
  'superseded',
] as const;

export async function listAnchorBatches(input: AnchorListInput = {}): Promise<AnchorList> {
  const database = db();

  const conditions = [
    input.subject && input.subject !== 'all'
      ? eq(schema.anchorBatch.subjectType, input.subject)
      : undefined,
    input.status && input.status !== 'all'
      ? eq(schema.anchorBatch.status, input.status)
      : undefined,
  ].filter(Boolean);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow], statusRows, [openRow], [sloRow], [lastRow]] = await Promise.all([
    database
      .select(BATCH_ROW)
      .from(schema.anchorBatch)
      .where(where)
      /*
       * By window, not by confirmation: a batch that never confirmed has no
       * confirmation time, and ordering on it would drop exactly the rows an
       * operator opened this screen to find.
       */
      .orderBy(desc(schema.anchorBatch.windowEnd))
      .limit(input.limit ?? 50)
      .offset(input.offset ?? 0),
    database.select({ n: count() }).from(schema.anchorBatch).where(where),
    /* The stats describe the whole table, never the filtered page. */
    database
      .select({ status: schema.anchorBatch.status, n: count() })
      .from(schema.anchorBatch)
      .groupBy(schema.anchorBatch.status),
    database
      .select({ leaves: sql<string | null>`sum(${schema.anchorBatch.leafCount})` })
      .from(schema.anchorBatch)
      .where(inArray(schema.anchorBatch.status, [...OPEN_STATUSES])),
    database
      .select({
        confirmed: count(),
        within: sql<string>`count(*) filter (
          where ${schema.anchorBatch.confirmedAt}
                <= ${schema.anchorBatch.windowEnd} + interval '${sql.raw(String(ANCHOR_SLO_HOURS))} hours'
        )`,
      })
      .from(schema.anchorBatch)
      .where(eq(schema.anchorBatch.status, 'confirmed')),
    database
      .select({ at: schema.anchorBatch.confirmedAt })
      .from(schema.anchorBatch)
      .where(eq(schema.anchorBatch.status, 'confirmed'))
      .orderBy(desc(schema.anchorBatch.confirmedAt))
      .limit(1),
  ]);

  const byStatus: Record<string, number> = Object.fromEntries(
    ANCHOR_BATCH_STATUSES.map((status) => [status, 0]),
  );
  for (const row of statusRows) byStatus[row.status] = row.n;

  return {
    rows,
    total: totalRow?.n ?? 0,
    stats: {
      byStatus,
      total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
      openLeaves: Number(openRow?.leaves ?? 0),
      confirmed: sloRow?.confirmed ?? 0,
      withinSlo: Number(sloRow?.within ?? 0),
      lastConfirmedAt: lastRow?.at ?? null,
    },
  };
}
