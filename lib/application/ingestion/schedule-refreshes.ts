/**
 * The scheduler side of the refresh queue: refresh policies turned into rows.
 *
 * A source carries a cadence (`daily`, `weekly`, `manual`; lib/domain/library
 * `RefreshPolicy`). Until now only the operator's button produced a refresh
 * operation, so the cadence was a label. This reads every platform source, works
 * out when each is next due, and queues a refresh for the ones whose time has
 * come. The scheduled drain (`/api/cron/drain`) calls it before draining, so a
 * source is checked within one drain interval of falling due.
 *
 * "Last checked" is per source, although the library row only records it per
 * library: the finished refresh operations say which source they fetched
 * (`source_id`, null for all of them), and the newest one that covered a source
 * is when that source was last looked at. The library's own `last_checked_at`
 * is the floor, for builds older than per-source operations.
 *
 * Platform libraries only. architecture.md 8.4: a private library defaults to
 * manual refresh, and a workspace's sources are refreshed from the dashboard or
 * by webhook, never on a timer we run.
 */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { uuidv7 } from '@/lib/domain/id';
import { isRefreshPolicy, refreshDueAt, type RefreshPolicy } from '@/lib/domain/library';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { currentBuildBillingMode, lastChargedCalls, quoteBuild } from '@/lib/application/plans/build-quota';

/** Operation types that fetch a library's sources. */
const FETCHING_OPERATIONS = ['refresh', 'ingest'] as const;
const OPEN_STATES = ['pending', 'running'] as const;
const FINISHED_STATES = ['succeeded', 'skipped', 'failed'] as const;

export interface ScheduledSource {
  libraryId: string;
  publicId: string;
  title: string;
  lifecycleStatus: string;
  sourceId: string;
  sourceType: string;
  location: string;
  policy: RefreshPolicy | 'unknown';
  /** When this source was last fetched or found unchanged; null if never. */
  lastCheckedAt: Date | null;
  /** Next time the policy asks for a check; null for a manual source. */
  dueAt: Date | null;
  /** A refresh covering this source is already queued or running. */
  open: boolean;
}

/**
 * Every platform source and where it stands against its policy, due first.
 *
 * Archived libraries are left out: `requestPlatformLibraryRefresh` refuses
 * them, and the scheduler should not do by timer what the button may not.
 */
export async function refreshSchedule(now: Date = new Date()): Promise<ScheduledSource[]> {
  const database = db();

  const sources = await database
    .select({
      libraryId: schema.library.id,
      publicId: schema.library.publicId,
      title: schema.library.title,
      lifecycleStatus: schema.library.lifecycleStatus,
      libraryCheckedAt: schema.library.lastCheckedAt,
      sourceId: schema.source.id,
      sourceType: schema.source.type,
      location: schema.source.location,
      refreshPolicy: schema.source.refreshPolicy,
    })
    .from(schema.source)
    .innerJoin(schema.library, eq(schema.library.id, schema.source.libraryId))
    .where(
      and(
        eq(schema.library.isPlatformLibrary, true),
        isNull(schema.library.deletedAt),
        ne(schema.library.lifecycleStatus, 'archived'),
      ),
    )
    .orderBy(schema.library.publicId, schema.source.id);

  if (sources.length === 0) return [];
  const libraryIds = [...new Set(sources.map((row) => row.libraryId))];

  /*
   * The newest finished operation per (library, source) and every open one.
   * `distinct on` keeps this one row per pair however long the history is.
   */
  const [finished, open] = await Promise.all([
    database
      .selectDistinctOn([schema.workflowOperation.libraryId, schema.workflowOperation.sourceId], {
        libraryId: schema.workflowOperation.libraryId,
        sourceId: schema.workflowOperation.sourceId,
        updatedAt: schema.workflowOperation.updatedAt,
      })
      .from(schema.workflowOperation)
      .where(
        and(
          inArray(schema.workflowOperation.libraryId, libraryIds),
          inArray(schema.workflowOperation.operationType, [...FETCHING_OPERATIONS]),
          inArray(schema.workflowOperation.status, [...FINISHED_STATES]),
        ),
      )
      .orderBy(
        schema.workflowOperation.libraryId,
        schema.workflowOperation.sourceId,
        sql`${schema.workflowOperation.updatedAt} desc`,
      ),
    database
      .select({
        libraryId: schema.workflowOperation.libraryId,
        sourceId: schema.workflowOperation.sourceId,
      })
      .from(schema.workflowOperation)
      .where(
        and(
          inArray(schema.workflowOperation.libraryId, libraryIds),
          inArray(schema.workflowOperation.operationType, [...FETCHING_OPERATIONS]),
          inArray(schema.workflowOperation.status, [...OPEN_STATES]),
        ),
      ),
  ]);

  const checkedAt = new Map<string, Date>();
  for (const row of finished) checkedAt.set(`${row.libraryId}/${row.sourceId ?? '*'}`, row.updatedAt);
  const openKeys = new Set(open.map((row) => `${row.libraryId}/${row.sourceId ?? '*'}`));

  const rows = sources.map((row): ScheduledSource => {
    const policy = readPolicy(row.refreshPolicy);
    const lastCheckedAt = latest(
      row.libraryCheckedAt,
      checkedAt.get(`${row.libraryId}/*`) ?? null,
      checkedAt.get(`${row.libraryId}/${row.sourceId}`) ?? null,
    );
    return {
      libraryId: row.libraryId,
      publicId: row.publicId,
      title: row.title,
      lifecycleStatus: row.lifecycleStatus,
      sourceId: row.sourceId,
      sourceType: row.sourceType,
      location: row.location,
      policy,
      lastCheckedAt,
      dueAt: refreshDueAt(policy, lastCheckedAt),
      open: openKeys.has(`${row.libraryId}/*`) || openKeys.has(`${row.libraryId}/${row.sourceId}`),
    };
  });

  /* Due first, soonest first; manual sources last, in list order. */
  return rows.sort((a, b) => {
    if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });
}

