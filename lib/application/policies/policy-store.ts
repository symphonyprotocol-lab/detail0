/**
 * Workspace policy: read the pinned version, mint the next one.
 * architecture.md 10.
 *
 * A Policy Version is immutable, like a Plan Version: PATCH semantics are
 * incremental on the wire, but the server materialises a complete snapshot
 * as a new `policy_version` row plus its `policy_library_entry` rows, in one
 * transaction. Queries pin the newest version at the start of a request
 * (9.2) and read nothing that can change under them.
 */
import { desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { AppError } from '@/contracts/errors';
import type { PolicyPatch, PolicyResponse, WorkspacePolicyView } from '@/contracts/schemas';
import { OPEN_POLICY, type WorkspacePolicy } from '@/lib/domain/policy';
import { uuidv7 } from '@/lib/domain/id';
import { db, schema, type Database } from '@/lib/infrastructure/postgres/client';
import { ref } from '@/lib/application/administration/column-ref';

export interface PinnedPolicy {
  versionId: string | null;
  policy: WorkspacePolicy;
}

/**
 * Each materialised block/except/allow list may hold this many entries. The
 * per-patch cap (contracts) bounds one request; this bounds what the
 * accumulated snapshot re-inserted with every new version can grow to.
 */
const MAX_LIST_ENTRIES = 1_000;

/**
 * The newest policy version, or the open default when none was ever set.
 * `database` lets a caller pin inside its own transaction; ids are uuidv7,
 * so `desc(id)` breaks a same-timestamp tie deterministically.
 */
export async function pinPolicy(
  workspaceId: string,
  database: Pick<Database, 'select'> = db(),
): Promise<PinnedPolicy> {
  const [version] = await database
    .select({
      id: schema.policyVersion.id,
      mode: schema.policyVersion.mode,
      sourceTypes: schema.policyVersion.sourceTypes,
      qualityFilters: schema.policyVersion.qualityFilters,
    })
    .from(schema.policyVersion)
    .where(eq(schema.policyVersion.workspaceId, workspaceId))
    .orderBy(desc(schema.policyVersion.createdAt), desc(schema.policyVersion.id))
    .limit(1);

  if (!version) return { versionId: null, policy: OPEN_POLICY };

  const entries = await database
    .select({
      kind: schema.policyLibraryEntry.kind,
      targetValue: schema.policyLibraryEntry.targetValue,
    })
    .from(schema.policyLibraryEntry)
    .where(eq(schema.policyLibraryEntry.policyVersionId, version.id));

  const list = (kind: string) =>
    entries.filter((entry) => entry.kind === kind).map((entry) => entry.targetValue);
  const quality = version.qualityFilters as Partial<WorkspacePolicy['quality']>;

  return {
    versionId: version.id,
    policy: {
      mode: version.mode,
      sourceTypes: version.sourceTypes,
      quality: {
        requireVerified: quality.requireVerified ?? false,
        minTrustScore: quality.minTrustScore ?? null,
        maxAgeDays: quality.maxAgeDays ?? null,
      },
      blockedLibraries: list('block'),
      exceptedLibraries: list('except'),
      allowedLibraries: list('allow'),
    },
  };
}

export async function readPolicy(workspaceId: string, requestId: string): Promise<PolicyResponse> {
  const pinned = await pinPolicy(workspaceId);
  return {
    policyVersionId: pinned.versionId,
    policy: toView(pinned.policy),
    accessibleLibraryCount: await accessibleLibraryCount(pinned.policy),
    requestId,
  };
}

/** Apply an incremental patch and mint the next immutable version. */
export async function patchPolicy(
  workspaceId: string,
  patch: PolicyPatch,
  requestId: string,
): Promise<PolicyResponse> {
  const versionId = uuidv7();
  const next = await db().transaction(async (tx) => {
    /*
     * Read-modify-insert is one critical section per workspace. Without the
     * lock two concurrent patches snapshot the same base and the loser's
     * changes silently vanish from the version that wins. Transaction-scoped,
     * so it is released on commit or rollback either way.
     */
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${workspaceId}))`);

    const current = (await pinPolicy(workspaceId, tx)).policy;

    const next: WorkspacePolicy = {
      mode: patch.mode === 'clear' ? null : (patch.mode ?? current.mode),
      sourceTypes: { ...current.sourceTypes },
      quality: {
        requireVerified: patch.quality?.requireVerified ?? current.quality.requireVerified,
        minTrustScore:
          patch.quality?.minTrustScore !== undefined
            ? patch.quality.minTrustScore
            : current.quality.minTrustScore,
        maxAgeDays:
          patch.quality?.maxAgeDays !== undefined
            ? patch.quality.maxAgeDays
            : current.quality.maxAgeDays,
      },
      blockedLibraries: patchList(current.blockedLibraries, patch.blocked),
      exceptedLibraries: patchList(current.exceptedLibraries, patch.excepted),
      allowedLibraries: patchList(current.allowedLibraries, patch.allowed),
    };
    for (const type of patch.sourceTypes?.enable ?? []) delete next.sourceTypes[type];
    for (const type of patch.sourceTypes?.disable ?? []) next.sourceTypes[type] = false;

    const overLimit = (
      [
        ['blocked', next.blockedLibraries],
        ['excepted', next.exceptedLibraries],
        ['allowed', next.allowedLibraries],
      ] as const
    ).find(([, list]) => list.length > MAX_LIST_ENTRIES);
    if (overLimit) {
      throw new AppError(
        'invalid_request',
        `the ${overLimit[0]} list cannot exceed ${MAX_LIST_ENTRIES} entries`,
      );
    }

    await tx.insert(schema.policyVersion).values({
      id: versionId,
      workspaceId,
      mode: next.mode,
      sourceTypes: next.sourceTypes,
      qualityFilters: next.quality,
      appliedAt: new Date(),
    });
    const rows = [
      ...next.blockedLibraries.map((value) => ({ kind: 'block', value })),
      ...next.exceptedLibraries.map((value) => ({ kind: 'except', value })),
      ...next.allowedLibraries.map((value) => ({ kind: 'allow', value })),
    ];
    if (rows.length > 0) {
      await tx.insert(schema.policyLibraryEntry).values(
        rows.map((row) => ({
          id: uuidv7(),
          policyVersionId: versionId,
          kind: row.kind,
          targetType: 'library',
          targetValue: row.value,
        })),
      );
    }
    return next;
  });

  return {
    policyVersionId: versionId,
    policy: toView(next),
    accessibleLibraryCount: await accessibleLibraryCount(next),
    requestId,
  };
}

function patchList(
  current: string[],
  patch: { add?: string[]; remove?: string[]; clear?: boolean } | undefined,
): string[] {
  if (!patch) return current;
  const next = new Set(patch.clear ? [] : current);
  for (const value of patch.add ?? []) next.add(value);
  for (const value of patch.remove ?? []) next.delete(value);
  return [...next];
}

function toView(policy: WorkspacePolicy): WorkspacePolicyView {
  return policy;
}

/**
 * How many routable public libraries this policy admits -- the number the
 * console shows next to a rule change. Block/select and the trust threshold
 * are counted in SQL; the remaining quality filters need per-library facts
 * that are cheap per candidate but not worth a corpus scan for a preview
 * count, so the figure is an upper bound with respect to those.
 */
async function accessibleLibraryCount(policy: WorkspacePolicy): Promise<number> {
  const database = db();
  const routable = sql`${schema.library.visibility} = 'public'
    and ${schema.library.lifecycleStatus} = 'published'
    and ${schema.library.indexStatus} = 'ready'
    and ${schema.library.currentVersionId} is not null`;

  if (policy.mode === 'select') {
    if (policy.allowedLibraries.length === 0) return 0;
    const blocked = new Set(policy.blockedLibraries);
    const allowed = policy.allowedLibraries.filter((id) => !blocked.has(id));
    if (allowed.length === 0) return 0;
    const [row] = await database
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.library)
      .where(sql`${routable} and ${inArray(schema.library.publicId, allowed)}`);
    return row?.n ?? 0;
  }

  const threshold = policy.mode === 'quality' ? policy.quality.minTrustScore : null;
  const [row] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.library)
    .where(
      sql`${routable}
        ${policy.blockedLibraries.length > 0 ? sql`and ${notInArray(schema.library.publicId, policy.blockedLibraries)}` : sql``}
        ${
          threshold !== null
            ? sql`and coalesce((
                select s.trust_score from ${schema.libraryScore} s
                where s.library_id = ${ref(schema.library.id)}
                order by s.computed_at desc limit 1
              ), 0) >= ${threshold}`
            : sql``
        }`,
    );
  return row?.n ?? 0;
}
