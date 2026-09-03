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

export interface CreateWorkspaceLibraryInput {
  workspaceId: string;
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

  /* Deleted libraries are tombstones; they gave their slot back. */
  const [owned] = await database
    .select({ n: count() })
    .from(schema.library)
    .where(
      and(eq(schema.library.ownerWorkspaceId, input.workspaceId), isNull(schema.library.deletedAt)),
    );
  if ((owned?.n ?? 0) >= (await libraryLimit(input.workspaceId))) {
    throw new AppError('library_limit_exceeded', 'the plan’s library limit is reached');
  }

  const libraryId = uuidv7();
  const sourceId = uuidv7();
  const operationId = uuidv7();

  try {
    await database.transaction(async (tx) => {
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
    .orderBy(desc(schema.planVersion.createdAt))
    .limit(1);
  return free?.limit ?? 1;
}
