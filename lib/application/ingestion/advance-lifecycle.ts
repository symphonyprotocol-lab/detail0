/**
 * What a successful build does to a user library's lifecycle.
 *
 * `publishVersion` moves the version pointer and nothing else -- the pointer
 * is about the index, and requirement.md 6.2 keeps the index, the lifecycle
 * and the visibility apart. But a user library still has to get *somewhere*
 * once its first version is live: a private one is queryable from now on and
 * a public one is now the reviewer's to decide about. The rule is pure
 * (`lifecycleAfterBuild`); this applies it, guarded on the status it read so
 * a reviewer deciding at the same moment is not overwritten.
 */
import { and, eq } from 'drizzle-orm';
import { lifecycleAfterBuild } from '@/lib/domain/library';
import { db, schema } from '@/lib/infrastructure/postgres/client';

export async function advanceLifecycleAfterBuild(libraryId: string): Promise<void> {
  const database = db();
  const [row] = await database
    .select({
      lifecycleStatus: schema.library.lifecycleStatus,
      visibility: schema.library.visibility,
      isPlatformLibrary: schema.library.isPlatformLibrary,
    })
    .from(schema.library)
    .where(eq(schema.library.id, libraryId))
    .limit(1);
  if (!row) return;

  const next = lifecycleAfterBuild(row);
  if (!next) return;

  await database
    .update(schema.library)
    .set({ lifecycleStatus: next })
    .where(
      and(eq(schema.library.id, libraryId), eq(schema.library.lifecycleStatus, row.lifecycleStatus)),
    );
}
