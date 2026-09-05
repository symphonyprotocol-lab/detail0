/**
 * A workspace's own libraries, for the dashboard. Read-only projections of
 * rows other flows own: creation goes through the import wizard, review
 * through the console, refresh through the workflow queue.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import type { LifecycleStatus, IndexStatus, Visibility } from '@/lib/domain';

export interface WorkspaceLibraryRow {
  id: string;
  publicId: string;
  title: string;
  visibility: Visibility;
  lifecycleStatus: LifecycleStatus;
  indexStatus: IndexStatus;
  versionLabel: string | null;
  totalChunks: number;
  storageBytes: number;
  updatedAt: string | null;
  /** True for a library whose source is uploaded PDFs, which has a files page. */
  hasFiles: boolean;
  /** The latest reviewer's note, when the library is waiting on the owner. */
  reviewNote: string | null;
}

export async function listWorkspaceLibraries(workspaceId: string): Promise<WorkspaceLibraryRow[]> {
  const rows = await db()
    .select({
      id: schema.library.id,
      publicId: schema.library.publicId,
      title: schema.library.title,
      visibility: schema.library.visibility,
      lifecycleStatus: schema.library.lifecycleStatus,
      indexStatus: schema.library.indexStatus,
      storageBytes: schema.library.storageBytes,
      lastSuccessfulRefreshAt: schema.library.lastSuccessfulRefreshAt,
      createdAt: schema.library.createdAt,
      versionLabel: schema.libraryVersion.label,
      totalChunks: schema.libraryVersion.totalChunks,
    })
    .from(schema.library)
    .leftJoin(schema.libraryVersion, eq(schema.libraryVersion.id, schema.library.currentVersionId))
    .where(OWNED_AND_LIVE(workspaceId))
    .orderBy(desc(schema.library.createdAt));

  /* The latest manual review of each library that is sent back or
     suspended: that is the one the owner has to act on. */
  const blocked = rows.filter(
    (row) => row.lifecycleStatus === 'changes_requested' || row.lifecycleStatus === 'suspended',
  );
  const notes = new Map<string, string>();
  if (blocked.length > 0) {
    const reviews = await db()
      .select({ libraryId: schema.libraryReview.libraryId, feedback: schema.libraryReview.feedback })
      .from(schema.libraryReview)
      .where(
        inArray(
          schema.libraryReview.libraryId,
          blocked.map((row) => row.id),
        ),
      )
      .orderBy(desc(schema.libraryReview.createdAt));
    for (const review of reviews) {
      if (!notes.has(review.libraryId) && review.feedback[0]) notes.set(review.libraryId, review.feedback[0]);
    }
  }

  const withFiles = new Set(
    rows.length === 0
      ? []
      : (
          await db()
            .select({ libraryId: schema.source.libraryId })
            .from(schema.source)
            .where(
              and(
                eq(schema.source.type, 'pdf'),
                inArray(
                  schema.source.libraryId,
                  rows.map((row) => row.id),
                ),
              ),
            )
        ).map((source) => source.libraryId),
  );

  return rows.map((row) => ({
    id: row.id,
    publicId: row.publicId,
    title: row.title,
    visibility: row.visibility,
    lifecycleStatus: row.lifecycleStatus,
    indexStatus: row.indexStatus,
    versionLabel: row.versionLabel,
    totalChunks: row.totalChunks ?? 0,
    storageBytes: row.storageBytes,
    updatedAt: (row.lastSuccessfulRefreshAt ?? row.createdAt)?.toISOString() ?? null,
    hasFiles: withFiles.has(row.id),
    reviewNote: notes.get(row.id) ?? null,
  }));
}

/**
 * The workspace's libraries that still exist. A deleted one is a tombstone
 * (`deleted_at`), kept for billing history and shown nowhere -- and it no
 * longer counts against the plan's library limit.
 */
const OWNED_AND_LIVE = (workspaceId: string) =>
  and(eq(schema.library.ownerWorkspaceId, workspaceId), isNull(schema.library.deletedAt));

export async function countWorkspaceLibraries(workspaceId: string): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.library)
    .where(OWNED_AND_LIVE(workspaceId));
  return row?.n ?? 0;
}
