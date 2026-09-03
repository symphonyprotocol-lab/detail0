/**
 * The workspace policy evaluator. architecture.md 10.
 *
 * One pure function decides whether a workspace's policy admits a library,
 * and Library Search, Context Retrieval and the web all call it -- never a
 * re-implementation (10.2). The verdict carries a stable reason code; call
 * records store the code and nothing else.
 *
 * Precedence, in order and deliberately asymmetric (10.2):
 *
 *   1. source-type switches and the blocklist refuse first, and nothing
 *      overrides them -- not even "always allow";
 *   2. select mode admits only the allowlist;
 *   3. "always allow" (excepted) bypasses ONLY the quality thresholds below;
 *   4. quality thresholds: verified, trust score, staleness.
 *
 * What is NOT this module's job: private ownership, safety suspension,
 * account deactivation and credential revocation are enforced by the
 * retrieval chain before the policy is ever consulted (10.2 lists them as
 * non-overridable for exactly that reason -- they are not policy at all).
 *
 * The repo and website metrics of 10.1 (stars, licenses, backlinks) are
 * accepted in the stored shape but not yet evaluated: the ingestion pipeline
 * does not carry those source metrics yet. Evaluating a threshold against a
 * value that is never populated would silently block everything or nothing.
 */

export const POLICY_REASONS = [
  'allowed',
  'source_type_disabled',
  'library_blocked',
  'not_in_allowlist',
  'unverified_library',
  'below_trust_threshold',
  'stale_library',
] as const;

export type PolicyReason = (typeof POLICY_REASONS)[number];

export interface WorkspacePolicy {
  mode: 'quality' | 'select' | null;
  /** Source types absent from the map are enabled; false disables. */
  sourceTypes: Record<string, boolean>;
  quality: {
    requireVerified: boolean;
    minTrustScore: number | null;
    maxAgeDays: number | null;
  };
  /** Library public ids. */
  blockedLibraries: string[];
  exceptedLibraries: string[];
  allowedLibraries: string[];
}

/** The policy of a workspace that never configured one: everything admits. */
export const OPEN_POLICY: WorkspacePolicy = {
  mode: null,
  sourceTypes: {},
  quality: { requireVerified: false, minTrustScore: null, maxAgeDays: null },
  blockedLibraries: [],
  exceptedLibraries: [],
  allowedLibraries: [],
};

export interface PolicySubject {
  publicId: string;
  /** Every source type the library ingests from. */
  sourceTypes: string[];
  trustScore: number;
  /** Claimed by a verified owner, or platform-curated. */
  verified: boolean;
  /** Days since the content was last refreshed; null when unknown. */
  ageDays: number | null;
}

export interface PolicyVerdict {
  allowed: boolean;
  reason: PolicyReason;
}

export function evaluatePolicy(policy: WorkspacePolicy, subject: PolicySubject): PolicyVerdict {
  /*
   * A library whose chunks include content from any disabled source type is
   * refused outright: chunks from several sources are co-mingled in one
   * version, so admitting the library would admit the disabled source.
   */
  if (subject.sourceTypes.some((type) => policy.sourceTypes[type] === false)) {
    return { allowed: false, reason: 'source_type_disabled' };
  }

  if (listedIn(policy.blockedLibraries, subject.publicId)) {
    return { allowed: false, reason: 'library_blocked' };
  }

  if (policy.mode === 'select') {
    return listedIn(policy.allowedLibraries, subject.publicId)
      ? { allowed: true, reason: 'allowed' }
      : { allowed: false, reason: 'not_in_allowlist' };
  }

  if (policy.mode === 'quality') {
    if (listedIn(policy.exceptedLibraries, subject.publicId)) {
      return { allowed: true, reason: 'allowed' };
    }
    if (policy.quality.requireVerified && !subject.verified) {
      return { allowed: false, reason: 'unverified_library' };
    }
    if (policy.quality.minTrustScore !== null && subject.trustScore < policy.quality.minTrustScore) {
      return { allowed: false, reason: 'below_trust_threshold' };
    }
    if (
      policy.quality.maxAgeDays !== null &&
      subject.ageDays !== null &&
      subject.ageDays > policy.quality.maxAgeDays
    ) {
      return { allowed: false, reason: 'stale_library' };
    }
  }

  return { allowed: true, reason: 'allowed' };
}

/* ---------------------------------------------------------- list entries */

/**
 * Whether one allow/block/except entry covers a library.
 *
 * An entry is a Library ID, or a prefix: `/websites/ethereum/*` covers
 * `/websites/ethereum` and every library nested under it (requirement.md 6.1
 * nests the slug namespaces). The star is only meaningful as a whole trailing
 * segment; `/websites/eth*` is not a pattern and matches nothing, which the
 * contract schema refuses before it gets here.
 */
export function libraryEntryMatches(entry: string, publicId: string): boolean {
  if (!entry.endsWith('/*')) return entry === publicId;
  const base = entry.slice(0, -2);
  return publicId === base || publicId.startsWith(`${base}/`);
}

export function listedIn(entries: readonly string[], publicId: string): boolean {
  return entries.some((entry) => libraryEntryMatches(entry, publicId));
}
