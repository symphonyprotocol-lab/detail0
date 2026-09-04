/**
 * A workspace creates its own library. requirement.md 7.1, architecture.md
 * 8.4: creation writes the rows and queues the build -- the request never
 * waits for ingestion, which runs through the same workflow queue refreshes
 * use.
 *
 * Ownership vs rights, deliberately split: `owner_workspace_id` is set to the
 * creator so the dashboard and private visibility work, but that is *access*,
 * not *rights*. Sources that requirement.md 7.3 gates behind a claim (github,
 * website, llms_txt) do not earn until a claim verifies -- enforced where the
 * earning event is written, not here.
 */
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { AppError } from '@/contracts/errors';
import { uuidv7 } from '@/lib/domain/id';
import {
  idNamespace,
  isPlatformSourceType,
  normalizeLocation,
  normalizePublicId,
  type PlatformSourceType,
} from '@/lib/domain/library';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { canManageLibraries, type WorkspaceRole } from './delete';
import { PLAN_VERSION_NEWEST_FIRST } from '@/lib/application/plans/configuration';

export interface CreateWorkspaceLibraryInput {
  workspaceId: string;
  role: WorkspaceRole;
  title: string;
  visibility: 'public' | 'private';
  sourceType: PlatformSourceType;
  location: string;
  /** Ignored for github, whose id is the repository. */
  slug: string;
  description?: string | null;
  language?: string | null;
}

export interface CreateWorkspaceLibraryResult {
  libraryId: string;
  publicId: string;
  operationId: string;
}

export async function createWorkspaceLibrary(
  input: CreateWorkspaceLibraryInput,
): Promise<CreateWorkspaceLibraryResult> {
  /* Checked first, before any validation reveals anything: requirement.md 3.3
     gives library management to owners and admins, and the delete verb has
     always enforced it. Creating one is the same right. */
  if (!canManageLibraries(input.role)) {
    throw new AppError('access_denied', 'only a workspace owner or admin can create a library');
  }

  const title = input.title.trim();
  if (title.length === 0 || title.length > 120) {
    throw new AppError('invalid_request', 'a library needs a title (1-120 characters)');
  }
  if (!isPlatformSourceType(input.sourceType)) {
    throw new AppError('invalid_request', 'unsupported source type');
  }

  const location = normalizeLocation(input.sourceType, input.location);
  if (!location) {
    throw new AppError('invalid_request', 'the source location is not valid for this source type');
  }

  const publicId =
    input.sourceType === 'github'
      ? normalizePublicId('github', location)
      : normalizePublicId(input.sourceType, `/${idNamespace(input.sourceType)}/${input.slug.trim().toLowerCase()}`);
  if (!publicId) {
    throw new AppError('invalid_request', 'the library id is not valid');
  }

  const database = db();

  const limit = await libraryLimit(input.workspaceId);

  const libraryId = uuidv7();
  const sourceId = uuidv7();
  const operationId = uuidv7();

  try {
    await database.transaction(async (tx) => {
      /*
       * Locked, then counted, then inserted -- all in one transaction.
       *
       * The count used to run outside any transaction and the insert in its
       * own, which is the "SELECT the remainder, then plain INSERT" shape
       * architecture.md 11.1 forbids and `reserveCall` avoids the same way:
       * two wizard submits arriving together both read the old count, both
       * pass the ceiling, and the workspace ends up over its plan's limit
       * with no constraint to catch it.
       */
      const [locked] = await tx
        .select({ id: schema.workspace.id })
        .from(schema.workspace)
        .where(eq(schema.workspace.id, input.workspaceId))
        .for('update');
      if (!locked) throw new AppError('access_denied', 'no such workspace');

      /* Deleted libraries are tombstones; they gave their slot back. */
      const [owned] = await tx
        .select({ n: count() })
        .from(schema.library)
        .where(
          and(
            eq(schema.library.ownerWorkspaceId, input.workspaceId),
            isNull(schema.library.deletedAt),
          ),
        );
      if ((owned?.n ?? 0) >= limit) {
        throw new AppError('library_limit_exceeded', 'the plan’s library limit is reached');
      }

      await tx.insert(schema.library).values({
        id: libraryId,
        publicId,
        title,
        description: input.description?.trim() || null,
        language: input.language?.trim() || null,
        ownerWorkspaceId: input.workspaceId,
        isPlatformLibrary: false,
        visibility: input.visibility,
        lifecycleStatus: 'draft',
        indexStatus: 'pending',
      });
      await tx.insert(schema.source).values({
        id: sourceId,
        libraryId,
        type: input.sourceType,
        location,
      });
      await tx.insert(schema.workflowOperation).values({
        id: operationId,
        libraryId,
        operationType: 'ingest',
        sourceDigest: null,
        status: 'pending',
      });
    });
  } catch (error) {
    /* The driver wraps the pg error; the constraint name sits on the cause. */
    const messages = [
      error instanceof Error ? error.message : '',
      error instanceof Error && error.cause instanceof Error ? error.cause.message : '',
    ].join(' ');
    if (messages.includes('library_public_id_uq')) {
      throw new AppError('invalid_request', 'that library id is already taken');
    }
    throw error;
  }

  return { libraryId, publicId, operationId };
}

/** The plan's library ceiling: active subscription's version, or newest Free. */
async function libraryLimit(workspaceId: string): Promise<number> {
  const database = db();
  const [active] = await database
    .select({ limit: schema.planVersion.libraryLimit })
    .from(schema.subscription)
    .innerJoin(schema.planVersion, eq(schema.planVersion.id, schema.subscription.planVersionId))
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
  if (active) return active.limit;

  const [free] = await database
    .select({ limit: schema.planVersion.libraryLimit })
    .from(schema.planVersion)
    .where(eq(schema.planVersion.planId, 'free'))
    /* The id tiebreak, as every other plan-version reader uses: `created_at`
       defaults to the transaction clock, so versions minted together tie on
       it and a tie would hand out an allowance the console never published. */
    .orderBy(...PLAN_VERSION_NEWEST_FIRST)
    .limit(1);
  return free?.limit ?? 1;
}
