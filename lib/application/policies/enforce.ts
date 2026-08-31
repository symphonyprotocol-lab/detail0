/**
 * Feeding the policy evaluator. architecture.md 10.2: Library Search, Context
 * Retrieval and the web all consult the same evaluator -- this module only
 * assembles its input facts, in one batch, for however many candidates a
 * request holds.
 */
import { inArray, sql } from 'drizzle-orm';
import { evaluatePolicy, type PolicySubject, type PolicyVerdict, type WorkspacePolicy } from '@/lib/domain/policy';
import { db, schema } from '@/lib/infrastructure/postgres/client';

/** True when the policy cannot refuse anything: skip the fact-gathering. */
export function policyIsOpen(policy: WorkspacePolicy): boolean {
  return (
    policy.mode === null &&
    policy.blockedLibraries.length === 0 &&
    Object.values(policy.sourceTypes).every((enabled) => enabled !== false)
  );
}

export async function policyVerdicts(
  policy: WorkspacePolicy,
  libraryIds: string[],
): Promise<Map<string, PolicyVerdict>> {
  const verdicts = new Map<string, PolicyVerdict>();
  if (libraryIds.length === 0) return verdicts;

  const database = db();
  const libraries = await database
    .select({
      id: schema.library.id,
      publicId: schema.library.publicId,
      ownerWorkspaceId: schema.library.ownerWorkspaceId,
      isPlatformLibrary: schema.library.isPlatformLibrary,
      lastSuccessfulRefreshAt: schema.library.lastSuccessfulRefreshAt,
    })
    .from(schema.library)
    .where(inArray(schema.library.id, libraryIds));

  const sources = await database
    .select({ libraryId: schema.source.libraryId, type: schema.source.type })
    .from(schema.source)
    .where(inArray(schema.source.libraryId, libraryIds));
  const sourceTypes = new Map<string, string[]>();
  for (const row of sources) {
    const list = sourceTypes.get(row.libraryId) ?? [];
    list.push(row.type);
    sourceTypes.set(row.libraryId, list);
  }

  const scores = await database
    .select({
      libraryId: schema.libraryScore.libraryId,
      trustScore: schema.libraryScore.trustScore,
    })
    .from(schema.libraryScore)
    .where(inArray(schema.libraryScore.libraryId, libraryIds))
    .orderBy(sql`${schema.libraryScore.computedAt} desc`);
  const newestScore = new Map<string, number>();
  for (const row of scores) {
    if (!newestScore.has(row.libraryId)) newestScore.set(row.libraryId, row.trustScore);
  }

  for (const library of libraries) {
    const subject: PolicySubject = {
      publicId: library.publicId,
      sourceTypes: sourceTypes.get(library.id) ?? [],
      trustScore: newestScore.get(library.id) ?? 0,
      /* Platform libraries are curated; user libraries are verified by claim. */
      verified: library.isPlatformLibrary || library.ownerWorkspaceId !== null,
      ageDays: library.lastSuccessfulRefreshAt
        ? Math.max(0, (Date.now() - library.lastSuccessfulRefreshAt.getTime()) / 86_400_000)
        : null,
    };
    verdicts.set(library.id, evaluatePolicy(policy, subject));
  }
  return verdicts;
}

/** The single-library form Context Retrieval uses. */
export async function policyVerdictFor(
  policy: WorkspacePolicy,
  libraryId: string,
): Promise<PolicyVerdict> {
  const verdicts = await policyVerdicts(policy, [libraryId]);
  return verdicts.get(libraryId) ?? { allowed: true, reason: 'allowed' };
}
