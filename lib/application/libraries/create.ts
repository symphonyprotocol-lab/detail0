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
  isConnectedSourceType,
  normalizeLocation,
  normalizePublicId,
  parseUploadManifest,
  uploadPrefix,
  type ConnectedSourceType,
  type UploadedFile,
} from '@/lib/domain/library';
import { isObjectStoreConfigured, objectStore, type ObjectStore } from '@/lib/infrastructure/objects/store';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { canManageLibraries, type WorkspaceRole } from './delete';
import { PLAN_VERSION_NEWEST_FIRST } from '@/lib/application/plans/configuration';

export interface CreateWorkspaceLibraryInput {
  workspaceId: string;
  role: WorkspaceRole;
  title: string;
  visibility: 'public' | 'private';
  sourceType: ConnectedSourceType;
  /** Ignored for pdf, whose location is where its uploads sit. */
  location: string;
  /** Ignored for github, whose id is the repository. */
  slug: string;
  /**
   * For pdf only: the manifest the wizard posted after uploading, as parsed
   * JSON. Checked against this workspace's key prefix and against the store
   * before a row is written, because a form post can say anything.
   */
  uploads?: unknown;
  description?: string | null;
  language?: string | null;
  /** The store the uploads are confirmed in; the configured one by default. */
  store?: Pick<ObjectStore, 'head'>;
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
  if (!isConnectedSourceType(input.sourceType)) {
    throw new AppError('invalid_request', 'unsupported source type');
  }

  /*
   * A pdf source's location is derived, not typed: the prefix its files were
   * uploaded under. Each file is confirmed to exist in the store at the size
   * the manifest claims, so a build never starts on an upload that failed
   * halfway or a manifest a client edited.
   */
  let uploaded: UploadedFile[] = [];
  let location: string | null;
  if (input.sourceType === 'pdf') {
    const manifest = parseUploadManifest(input.uploads, input.workspaceId);
    if (!manifest) {
      throw new AppError('invalid_request', 'the upload manifest is not valid');
    }
    uploaded = manifest.files;
    location = uploadPrefix(input.workspaceId, manifest.batchId);
    await confirmUploads(uploaded, input.store);
  } else {
    location = normalizeLocation(input.sourceType, input.location);
  }
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
        config: input.sourceType === 'pdf' ? { files: uploaded } : {},
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

async function confirmUploads(files: UploadedFile[], store?: Pick<ObjectStore, 'head'>): Promise<void> {
  if (!store && !isObjectStoreConfigured()) {
    throw new AppError('provider_unavailable', 'no object storage is configured');
  }
  const reader = store ?? objectStore();
  for (const file of files) {
    const object = await reader.head(file.key);
    if (!object) {
      throw new AppError('invalid_request', `${file.name} was not uploaded`);
    }
    if (object.size !== file.size) {
      throw new AppError('invalid_request', `${file.name} is not the size it was declared at`);
    }
  }
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
