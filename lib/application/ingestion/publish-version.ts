/**
 * The publication transaction. architecture.md 8.3.
 *
 * Five statements, one transaction, no exceptions: verify the version belongs
 * to the library and is publishable, mark it published, move
 * `library.current_version_id`, supersede the version it replaced, and record
 * the publication -- plus, for a billed build, the usage event that pays for
 * it (library-build-billing.md 4.4). Any failure rolls the whole thing back, which is what makes
 * "a query never mixes chunks from two versions" true rather than likely -- a
 * reader fixes `current_version_id` at the start of a request and every chunk
 * it then reads belongs to that version.
 *
 * There is no separate publication-event table. `library_version.published_at`
 * *is* the publication record: it is written exactly once, in this transaction,
 * and the anchor workflow reads published versions by that column
 * (aptos-anchoring-proposal.md 4.2 needs `version_id`, `source_digest` and
 * `published_at`, all of which the row already carries). A parallel table would
 * be a second source of truth for a fact this one already states.
 */
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { IngestionFailure } from '@/lib/domain/ingestion';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import {
  commitBuildCharge,
  type BuildCharge,
  type SettledBuildCharge,
} from '@/lib/application/plans/build-quota';

export interface PublishResult {
  versionId: string;
  supersededVersionId: string | null;
}

export async function publishVersion(input: {
  libraryId: string;
  versionId: string;
  /**
   * The build's seat in the call ledger, when the build was the owner's
   * bill. library-build-billing.md 4.4: the usage event is the sixth
   * statement of this transaction, so a version is never published unbilled
   * and never billed unpublished.
   */
  charge?: {
    charge: BuildCharge;
    settled: SettledBuildCharge;
    operation: string;
  } | null;
}): Promise<PublishResult> {
  const database = db();

  return database.transaction(async (tx) => {
    /* 1. The version is this library's, and it is complete. */
    const [version] = await tx
      .select({
        id: schema.libraryVersion.id,
        indexStatus: schema.libraryVersion.indexStatus,
        publishedAt: schema.libraryVersion.publishedAt,
        totalChunks: schema.libraryVersion.totalChunks,
      })
      .from(schema.libraryVersion)
      .where(
        and(
          eq(schema.libraryVersion.id, input.versionId),
          eq(schema.libraryVersion.libraryId, input.libraryId),
        ),
      )
      .limit(1);

    if (!version) {
      throw new IngestionFailure('publish_failed', 'publish', 'no such version for this library');
    }
    if (version.indexStatus !== 'ready') {
      throw new IngestionFailure('publish_failed', 'publish', 'the version is not indexed');
    }

    /*
     * Counted, not trusted. `total_chunks` is written by the builder; this
     * reads the table the queries will read. A version whose counter says 900
     * and whose table holds 200 would publish as a library that answers most
     * questions with nothing, and the counter is exactly the wrong thing to
     * ask about that.
     */
    const [counted] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.chunk)
      .where(eq(schema.chunk.versionId, version.id));

    if ((counted?.count ?? 0) !== version.totalChunks || version.totalChunks === 0) {
      throw new IngestionFailure('publish_failed', 'publish', 'the version is incomplete');
    }

    const [library] = await tx
      .select({
        currentVersionId: schema.library.currentVersionId,
        deletedAt: schema.library.deletedAt,
      })
      .from(schema.library)
      .where(eq(schema.library.id, input.libraryId))
      .limit(1);

    if (!library) {
      throw new IngestionFailure('publish_failed', 'publish', 'no such library');
    }
    /*
     * A build that was already running when the library was deleted lands
     * here. architecture.md 8.4: deletion withdraws the pointer and nothing
     * may put it back -- the version stays unpublished and the purge takes
     * its rows with the rest.
     */
    if (library.deletedAt) {
      throw new IngestionFailure('publish_failed', 'publish', 'the library is deleted');
    }
    const superseded =
      library.currentVersionId && library.currentVersionId !== version.id
        ? library.currentVersionId
        : null;

    /* 2. The version is published. Written once; a republish keeps the first. */
    await tx
      .update(schema.libraryVersion)
      .set({ publishedAt: version.publishedAt ?? new Date() })
      .where(eq(schema.libraryVersion.id, version.id));

    /*
     * 3. The pointer moves.
     *
     * Guarded on the pointer this transaction read. Two builds of the same
     * library finishing at once would otherwise both switch it, and the loser's
     * chunks would be live under the winner's version id.
     */
    const moved = await tx
      .update(schema.library)
      .set({ currentVersionId: version.id, indexStatus: 'ready' })
      .where(
        and(
          eq(schema.library.id, input.libraryId),
          library.currentVersionId === null
            ? isNull(schema.library.currentVersionId)
            : eq(schema.library.currentVersionId, library.currentVersionId),
        ),
      )
      .returning({ id: schema.library.id });

    if (moved.length === 0) {
      throw new IngestionFailure('publish_failed', 'publish', 'another build published first');
    }

    /* 4. The version it replaced is superseded. */
    if (superseded) {
      await tx
        .update(schema.libraryVersion)
        .set({ indexStatus: 'stale' })
        .where(
          and(
            eq(schema.libraryVersion.id, superseded),
            ne(schema.libraryVersion.id, version.id),
          ),
        );
    }

    /* 5. The build is billed, with the publication it paid for. */
    if (input.charge) {
      await commitBuildCharge(tx, input.charge.charge, {
        libraryId: input.libraryId,
        versionId: version.id,
        operation: input.charge.operation,
        settled: input.charge.settled,
      });
    }

    return { versionId: version.id, supersededVersionId: superseded };
  });
}
