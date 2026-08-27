/**
 * Use cases behind the platform-library screens: the list, one library in
 * full, and the four things an operator may do to it.
 *
 * requirement.md 5.3 gives the console exactly four verbs over a library
 * recall0 publishes itself -- create, refresh, suspend, publish -- and this
 * module is all four, plus the two reads the screens need.
 *
 * What is real here and what is not, stated once so no screen has to guess:
 *
 * - creating writes a `library` row and its `source` row, in one transaction.
 *   That is complete; nothing about it waits on ingestion.
 * - refreshing creates a Refresh Operation and returns. architecture.md 8.4 is
 *   explicit that the caller does not wait for execution, so enqueueing *is*
 *   the whole of this side. The worker that drains the queue ships with
 *   ingestion (architecture.md 21, step 3), so until then the row sits pending
 *   -- which is why `requestRefresh` reports the queue position back rather
 *   than claiming a sync happened.
 * - publishing refuses without a ready version. Publication is the atomic
 *   switch of `current_version_id` onto an indexed version (architecture.md
 *   8.3); with no version there is nothing to point at, and a `published` row
 *   whose index is empty would be a library that answers queries with nothing.
 * - suspending is immediate and needs no version: it takes the library out of
 *   circulation, which is a property of the row itself.
 *
 * Every mutation records the operator, the target, the values before and after,
 * the reason, the result, the time and a summary of the network origin.
 */
