/**
 * What a workspace reads about its own consumption. architecture.md 6.3 and
 * 11.1: `usage_summary` is derived and rebuildable from usage events -- the
 * dashboard never trusts a browser-side count -- and `request_log` is the
 * user-facing summary of each request, without the query text (17.1).
 *
 * The summary rebuild is idempotent by construction: it recomputes a window
 * of daily buckets from the events and replaces exactly that window. Reads
 * rebuild before returning, so the figures are always the events' figures --
 * the table is a materialisation, not a second source of truth.
 */
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { uuidv7 } from '@/lib/domain/id';
import { db, schema } from '@/lib/infrastructure/postgres/client';

/** Daily buckets kept per workspace. */
const SUMMARY_WINDOW_DAYS = 90;
const REQUEST_PAGE_LIMIT = 50;

export interface UsageBucket {
  date: string; // YYYY-MM-DD, UTC
  calls: number;
}

export interface UsageOverview {
  buckets: UsageBucket[];
  periodStart: string;
  periodEnd: string;
  callsThisPeriod: number;
  returnedTokensThisPeriod: number;
  planAllowance: number;
  addonBalanceRemaining: number;
}

/** Rebuild the workspace's daily buckets from its usage events. */
export async function rebuildUsageSummary(workspaceId: string): Promise<void> {
  const database = db();
  const windowStart = new Date(Date.now() - SUMMARY_WINDOW_DAYS * 86_400_000);
  windowStart.setUTCHours(0, 0, 0, 0);

  const counted = await database
    .select({
      day: sql<string>`to_char(date_trunc('day', ${schema.usageEvent.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.usageEvent)
    .where(
      and(
        eq(schema.usageEvent.workspaceId, workspaceId),
        gte(schema.usageEvent.createdAt, windowStart),
      ),
    )
    .groupBy(sql`1`);

  await database.transaction(async (tx) => {
    await tx
      .delete(schema.usageSummary)
      .where(
        and(
          eq(schema.usageSummary.workspaceId, workspaceId),
          gte(schema.usageSummary.bucketDate, windowStart),
        ),
      );
    if (counted.length > 0) {
      await tx.insert(schema.usageSummary).values(
        counted.map((bucket) => ({
          id: uuidv7(),
          workspaceId,
          periodStart: windowStart,
          bucketDate: new Date(`${bucket.day}T00:00:00Z`),
          calls: bucket.calls,
        })),
      );
    }
  });
}

/** The dashboard's numbers: rebuilt from events, then read. */
export async function usageOverview(workspaceId: string): Promise<UsageOverview> {
  await rebuildUsageSummary(workspaceId);
  const database = db();

  const buckets = await database
    .select({ bucketDate: schema.usageSummary.bucketDate, calls: schema.usageSummary.calls })
    .from(schema.usageSummary)
    .where(eq(schema.usageSummary.workspaceId, workspaceId))
    .orderBy(schema.usageSummary.bucketDate);

  const { allowance, periodStart, periodEnd } = await currentWindow(workspaceId);
  const [inPeriod] = await database
    .select({
      n: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${schema.usageEvent.returnedTokens}), 0)::bigint`,
    })
    .from(schema.usageEvent)
    .where(
      and(
        eq(schema.usageEvent.workspaceId, workspaceId),
        gte(schema.usageEvent.createdAt, periodStart),
        lt(schema.usageEvent.createdAt, periodEnd),
      ),
    );
  const [addon] = await database
    .select({
      remaining: sql<number>`coalesce(sum(${schema.addonGrant.callsGranted} - ${schema.addonGrant.callsConsumed}), 0)::int`,
    })
    .from(schema.addonGrant)
    .where(eq(schema.addonGrant.workspaceId, workspaceId));

  return {
    buckets: buckets.map((bucket) => ({
      date: bucket.bucketDate.toISOString().slice(0, 10),
      calls: bucket.calls,
    })),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    callsThisPeriod: inPeriod?.n ?? 0,
    returnedTokensThisPeriod: Number(inPeriod?.tokens ?? 0),
    planAllowance: allowance,
    addonBalanceRemaining: addon?.remaining ?? 0,
  };
}

/**
 * The same window logic reserveCall uses, read-only: active subscription
 * period and its plan's allowance, or the newest Free version over a UTC
 * calendar month.
 */
async function currentWindow(
  workspaceId: string,
): Promise<{ allowance: number; periodStart: Date; periodEnd: Date }> {
  const database = db();
  const [active] = await database
    .select({
      planVersionId: schema.subscription.planVersionId,
      periodStart: schema.subscription.periodStart,
      periodEnd: schema.subscription.periodEnd,
    })
    .from(schema.subscription)
    .where(
      and(
        eq(schema.subscription.workspaceId, workspaceId),
        eq(schema.subscription.status, 'active'),
        sql`${schema.subscription.periodStart} <= now()`,
        sql`${schema.subscription.periodEnd} >= now()`,
      ),
    )
    .orderBy(desc(schema.subscription.periodEnd))
    .limit(1);

  if (active) {
    const [version] = await database
      .select({ monthlyCalls: schema.planVersion.monthlyCalls })
      .from(schema.planVersion)
      .where(eq(schema.planVersion.id, active.planVersionId));
    return {
      allowance: version?.monthlyCalls ?? 0,
      periodStart: active.periodStart,
      periodEnd: active.periodEnd,
    };
  }

  const [free] = await database
    .select({ monthlyCalls: schema.planVersion.monthlyCalls })
    .from(schema.planVersion)
    .where(eq(schema.planVersion.planId, 'free'))
    .orderBy(desc(schema.planVersion.createdAt))
    .limit(1);
  const now = new Date();
  return {
    allowance: free?.monthlyCalls ?? 0,
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

/* --------------------------------------------------------- request log */

/**
 * Best-effort by contract: the log is a summary for the user's screen, and
 * failing a served request over its own diary entry would invert priorities.
 * Callers fire and forget.
 */
export async function recordRequestLog(entry: {
  workspaceId: string | null;
  requestId: string;
  operation: string;
  libraryPublicId: string | null;
  entrypoint: string | null;
  statusCode: number;
  latencyMs: number | null;
}): Promise<void> {
  await db()
    .insert(schema.requestLog)
    .values({ id: uuidv7(), ...entry });
}

export interface RequestLogRow {
  requestId: string;
  operation: string;
  libraryPublicId: string | null;
  entrypoint: string | null;
  statusCode: number;
  latencyMs: number | null;
  createdAt: string;
}

/** A workspace reads its own log and nothing else -- anonymous has no log view. */
export async function listRequests(
  workspaceId: string,
  limit = REQUEST_PAGE_LIMIT,
): Promise<RequestLogRow[]> {
  const rows = await db()
    .select()
    .from(schema.requestLog)
    .where(eq(schema.requestLog.workspaceId, workspaceId))
    .orderBy(desc(schema.requestLog.createdAt))
    .limit(Math.min(limit, REQUEST_PAGE_LIMIT));

  return rows.map((row) => ({
    requestId: row.requestId,
    operation: row.operation,
    libraryPublicId: row.libraryPublicId,
    entrypoint: row.entrypoint,
    statusCode: row.statusCode,
    latencyMs: row.latencyMs,
    createdAt: row.createdAt.toISOString(),
  }));
}
