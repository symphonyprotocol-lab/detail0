/**
 * The four platform-library verbs against a real database (requirement.md 5.3).
 *
 * The properties under test are the ones that cannot be checked in a unit test,
 * because they are about rows nobody touched:
 *
 * - a created library has no owner workspace and never acquires one, which is
 *   what keeps it out of revenue share (requirement.md 4.4);
 * - publication is refused while no indexed version exists, so the console
 *   cannot produce a published library that answers queries with nothing
 *   (architecture.md 8.3);
 * - suspending leaves the version pointer and the index alone, so it is a pause
 *   and not a deletion;
 * - a second refresh does not queue a second operation.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database -- these
 * tests write rows. Against Neon, use a dev branch:
 *
 *   TEST_DATABASE_URL='postgres://...' npx vitest run tests/integration
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

const {
  createPlatformLibrary,
  getPlatformLibrary,
  listPlatformLibraries,
  platformLibrarySummary,
  requestPlatformLibraryRefresh,
  setPlatformLibraryLifecycle,
} = await import('@/lib/application/administration/manage-platform-libraries');
const { PlatformLibraryRefused } = await import('@/lib/domain/library');
const { AdminChangeRefused } = await import('@/lib/domain/admin');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');

/** No administrator row is needed: `audit_log.administrator_id` is nullable. */
const actor = { administratorId: null as unknown as string, email: 'ops@example.test' };

/** Unique per run, so a re-run does not collide on `library_public_id_uq`. */
const slug = `platform-fixture-${Date.now()}`;
const publicId = `/websites/${slug}`;

const created: string[] = [];
let versionId = '';

/** The refusal code, so a case asserts which guard fired rather than that one did. */
async function refusalOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'accepted';
  } catch (error) {
    if (error instanceof PlatformLibraryRefused) return error.code;
    if (error instanceof AdminChangeRefused) return error.code;
    return `unexpected:${String(error)}`;
  }
}