import { and, count, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { normalizeReason } from '@/lib/domain/admin';
import { uuidv7 } from '@/lib/domain/id';
import {
  draftPlatformLibrary,
  lifecycleActionAvailable,
  lifecycleTarget,
  PlatformLibraryRefused,
  type PlatformLibraryInput,
  type PlatformLifecycleAction,
  type PlatformLifecycleState,
  type RefreshPolicy,
} from '@/lib/domain/library';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { recordAudit } from './audit';
import { ref } from './column-ref';
import { likePattern } from './like-pattern';

export interface PlatformActor {
  administratorId: string;
  email: string;
  clientAddress?: string | null;
}

/* -------------------------------------------------------------------- list */

export type PlatformStatusFilter = 'all' | PlatformLifecycleState;

export const PLATFORM_STATUS_FILTERS: readonly PlatformStatusFilter[] = [
  'all',
  'published',
  'draft',
  'suspended',
  'archived',
];

export function isPlatformStatusFilter(value: unknown): value is PlatformStatusFilter {
  return typeof value === 'string' && (PLATFORM_STATUS_FILTERS as readonly string[]).includes(value);
}

export interface PlatformLibraryRow {
  id: string;
  publicId: string;
  title: string;
  sourceType: string | null;
  sourceCount: number;
  documents: number;
  storageBytes: number;
  lifecycleStatus: string;
  indexStatus: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

/** Only ever true rows: everything below is scoped to the platform's own. */
const IS_PLATFORM = eq(schema.library.isPlatformLibrary, true);

/** The type of the first source, when a library has one. */
const firstSourceType = sql<string | null>`(
  select ${ref(schema.source.type)} from ${schema.source}
  where ${ref(schema.source.libraryId)} = ${ref(schema.library.id)}
  order by ${ref(schema.source.id)} limit 1
)`;

const sourceCount = sql<number>`(
  select count(*)::int from ${schema.source}
  where ${ref(schema.source.libraryId)} = ${ref(schema.library.id)}
)`;

/**
 * Documents in the *current* version, not in every version ever built.
 *
 * `document` rows are per version and versions are immutable, so counting by
 * library would add every superseded build to the figure and the number on
 * screen would grow with each refresh even when the source never changed.
 */
const currentDocuments = sql<number>`(
  select count(*)::int from ${schema.document}
  where ${ref(schema.document.versionId)} = ${ref(schema.library.currentVersionId)}
)`;

export interface PlatformLibraryList {
  rows: PlatformLibraryRow[];
  total: number;
  counts: Record<PlatformStatusFilter, number>;
}

export async function listPlatformLibraries(
  input: { query?: string; status?: PlatformStatusFilter; limit?: number; offset?: number } = {},
): Promise<PlatformLibraryList> {
  const database = db();
  const term = input.query?.trim();
  const status = input.status ?? 'all';

  const where = and(
    ...[
      IS_PLATFORM,
      term
        ? or(
            ilike(schema.library.title, likePattern(term)),
            ilike(schema.library.publicId, likePattern(term)),
          )
        : undefined,
      status === 'all' ? undefined : eq(schema.library.lifecycleStatus, status),
    ].filter(Boolean),
  );

  const [rows, [totalRow], statusRows] = await Promise.all([
    database
      .select({
        id: schema.library.id,
        publicId: schema.library.publicId,
        title: schema.library.title,
        storageBytes: schema.library.storageBytes,
        lifecycleStatus: schema.library.lifecycleStatus,
        indexStatus: schema.library.indexStatus,
        lastSyncedAt: schema.library.lastSuccessfulRefreshAt,
        createdAt: schema.library.createdAt,
        sourceType: firstSourceType,
        sourceCount,
        documents: currentDocuments,
      })
      .from(schema.library)
      .where(where)
      .orderBy(desc(schema.library.createdAt))
      .limit(input.limit ?? 50)
      .offset(input.offset ?? 0),
    database.select({ n: count() }).from(schema.library).where(where),
    database
      .select({ status: schema.library.lifecycleStatus, n: count() })
      .from(schema.library)
      .where(IS_PLATFORM)
      .groupBy(schema.library.lifecycleStatus),
  ]);

  const byStatus = new Map<string, number>(statusRows.map((row) => [row.status, row.n]));

  return {
    rows,
    total: totalRow?.n ?? 0,
    counts: {
      all: [...byStatus.values()].reduce((a, b) => a + b, 0),
      published: byStatus.get('published') ?? 0,
      draft: byStatus.get('draft') ?? 0,
      suspended: byStatus.get('suspended') ?? 0,
      archived: byStatus.get('archived') ?? 0,
    },
  };
}

export interface PlatformLibrarySummary {
  published: number;
  /** Libraries whose last successful refresh landed today, UTC. */
  syncedToday: number;
  /** Platform libraries with a refresh queued and not yet finished. */
  queuedRefreshes: number;
  /** Retrieval calls against platform libraries this calendar month, UTC. */
  callsThisMonth: number;
}

/**
 * The three figures above the list, plus the queue depth.
 *
 * `callsThisMonth` comes from `usage_event`, which nothing writes yet -- call
 * metering ships with the retrieval path. It reads zero rather than being
 * omitted, and the screen says why, because a metric that disappears when it is
 * zero is a metric nobody notices is broken.
 */
export async function platformLibrarySummary(now: Date = new Date()): Promise<PlatformLibrarySummary> {
  const database = db();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [[libraryRow], [queueRow], [callRow]] = await Promise.all([
    database
      .select({
        published: sql<number>`(count(*) filter (
          where ${schema.library.lifecycleStatus} = 'published'
        ))::int`,
        syncedToday: sql<number>`(count(*) filter (
          where ${schema.library.lastSuccessfulRefreshAt} >= ${dayStart}
        ))::int`,
      })
      .from(schema.library)
      .where(IS_PLATFORM),
    database
      .select({ n: count() })
      .from(schema.workflowOperation)
      .innerJoin(schema.library, eq(schema.library.id, schema.workflowOperation.libraryId))
      .where(
        and(
          IS_PLATFORM,
          eq(schema.workflowOperation.operationType, REFRESH_OPERATION),
          inArray(schema.workflowOperation.status, [...OPEN_OPERATION_STATUSES]),
        ),
      ),
    database
      .select({ n: count() })
      .from(schema.usageEvent)
      .innerJoin(schema.library, eq(schema.library.id, schema.usageEvent.libraryId))
      .where(and(IS_PLATFORM, gte(schema.usageEvent.createdAt, monthStart))),
  ]);

  return {
    published: libraryRow?.published ?? 0,
    syncedToday: libraryRow?.syncedToday ?? 0,
    queuedRefreshes: queueRow?.n ?? 0,
    callsThisMonth: callRow?.n ?? 0,
  };
}

/* ------------------------------------------------------------------ detail */

export interface PlatformSourceView {
  id: string;
  type: string;
  location: string;
  refreshPolicy: RefreshPolicy | 'unknown';
}

export interface PlatformVersionView {
  id: string;
  label: string;
  indexStatus: string;
  totalChunks: number;
  totalTokens: number;
  documents: number;
  contentMerkleRoot: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  isCurrent: boolean;
}

export interface PlatformOperationView {
  id: string;
  operationType: string;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformAuditView {
  id: string;
  action: string;
  administrator: string | null;
  reason: string | null;
  result: string;
  createdAt: Date;
}

export interface PlatformLibraryDetail {
  id: string;
  publicId: string;
  title: string;
  description: string | null;
  domainTag: string | null;
  language: string | null;
  visibility: string;
  lifecycleStatus: PlatformLifecycleState;
  indexStatus: string;
  storageBytes: number;
  currentVersionId: string | null;
  /** Label of the current version, whether or not it is on the page below. */
  currentVersionLabel: string | null;
  lastCheckedAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  /** Of the current version; zero while nothing has been indexed. */
  documents: number;
  chunks: number;
  tokens: number;
  sources: PlatformSourceView[];
  versions: PlatformVersionView[];
  operations: PlatformOperationView[];
  audit: PlatformAuditView[];
  /** Whether publishing would be accepted right now. */
  hasReadyVersion: boolean;
}

/** How much history the detail screen shows. Deeper reading is the audit log. */
const DETAIL_LIMIT = 20;

/**
 * One platform library, with everything the four decisions depend on.
 *
 * Returns null for an unknown id, and for a *user* library whose id was pasted
 * into this route: the caller is a page, and both cases should render the
 * console's 404 rather than a screen offering platform verbs over someone
 * else's library.
 */
export async function getPlatformLibrary(libraryId: string): Promise<PlatformLibraryDetail | null> {
  if (!isUuid(libraryId)) return null;

  const database = db();
  const [record] = await database
    .select({
      id: schema.library.id,
      publicId: schema.library.publicId,
      title: schema.library.title,
      description: schema.library.description,
      domainTag: schema.library.domainTag,
      language: schema.library.language,
      visibility: schema.library.visibility,
      lifecycleStatus: schema.library.lifecycleStatus,
      indexStatus: schema.library.indexStatus,
      storageBytes: schema.library.storageBytes,
      currentVersionId: schema.library.currentVersionId,
      lastCheckedAt: schema.library.lastCheckedAt,
      lastSyncedAt: schema.library.lastSuccessfulRefreshAt,
      createdAt: schema.library.createdAt,
      isPlatformLibrary: schema.library.isPlatformLibrary,
    })
    .from(schema.library)
    .where(eq(schema.library.id, libraryId))
    .limit(1);

  if (!record || !record.isPlatformLibrary) return null;

  const [sources, versions, operations, audit, [documentRow], [current]] = await Promise.all([
    database
      .select({
        id: schema.source.id,
        type: schema.source.type,
        location: schema.source.location,
        refreshPolicy: schema.source.refreshPolicy,
      })
      .from(schema.source)
      .where(eq(schema.source.libraryId, libraryId))
      .orderBy(schema.source.id),
    database
      .select({
        id: schema.libraryVersion.id,
        label: schema.libraryVersion.label,
        indexStatus: schema.libraryVersion.indexStatus,
        totalChunks: schema.libraryVersion.totalChunks,
        totalTokens: schema.libraryVersion.totalTokens,
        contentMerkleRoot: schema.libraryVersion.contentMerkleRoot,
        publishedAt: schema.libraryVersion.publishedAt,
        createdAt: schema.libraryVersion.createdAt,
        documents: sql<number>`(
          select count(*)::int from ${schema.document}
          where ${ref(schema.document.versionId)} = ${ref(schema.libraryVersion.id)}
        )`,
      })
      .from(schema.libraryVersion)
      .where(eq(schema.libraryVersion.libraryId, libraryId))
      .orderBy(desc(schema.libraryVersion.createdAt))
      .limit(DETAIL_LIMIT),
    database
      .select({
        id: schema.workflowOperation.id,
        operationType: schema.workflowOperation.operationType,
        status: schema.workflowOperation.status,
        attempts: schema.workflowOperation.attempts,
        error: schema.workflowOperation.error,
        createdAt: schema.workflowOperation.createdAt,
        updatedAt: schema.workflowOperation.updatedAt,
      })
      .from(schema.workflowOperation)
      .where(eq(schema.workflowOperation.libraryId, libraryId))
      .orderBy(desc(schema.workflowOperation.createdAt))
      .limit(DETAIL_LIMIT),
    database
      .select({
        id: schema.auditLog.id,
        action: schema.auditLog.action,
        reason: schema.auditLog.reason,
        result: schema.auditLog.result,
        createdAt: schema.auditLog.createdAt,
        administrator: schema.administrator.email,
      })
      .from(schema.auditLog)
      .leftJoin(schema.administrator, eq(schema.administrator.id, schema.auditLog.administratorId))
      .where(
        and(eq(schema.auditLog.targetType, AUDIT_TARGET), eq(schema.auditLog.targetId, libraryId)),
      )
      .orderBy(desc(schema.auditLog.seq))
      .limit(DETAIL_LIMIT),
    record.currentVersionId
      ? database
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.document)
          .where(eq(schema.document.versionId, record.currentVersionId))
      : [],
    /*
     * The current version, read by id rather than looked up in `versions`.
     * That list is one page of history, newest first, and the pointer does not
     * have to point at the newest build -- a run of failed rebuilds leaves it
     * on an older, indexed one. Finding it in a truncated page would then
     * report zero chunks and refuse a publication the use case would accept.
     */
    record.currentVersionId
      ? database
          .select({
            label: schema.libraryVersion.label,
            indexStatus: schema.libraryVersion.indexStatus,
            totalChunks: schema.libraryVersion.totalChunks,
            totalTokens: schema.libraryVersion.totalTokens,
          })
          .from(schema.libraryVersion)
          .where(eq(schema.libraryVersion.id, record.currentVersionId))
          .limit(1)
      : [],
  ]);

  return {
    id: record.id,
    publicId: record.publicId,
    title: record.title,
    description: record.description,
    domainTag: record.domainTag,
    language: record.language,
    visibility: record.visibility,
    lifecycleStatus: record.lifecycleStatus as PlatformLifecycleState,
    indexStatus: record.indexStatus,
    storageBytes: record.storageBytes,
    currentVersionId: record.currentVersionId,
    currentVersionLabel: current?.label ?? null,
    lastCheckedAt: record.lastCheckedAt,
    lastSyncedAt: record.lastSyncedAt,
    createdAt: record.createdAt,
    documents: documentRow?.n ?? 0,
    chunks: current?.totalChunks ?? 0,
    tokens: current?.totalTokens ?? 0,
    sources: sources.map((source) => ({
      id: source.id,
      type: source.type,
      location: source.location,
      refreshPolicy: readRefreshPolicy(source.refreshPolicy),
    })),
    versions: versions.map((version) => ({
      ...version,
      isCurrent: version.id === record.currentVersionId,
    })),
    operations,
    audit,
    hasReadyVersion: current?.indexStatus === 'ready',
  };
}

/**
 * `source.refresh_policy` is free-form JSON, so what comes back is checked
 * rather than trusted: a row written by some future importer must not make the
 * console render `[object Object]` where a cadence should be.
 */
function readRefreshPolicy(stored: Record<string, unknown> | null): RefreshPolicy | 'unknown' {
  const value = stored?.cadence;
  return value === 'daily' || value === 'weekly' || value === 'manual' ? value : 'unknown';
}

/* ------------------------------------------------------------------ create */

export interface CreatePlatformLibraryResult {
  libraryId: string;
  publicId: string;
}

/**
 * Creates one platform library and its first source.
 *
 * The row is deliberately born `draft`/`pending` rather than published: nothing
 * has been fetched, so there is no version to serve and `isQueryable` would be
 * false whatever this wrote. Visibility is `public` from the start because that
 * is what a platform library is for -- it is the lifecycle, not the visibility,
 * that keeps it out of the catalogue until it is ready (requirement.md 6.2
 * keeps the two independent, and this is exactly the case that needs them to
 * be).
 *
 * `owner_workspace_id` is left null and never written here. architecture.md 5.4
 * allows exactly two writers of that column -- a verified claim and an admin
 * ruling -- and a platform library is neither.
 */
export async function createPlatformLibrary(
  input: PlatformLibraryInput & { actor: PlatformActor; reason: string },
): Promise<CreatePlatformLibraryResult> {
  const draft = draftPlatformLibrary(input);
  const reason = normalizeReason(input.reason);
  const database = db();

  /*
   * Checked before the insert so the operator gets `public_id_taken` rather
   * than a driver error, and checked again by `library_public_id_uq` because
   * two operators can type the same id at the same time. The index is the
   * authority; this read is only what turns its verdict into a usable message.
   */
  const [existing] = await database
    .select({ id: schema.library.id })
    .from(schema.library)
    .where(eq(schema.library.publicId, draft.publicId))
    .limit(1);
  if (existing) {
    throw new PlatformLibraryRefused('public_id_taken', 'that Library ID is already in use');
  }

  const libraryId = uuidv7();
  const sourceId = uuidv7();

  try {
    await database.transaction(async (tx) => {
      await tx.insert(schema.library).values({
        id: libraryId,
        publicId: draft.publicId,
        title: draft.title,
        description: draft.description,
        domainTag: draft.domainTag,
        language: draft.language,
        ownerWorkspaceId: null,
        isPlatformLibrary: true,
        visibility: 'public',
        lifecycleStatus: 'draft',
        indexStatus: 'pending',
      });
      await tx.insert(schema.source).values({
        id: sourceId,
        libraryId,
        type: draft.sourceType,
        location: draft.location,
        config: {},
        refreshPolicy: { cadence: draft.refreshPolicy },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PlatformLibraryRefused('public_id_taken', 'that Library ID is already in use');
    }
    throw error;
  }

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: 'platform_library.create',
    targetType: AUDIT_TARGET,
    targetId: libraryId,
    reason,
    beforeValue: null,
    afterValue: {
      publicId: draft.publicId,
      title: draft.title,
      sourceType: draft.sourceType,
      location: draft.location,
      refreshPolicy: draft.refreshPolicy,
      lifecycleStatus: 'draft',
    },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });

  return { libraryId, publicId: draft.publicId };
}

/* --------------------------------------------------------------- lifecycle */

export interface LifecycleChangeResult {
  status: PlatformLifecycleState;
  publicId: string;
}

/**
 * Publish or suspend one platform library. requirement.md 5.3.
 *
 * Publishing sets `lifecycle_status` and nothing else. It does *not* invent a
 * `current_version_id`: the pointer is switched by the publication transaction
 * that builds the version (architecture.md 8.3), and this refuses outright
 * unless that has already happened, so the console can never produce a
 * published library with an empty index.
 *
 * Suspending leaves the version pointer and the index alone. The library stops
 * answering because `isQueryable` requires `published`; deleting anything would
 * make the pause irreversible, and a pause is not a deletion.
 */
export async function setPlatformLibraryLifecycle(input: {
  actor: PlatformActor;
  libraryId: string;
  action: PlatformLifecycleAction;
  reason: string;
}): Promise<LifecycleChangeResult> {
  const reason = normalizeReason(input.reason);
  const database = db();
  const target = await loadTarget(database, input.libraryId);

  if (!lifecycleActionAvailable(target.lifecycleStatus, input.action)) {
    throw new PlatformLibraryRefused(
      target.lifecycleStatus === 'archived' ? 'archived' : 'invalid_transition',
      `cannot ${input.action} a ${target.lifecycleStatus} library`,
    );
  }

  const next = lifecycleTarget(input.action);

  if (input.action === 'publish') {
    const ready = target.currentVersionId
      ? await database
          .select({ id: schema.libraryVersion.id })
          .from(schema.libraryVersion)
          .where(
            and(
              eq(schema.libraryVersion.id, target.currentVersionId),
              eq(schema.libraryVersion.indexStatus, 'ready'),
            ),
          )
          .limit(1)
      : [];
    if (ready.length === 0) {
      throw new PlatformLibraryRefused(
        'no_ready_version',
        'publication requires an indexed current version',
      );
    }
  }

  /*
   * Guarded on the status it was read at, so two operators acting on the same
   * library at the same time cannot both succeed. The loser's update matches no
   * row and is reported as an invalid transition, which is what it now is.
   */
  const updated = await database
    .update(schema.library)
    .set({ lifecycleStatus: next })
    .where(
      and(
        eq(schema.library.id, target.id),
        eq(schema.library.lifecycleStatus, target.lifecycleStatus),
        IS_PLATFORM,
      ),
    )
    .returning({ id: schema.library.id });

  if (updated.length === 0) {
    throw new PlatformLibraryRefused('invalid_transition', 'the library moved while you decided');
  }

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: input.action === 'publish' ? 'platform_library.publish' : 'platform_library.suspend',
    targetType: AUDIT_TARGET,
    targetId: target.id,
    reason,
    beforeValue: { publicId: target.publicId, lifecycleStatus: target.lifecycleStatus },
    afterValue: { publicId: target.publicId, lifecycleStatus: next },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });

  return { status: next, publicId: target.publicId };
}

/* ----------------------------------------------------------------- refresh */

const REFRESH_OPERATION = 'refresh';

/** Operation states that mean the work is still owed. */
const OPEN_OPERATION_STATUSES = ['pending', 'running'] as const;

export interface RefreshRequestResult {
  operationId: string;
  /** False when a refresh was already queued, so the console says so. */
  created: boolean;
}

/**
 * Queues a refresh of one platform library.
 *
 * Idempotent by intent rather than by index: `workflow_operation_uq` covers
 * `(library_id, source_digest, operation_type)`, and a manually requested
 * refresh has no digest yet -- the digest is what the fetch discovers. Postgres
 * treats NULLs as distinct in a unique index, so the constraint would not
 * collapse two of these, and a second click would silently queue the same work
 * twice. Reusing the open row is what makes the button safe to press twice.
 *
 * There is still a race between the read and the insert. It is left as one:
 * losing it queues one duplicate refresh, the worker's own digest check ends it
 * cheaply (architecture.md 8.4 -- an unchanged digest updates `last_checked_at`
 * and stops), and taking a lock here would be a heavier price than the mistake.
 */
export async function requestPlatformLibraryRefresh(input: {
  actor: PlatformActor;
  libraryId: string;
  reason: string;
}): Promise<RefreshRequestResult> {
  const reason = normalizeReason(input.reason);
  const database = db();
  const target = await loadTarget(database, input.libraryId);

  if (target.lifecycleStatus === 'archived') {
    throw new PlatformLibraryRefused('archived', 'an archived library is not refreshed');
  }

  const [open] = await database
    .select({ id: schema.workflowOperation.id })
    .from(schema.workflowOperation)
    .where(
      and(
        eq(schema.workflowOperation.libraryId, target.id),
        eq(schema.workflowOperation.operationType, REFRESH_OPERATION),
        inArray(schema.workflowOperation.status, [...OPEN_OPERATION_STATUSES]),
      ),
    )
    .orderBy(desc(schema.workflowOperation.createdAt))
    .limit(1);

  if (open) return { operationId: open.id, created: false };

  const operationId = uuidv7();
  await database.insert(schema.workflowOperation).values({
    id: operationId,
    libraryId: target.id,
    operationType: REFRESH_OPERATION,
    sourceDigest: null,
    status: 'pending',
  });

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: 'platform_library.refresh',
    targetType: AUDIT_TARGET,
    targetId: target.id,
    reason,
    beforeValue: { publicId: target.publicId, lastCheckedAt: target.lastCheckedAt },
    afterValue: { publicId: target.publicId, operationId, status: 'pending' },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });

  return { operationId, created: true };
}

