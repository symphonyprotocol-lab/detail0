/**
 * The owner asks for a rebuild. architecture.md 8.4: the request queues a
 * refresh and returns; the drain (or the action's own follow-up run) builds
 * it. A pending build is reused rather than doubled -- it has not read the
 * source yet, so it will see whatever the owner changed -- and a running one
 * gets a fresh row behind it. The worker's digest check makes an unchanged
 * rebuild cheap: it updates `last_checked_at` and stops.
 */
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { AppError } from '@/contracts/errors';
import { uuidv7 } from '@/lib/domain/id';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { canManageLibraries, type WorkspaceRole } from './delete';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RebuildResult {
  operationId: string;
  /** False when a pending build was already waiting and was reused. */
  created: boolean;
}

export async function requestLibraryRebuild(input: {
  workspaceId: string;
  role: WorkspaceRole;
  libraryId: string;
}): Promise<RebuildResult> {
  if (!canManageLibraries(input.role)) {
    throw new AppError('access_denied', 'only a workspace owner or admin can rebuild a library');
  }
  if (!UUID.test(input.libraryId)) throw new AppError('library_not_found', 'no such library');

  return db().transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: schema.library.id, lifecycleStatus: schema.library.lifecycleStatus })
      .from(schema.library)
      .where(
        and(
          eq(schema.library.id, input.libraryId),
          eq(schema.library.ownerWorkspaceId, input.workspaceId),
          eq(schema.library.isPlatformLibrary, false),
          isNull(schema.library.deletedAt),
        ),
      )
      .for('update');
    if (!locked) throw new AppError('library_not_found', 'no such library');
    if (locked.lifecycleStatus === 'archived') {
      throw new AppError('invalid_request', 'an archived library is not rebuilt');
    }

    const [open] = await tx
      .select({ id: schema.workflowOperation.id, status: schema.workflowOperation.status })
      .from(schema.workflowOperation)
      .where(
        and(
          eq(schema.workflowOperation.libraryId, locked.id),
          inArray(schema.workflowOperation.operationType, ['ingest', 'refresh']),
          inArray(schema.workflowOperation.status, ['pending', 'running']),
        ),
      )
      .orderBy(desc(schema.workflowOperation.createdAt))
      .limit(1);
    if (open?.status === 'pending') return { operationId: open.id, created: false };

    const operationId = uuidv7();
    await tx.insert(schema.workflowOperation).values({
      id: operationId,
      libraryId: locked.id,
      operationType: 'refresh',
      sourceDigest: null,
      status: 'pending',
    });
    return { operationId, created: true };
  });
}