describeWithDb('platform libraries', () => {
  afterAll(async () => {
    const database = db();
    if (created.length === 0) return;
    await database
      .delete(schema.workflowOperation)
      .where(inArray(schema.workflowOperation.libraryId, created));
    await database.delete(schema.source).where(inArray(schema.source.libraryId, created));
    if (versionId) {
      await database
        .update(schema.library)
        .set({ currentVersionId: null })
        .where(inArray(schema.library.id, created));
      await database
        .delete(schema.libraryVersion)
        .where(eq(schema.libraryVersion.id, versionId));
    }
    await database.delete(schema.library).where(inArray(schema.library.id, created));
    await database
      .delete(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.targetType, 'platform_library'),
          inArray(schema.auditLog.targetId, created),
        ),
      );
  });

  it('creates a draft library with a source and no owner workspace', async () => {
    const result = await createPlatformLibrary({
      actor,
      title: 'Platform Fixture Docs',
      publicId,
      sourceType: 'website',
      location: 'https://example.test/docs',
      refreshPolicy: 'daily',
      description: 'A fixture, not a real library.',
      domainTag: 'Testing',
      language: 'English',
      reason: 'integration test fixture',
    });
    created.push(result.libraryId);

    const record = await getPlatformLibrary(result.libraryId);
    expect(record).not.toBeNull();
    expect(record?.publicId).toBe(publicId);
    // Public from the start; it is the lifecycle, not the visibility, that
    // keeps a draft out of the catalogue (requirement.md 6.2).
    expect(record?.visibility).toBe('public');
    expect(record?.lifecycleStatus).toBe('draft');
    expect(record?.indexStatus).toBe('pending');
    expect(record?.hasReadyVersion).toBe(false);
    expect(record?.sources).toHaveLength(1);
    expect(record?.sources[0]?.location).toBe('https://example.test/docs');
    expect(record?.sources[0]?.refreshPolicy).toBe('daily');

    const [row] = await db()
      .select({
        ownerWorkspaceId: schema.library.ownerWorkspaceId,
        isPlatformLibrary: schema.library.isPlatformLibrary,
      })
      .from(schema.library)
      .where(eq(schema.library.id, result.libraryId));
    expect(row?.ownerWorkspaceId).toBeNull();
    expect(row?.isPlatformLibrary).toBe(true);
  });

  it('records the create in the audit log with a reason', async () => {
    const [entry] = await db()
      .select({ action: schema.auditLog.action, reason: schema.auditLog.reason })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.targetType, 'platform_library'),
          eq(schema.auditLog.targetId, created[0]!),
        ),
      )
      .limit(1);
    expect(entry?.action).toBe('platform_library.create');
    expect(entry?.reason).toBe('integration test fixture');
  });

  it('refuses a second library on the same Library ID', async () => {
    expect(
      await refusalOf(
        createPlatformLibrary({
          actor,
          title: 'Duplicate',
          publicId,
          sourceType: 'website',
          location: 'https://example.test/other',
          refreshPolicy: 'weekly',
          reason: 'should not happen',
        }),
      ),
    ).toBe('public_id_taken');
  });

  it('requires a reason for every action', async () => {
    expect(
      await refusalOf(
        requestPlatformLibraryRefresh({ actor, libraryId: created[0]!, reason: '   ' }),
      ),
    ).toBe('reason_required');
  });

  it('refuses to publish while no version is indexed', async () => {
    expect(
      await refusalOf(
        setPlatformLibraryLifecycle({
          actor,
          libraryId: created[0]!,
          action: 'publish',
          reason: 'too early',
        }),
      ),
    ).toBe('no_ready_version');

    const record = await getPlatformLibrary(created[0]!);
    expect(record?.lifecycleStatus).toBe('draft');
  });

  it('queues one refresh however many times it is asked', async () => {
    const first = await requestPlatformLibraryRefresh({
      actor,
      libraryId: created[0]!,
      reason: 'first request',
    });
    expect(first.created).toBe(true);

    const second = await requestPlatformLibraryRefresh({
      actor,
      libraryId: created[0]!,
      reason: 'second request',
    });
    expect(second.created).toBe(false);
    expect(second.operationId).toBe(first.operationId);

    const operations = await db()
      .select({ id: schema.workflowOperation.id, status: schema.workflowOperation.status })
      .from(schema.workflowOperation)
      .where(eq(schema.workflowOperation.libraryId, created[0]!));
    expect(operations).toHaveLength(1);
    // Nothing drains the queue yet; the row is the whole of what was promised.
    expect(operations[0]?.status).toBe('pending');
  });

  it('publishes once a ready version exists, and suspending leaves it in place', async () => {
    const database = db();
    versionId = uuidv7();
    await database.insert(schema.libraryVersion).values({
      id: versionId,
      libraryId: created[0]!,
      label: 'v1',
      sourceDigest: 'digest',
      parserVersion: 'test',
      chunkerVersion: 'test',
      embeddingModel: 'test',
      indexStatus: 'ready',
      totalChunks: 12,
      totalTokens: 340,
      publishedAt: new Date(),
    });
    await database
      .update(schema.library)
      .set({ currentVersionId: versionId, indexStatus: 'ready' })
      .where(eq(schema.library.id, created[0]!));

    const published = await setPlatformLibraryLifecycle({
      actor,
      libraryId: created[0]!,
      action: 'publish',
      reason: 'first version indexed',
    });
    expect(published.status).toBe('published');

    const suspended = await setPlatformLibraryLifecycle({
      actor,
      libraryId: created[0]!,
      action: 'suspend',
      reason: 'upstream broke',
    });
    expect(suspended.status).toBe('suspended');

    const record = await getPlatformLibrary(created[0]!);
    // A pause, not a deletion: the pointer and the version survive it.
    expect(record?.currentVersionId).toBe(versionId);
    expect(record?.versions).toHaveLength(1);
    expect(record?.hasReadyVersion).toBe(true);
  });

  it('refuses a transition the library is not in a state for', async () => {
    expect(
      await refusalOf(
        setPlatformLibraryLifecycle({
          actor,
          libraryId: created[0]!,
          action: 'suspend',
          reason: 'already suspended',
        }),
      ),
    ).toBe('invalid_transition');
  });

  it('refuses to act on a library that is not the platform’s', async () => {
    const database = db();
    const foreignId = uuidv7();
    await database.insert(schema.library).values({
      id: foreignId,
      publicId: `/websites/${slug}-user`,
      title: 'Someone else’s library',
      isPlatformLibrary: false,
      visibility: 'public',
      lifecycleStatus: 'published',
      indexStatus: 'ready',
    });
    try {
      expect(await getPlatformLibrary(foreignId)).toBeNull();
      expect(
        await refusalOf(
          setPlatformLibraryLifecycle({
            actor,
            libraryId: foreignId,
            action: 'suspend',
            reason: 'not ours to touch',
          }),
        ),
      ).toBe('not_platform_library');
    } finally {
      await database.delete(schema.library).where(eq(schema.library.id, foreignId));
    }
  });

  it('lists and counts only platform libraries', async () => {
    const { rows, counts } = await listPlatformLibraries({ query: slug });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.publicId).toBe(publicId);
    expect(rows[0]?.sourceType).toBe('website');
    expect(counts.suspended).toBeGreaterThanOrEqual(1);

    const summary = await platformLibrarySummary();
    expect(summary.queuedRefreshes).toBeGreaterThanOrEqual(1);
    // Nothing writes `usage_event` yet, so this is a true zero.
    expect(summary.callsThisMonth).toBeGreaterThanOrEqual(0);
  });
});