/* ------------------------------------------------------------------ shared */

/** `target_type` for every audit entry this module writes. */
const AUDIT_TARGET = 'platform_library';

interface LifecycleTargetRow {
  id: string;
  publicId: string;
  lifecycleStatus: PlatformLifecycleState;
  currentVersionId: string | null;
  lastCheckedAt: Date | null;
}

/**
 * Loads the row a mutation is about, refusing anything that is not this
 * console's to change.
 *
 * `not_platform_library` is separate from `not_found` on purpose: a user
 * library reached through a hand-edited id is a different mistake from a typo,
 * and conflating them would let an operator believe a library they can see in
 * the other list has vanished.
 */
async function loadTarget(
  database: ReturnType<typeof db>,
  libraryId: string,
): Promise<LifecycleTargetRow> {
  if (!isUuid(libraryId)) {
    throw new PlatformLibraryRefused('not_found', 'no such library');
  }
  const [row] = await database
    .select({
      id: schema.library.id,
      publicId: schema.library.publicId,
      lifecycleStatus: schema.library.lifecycleStatus,
      currentVersionId: schema.library.currentVersionId,
      lastCheckedAt: schema.library.lastCheckedAt,
      isPlatformLibrary: schema.library.isPlatformLibrary,
    })
    .from(schema.library)
    .where(eq(schema.library.id, libraryId))
    .limit(1);

  if (!row) throw new PlatformLibraryRefused('not_found', 'no such library');
  if (!row.isPlatformLibrary) {
    throw new PlatformLibraryRefused('not_platform_library', 'not a platform library');
  }
  return {
    id: row.id,
    publicId: row.publicId,
    lifecycleStatus: row.lifecycleStatus as PlatformLifecycleState,
    currentVersionId: row.currentVersionId,
    lastCheckedAt: row.lastCheckedAt,
  };
}

/** Cheap guard so a junk path segment cannot reach Postgres as a bad uuid cast. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Postgres `unique_violation`, whatever driver wrapper it arrives in. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