export interface ScheduledRefresh {
  operationId: string;
  libraryId: string;
  publicId: string;
  /** Null when the whole library was queued. */
  sourceId: string | null;
}

/**
 * Queues a refresh for every source that is due and not already covered.
 *
 * One row per library when all of its sources are due, so the build fetches
 * them together and publishes one version; otherwise one row per due source,
 * and the build carries the others forward. Nothing is written to the audit
 * log -- there is no administrator behind it -- which is what the row's
 * `trigger` column is for.
 */
export async function scheduleDueRefreshes(now: Date = new Date()): Promise<ScheduledRefresh[]> {
  const schedule = await refreshSchedule(now);
  const byLibrary = new Map<string, ScheduledSource[]>();
  for (const row of schedule) {
    const list = byLibrary.get(row.libraryId) ?? [];
    list.push(row);
    byLibrary.set(row.libraryId, list);
  }

  const queued: ScheduledRefresh[] = [];
  const database = db();
  const gate = await refreshGate([...byLibrary.keys()]);
  for (const [libraryId, rows] of byLibrary) {
    const due = rows.filter((row) => row.dueAt !== null && row.dueAt <= now && !row.open);
    const first = due[0];
    if (!first) continue;
    /*
     * library-build-billing.md 7: a scheduled refresh the owner's balance
     * cannot cover is skipped, not queued into a failure. Nothing is written;
     * the next tick asks again, so a top-up or a new period resumes it.
     */
    if (!gate.affordable(libraryId)) {
      console.error(`refresh of ${first.publicId} skipped: build quota exhausted`);
      continue;
    }
    const targets = due.length === rows.length ? [null] : due.map((row) => row.sourceId);
    for (const sourceId of targets) {
      const operationId = uuidv7();
      await database.insert(schema.workflowOperation).values({
        id: operationId,
        libraryId,
        operationType: 'refresh',
        sourceDigest: null,
        sourceId,
        status: 'pending',
        trigger: 'scheduled',
      });
      queued.push({ operationId, libraryId, publicId: first.publicId, sourceId });
    }
  }
  return queued;
}

/**
 * Which owned libraries can afford their next refresh. The estimate is the
 * last priced build of the same library, or the base fee when it was never
 * priced; platform libraries and shadow mode always pass.
 */
async function refreshGate(libraryIds: string[]): Promise<{ affordable(libraryId: string): boolean }> {
  if (libraryIds.length === 0 || currentBuildBillingMode() !== 'enforce') {
    return { affordable: () => true };
  }
  const owners = await db()
    .select({
      id: schema.library.id,
      ownerWorkspaceId: schema.library.ownerWorkspaceId,
      isPlatformLibrary: schema.library.isPlatformLibrary,
    })
    .from(schema.library)
    .where(inArray(schema.library.id, libraryIds));
  const charged = await lastChargedCalls(libraryIds);
  const verdict = new Map<string, boolean>();
  const quotes = new Map<string, { planAllowanceRemaining: number; addonBalanceRemaining: number; rates: { baseCalls: number } }>();
  for (const library of owners) {
    if (library.isPlatformLibrary || !library.ownerWorkspaceId) {
      verdict.set(library.id, true);
      continue;
    }
    let quote = quotes.get(library.ownerWorkspaceId);
    if (!quote) {
      quote = await quoteBuild({ workspaceId: library.ownerWorkspaceId, fetchesPages: false });
      quotes.set(library.ownerWorkspaceId, quote);
    }
    const estimate = Math.max(quote.rates.baseCalls, charged.get(library.id) ?? 0);
    verdict.set(library.id, quote.planAllowanceRemaining + quote.addonBalanceRemaining >= estimate);
  }
  return { affordable: (libraryId) => verdict.get(libraryId) ?? true };
}

function readPolicy(stored: Record<string, unknown> | null): RefreshPolicy | 'unknown' {
  const value = stored?.cadence;
  return isRefreshPolicy(value) ? value : 'unknown';
}

function latest(...dates: (Date | null)[]): Date | null {
  let best: Date | null = null;
  for (const date of dates) if (date && (!best || date > best)) best = date;
  return best;
}
