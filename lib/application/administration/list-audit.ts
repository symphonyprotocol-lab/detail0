/**
 * Use case: the administrative audit log the console lists.
 *
 * Reads the real `audit_log` -- the same append-only, hash-chained table
 * `recordAudit` writes on every console action (architecture.md 14). Nothing
 * here filters rows out of the operator's view beyond the search and result
 * filter they asked for: a log that hides entries is not a log.
 *
 * Rows are ordered by `seq`, not `created_at`. Two entries can share a
 * timestamp to the microsecond, and a tie under `OFFSET` paging silently drops
 * or repeats a row across page boundaries; `seq` is the insertion order and is
 * unique, so a page is a page.
 */
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { likePattern } from './like-pattern';

export type AuditResultFilter = 'all' | 'success' | 'failure';

export interface ConsoleAuditRow {
  id: string;
  createdAt: Date;
  /** Null when the actor could not be identified, e.g. a failed sign-in. */
  administratorName: string | null;
  administratorEmail: string | null;
  action: string;
  targetId: string | null;
  /** A digest of the network origin; `audit_log` never holds the address. */
  originDigest: string | null;
  reason: string | null;
  result: string;
}

export interface AuditListInput {
  query?: string;
  result?: AuditResultFilter;
  limit?: number;
  offset?: number;
}

export interface AuditList {
  rows: ConsoleAuditRow[];
  total: number;
  /**
   * The hash of the newest entry -- the current head of the chain, and what a
   * daily anchor would commit to. Null while the log is empty.
   */
  chainHead: string | null;
}

export async function listAuditEntries(input: AuditListInput = {}): Promise<AuditList> {
  const database = db();
  const term = input.query?.trim();

  /*
   * Username as well as email: the administrator column shows the name, and a
   * search box under a name that cannot find that name is a bug the operator
   * reads as missing data.
   */
  const conditions = [
    term
      ? or(
          ilike(schema.administrator.email, likePattern(term)),
          ilike(schema.administrator.username, likePattern(term)),
          ilike(schema.auditLog.action, likePattern(term)),
          ilike(schema.auditLog.targetId, likePattern(term)),
        )
      : undefined,
    input.result && input.result !== 'all' ? eq(schema.auditLog.result, input.result) : undefined,
  ].filter(Boolean);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow], [headRow]] = await Promise.all([
    database
      .select({
        id: schema.auditLog.id,
        createdAt: schema.auditLog.createdAt,
        action: schema.auditLog.action,
        targetId: schema.auditLog.targetId,
        originDigest: schema.auditLog.ipDigest,
        reason: schema.auditLog.reason,
        result: schema.auditLog.result,
        administratorName: schema.administrator.username,
        administratorEmail: schema.administrator.email,
      })
      .from(schema.auditLog)
      .leftJoin(schema.administrator, eq(schema.administrator.id, schema.auditLog.administratorId))
      .where(where)
      .orderBy(desc(schema.auditLog.seq))
      .limit(input.limit ?? 50)
      .offset(input.offset ?? 0),
    database
      .select({ n: count() })
      .from(schema.auditLog)
      .leftJoin(schema.administrator, eq(schema.administrator.id, schema.auditLog.administratorId))
      .where(where),
    /*
     * The head is the newest row overall, never the newest row on this page: a
     * filtered view must not make the chain look like it ends somewhere else.
     */
    database
      .select({ hash: schema.auditLog.hash })
      .from(schema.auditLog)
      .orderBy(desc(schema.auditLog.seq))
      .limit(1),
  ]);

  return {
    total: totalRow?.n ?? 0,
    chainHead: headRow?.hash ?? null,
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      administratorName: row.administratorName ?? null,
      administratorEmail: row.administratorEmail ?? null,
      action: row.action,
      targetId: row.targetId,
      originDigest: row.originDigest,
      reason: row.reason,
      result: row.result,
    })),
  };
}
