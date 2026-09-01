/**
 * A workspace's own libraries, for the dashboard. Read-only projections of
 * rows other flows own: creation goes through the import wizard, review
 * through the console, refresh through the workflow queue.
 */
import { desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import type { LifecycleStatus, IndexStatus, Visibility } from '@/lib/domain';

export interface WorkspaceLibraryRow {
  publicId: string;
  title: string;
  visibility: Visibility;
  lifecycleStatus: LifecycleStatus;
  indexStatus: IndexStatus;
  versionLabel: string | null;
  totalChunks: number;
  storageBytes: number;
  updatedAt: string | null;
}

export async function listWorkspaceLibraries(workspaceId: string): Promise<WorkspaceLibraryRow[]> {
  const rows = await db()
    .select({
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
    .where(eq(schema.library.ownerWorkspaceId, workspaceId))
    .orderBy(desc(schema.library.createdAt));

  return rows.map((row) => ({
    publicId: row.publicId,
    title: row.title,
    visibility: row.visibility,
    lifecycleStatus: row.lifecycleStatus,
    indexStatus: row.indexStatus,
    versionLabel: row.versionLabel,
    totalChunks: row.totalChunks ?? 0,
    storageBytes: row.storageBytes,
    updatedAt: (row.lastSuccessfulRefreshAt ?? row.createdAt)?.toISOString() ?? null,
  }));
}

export async function countWorkspaceLibraries(workspaceId: string): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.library)
    .where(eq(schema.library.ownerWorkspaceId, workspaceId));
  return row?.n ?? 0;
}
