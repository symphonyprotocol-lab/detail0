/**
 * Platform library rules, as pure functions. No Next.js, no driver, no fetch.
 *
 * A platform library is one detail0 publishes itself: requirement.md 5.3 gives
 * the console four verbs over it -- create, refresh, suspend and publish -- and
 * nothing else. The distinction from a user library is not cosmetic:
 *
 * - it has no `owner_workspace_id`, and must never acquire one. Ownership is
 *   written only by a verified claim or an admin ruling (architecture.md 5.4),
 *   and a library the platform publishes has no claimant;
 * - it does not take part in revenue share (requirement.md 4.4), precisely
 *   because it has no owner to pay;
 * - it skips public review. The review queue exists to decide whether a
 *   stranger's library may be public (architecture.md 8.2, `Evaluating -->
 *   Publishing: private or platform library`), which is not a question about
 *   our own, so its lifecycle never passes through `submitted` or `reviewing`.
 *
 * Everything here decides whether a proposed change is allowed at all, so the
 * console, the tests and any future admin API answer the same way.
 */

/* ------------------------------------------------------------------ sources */

/**
 * The source types a platform library may be created from.
 *
 * Narrower than the `source_type` enum on purpose. `markdown` and `pdf` are
 * uploads -- they arrive through object storage, not through a location an
 * operator can type -- so a console form that offered them would be offering a
 * library that can never fetch anything.
 */
export const PLATFORM_SOURCE_TYPES = ['github', 'website', 'llms_txt', 'openapi', 'notion'] as const;

export type PlatformSourceType = (typeof PLATFORM_SOURCE_TYPES)[number];

export function isPlatformSourceType(value: unknown): value is PlatformSourceType {
  return typeof value === 'string' && (PLATFORM_SOURCE_TYPES as readonly string[]).includes(value);
}

/**
 * How often the ingestion side should re-check the source.
 *
 * Stored on `source.refresh_policy`, which is free-form JSON; these are the
 * three cadences the console offers, so the column holds a value the refresh
 * worker can act on rather than whatever a form happened to post.
 */
export const REFRESH_POLICIES = ['daily', 'weekly', 'manual'] as const;

export type RefreshPolicy = (typeof REFRESH_POLICIES)[number];

export function isRefreshPolicy(value: unknown): value is RefreshPolicy {
  return typeof value === 'string' && (REFRESH_POLICIES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------- library ids */

/**
 * The Library ID namespace each source type publishes under. requirement.md 6.1
 * fixes four shapes and this is the whole mapping:
 *
 * - a Git repository is `/owner/repository`;
 * - a crawled site, and the `llms.txt` that describes one, are `/websites/slug`;
 * - a Notion space is `/notion/slug`;
 * - anything else the platform assembles -- an OpenAPI document included -- is
 *   `/docs/slug`, the namespace requirement.md reserves for uploaded material.
 */
const ID_NAMESPACE: Record<PlatformSourceType, 'repository' | 'websites' | 'notion' | 'docs'> = {
  github: 'repository',
  website: 'websites',
  llms_txt: 'websites',
  openapi: 'docs',
  notion: 'notion',
};

export function namespaceFor(type: PlatformSourceType): string {
  const namespace = ID_NAMESPACE[type];
  return namespace === 'repository' ? '/owner/repository' : `/${namespace}/slug`;
}

/**
 * A slug segment: lowercase, and only the characters that survive a URL path
 * unescaped. Case is folded rather than rejected because `/websites/NextJS`
 * and `/websites/nextjs` differing as two libraries is a trap, not a feature.
 */
const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** A GitHub owner or repository name, as GitHub itself allows them. */
const REPO_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * Owner names a repository library may not take, because they are already
 * namespaces.
 *
 * requirement.md 6.1 gives each source type its own prefix, which only works if
 * the prefixes are disjoint. `/owner/repository` has no prefix of its own, so
 * without this a repository owned by an org called `websites` would publish at
 * `/websites/thing` -- the same id a crawled site gets, and the first of the
 * two to be created would silently own it.
 */
const RESERVED_OWNERS = new Set(['websites', 'docs', 'notion']);

/**
 * Normalizes a typed Library ID, or returns null if it does not belong to this
 * source type's namespace.
 *
 * Normalizing rather than merely checking: an operator who types
 * `websites/nextjs` or `/websites/NextJS/` means the same library both times,
 * and the `library_public_id_uq` index only stops the duplicate if both spell
 * it the same way.
 */
export function normalizePublicId(type: PlatformSourceType, input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  if (trimmed.includes('//') || trimmed.includes('..')) return null;

  const segments = (trimmed.startsWith('/') ? trimmed.slice(1) : trimmed).split('/');
  const namespace = ID_NAMESPACE[type];

  if (namespace === 'repository') {
    if (segments.length !== 2) return null;
    const [owner, repository] = segments;
    if (!owner || !repository) return null;
    if (!REPO_SEGMENT.test(owner) || !REPO_SEGMENT.test(repository)) return null;
    if (RESERVED_OWNERS.has(owner.toLowerCase())) return null;
    return `/${owner}/${repository}`;
  }

  if (segments.length !== 2) return null;
  const [prefix, slug] = segments;
  if (prefix !== namespace) return null;
  const folded = (slug ?? '').toLowerCase();
  return SLUG.test(folded) ? `/${namespace}/${folded}` : null;
}

/* ---------------------------------------------------------------- locations */

/**
 * Normalizes the place a source is fetched from.
 *
 * A GitHub source is a repository, so `owner/repo` and the browser URL a person
 * would paste both reduce to `owner/repo`. Everything else is fetched over the
 * network, and only over `https` -- an ingestion worker that follows `http` for
 * a library the platform publishes under its own name is a content-integrity
 * problem, not a convenience.
 */
export function normalizeLocation(type: PlatformSourceType, input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return null;

  if (type === 'github') {
    const withoutHost = trimmed
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
    const segments = withoutHost.split('/');
    if (segments.length !== 2) return null;
    const [owner, repository] = segments;
    if (!owner || !repository) return null;
    return REPO_SEGMENT.test(owner) && REPO_SEGMENT.test(repository)
      ? `${owner}/${repository}`
      : null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes('.')) return null;
  return url.toString();
}

/* ---------------------------------------------------------------- lifecycle */

/**
 * The lifecycle states a platform library can be in.
 *
 * A subset of `lifecycle_status`: the review states are unreachable for a
 * library that is not reviewed, and this is what the console filters on.
 */
export const PLATFORM_LIFECYCLE_STATES = ['draft', 'published', 'suspended', 'archived'] as const;

export type PlatformLifecycleState = (typeof PLATFORM_LIFECYCLE_STATES)[number];

export function isPlatformLifecycleState(value: unknown): value is PlatformLifecycleState {
  return (
    typeof value === 'string' && (PLATFORM_LIFECYCLE_STATES as readonly string[]).includes(value)
  );
}

/** What an operator may set from the console. Archiving is not one of them. */
export const PLATFORM_LIFECYCLE_ACTIONS = ['publish', 'suspend'] as const;

export type PlatformLifecycleAction = (typeof PLATFORM_LIFECYCLE_ACTIONS)[number];

export function isPlatformLifecycleAction(value: unknown): value is PlatformLifecycleAction {
  return (
    typeof value === 'string' && (PLATFORM_LIFECYCLE_ACTIONS as readonly string[]).includes(value)
  );
}

export function lifecycleTarget(action: PlatformLifecycleAction): PlatformLifecycleState {
  return action === 'publish' ? 'published' : 'suspended';
}

/**
 * Whether an action is available from a given state, ignoring index readiness.
 *
 * Publishing is reachable from `draft` and from `suspended` -- restoring a
 * paused library is the same decision as publishing it the first time, and
 * giving it a separate verb would mean a separate audit action for what the
 * operator experiences as one thing.
 */
export function lifecycleActionAvailable(
  state: PlatformLifecycleState,
  action: PlatformLifecycleAction,
): boolean {
  return action === 'publish'
    ? state === 'draft' || state === 'suspended'
    : state === 'published';
}

/* ------------------------------------------------------------------ errors */

/**
 * Why a change to a platform library was refused.
 *
 * Specific rather than coarse: unlike a sign-in, the caller is an entitled
 * operator looking at the record, and a generic failure would send them to the
 * logs to find out which field was wrong.
 */
export const PLATFORM_LIBRARY_ERRORS = [
  'not_found',
  'not_platform_library',
  'invalid_title',
  'invalid_public_id',
  'public_id_taken',
  'unsupported_source',
  'invalid_location',
  'invalid_refresh_policy',
  'invalid_metadata',
  'invalid_transition',
  'no_ready_version',
  'archived',
  'reason_required',
  'unavailable',
] as const;

export type PlatformLibraryError = (typeof PLATFORM_LIBRARY_ERRORS)[number];

export function isPlatformLibraryError(value: unknown): value is PlatformLibraryError {
  return (
    typeof value === 'string' && (PLATFORM_LIBRARY_ERRORS as readonly string[]).includes(value)
  );
}

export class PlatformLibraryRefused extends Error {
  constructor(
    readonly code: PlatformLibraryError,
    message: string,
  ) {
    super(message);
    this.name = 'PlatformLibraryRefused';
  }
}

/* ------------------------------------------------------------------ drafts */

export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 400;
export const TAG_MAX_LENGTH = 40;
export const LANGUAGE_MAX_LENGTH = 40;

/** A validated create, ready to insert. */
export interface PlatformLibraryDraft {
  publicId: string;
  title: string;
  description: string | null;
  domainTag: string | null;
  language: string | null;
  sourceType: PlatformSourceType;
  location: string;
  refreshPolicy: RefreshPolicy;
}

export interface PlatformLibraryInput {
  title: string;
  publicId: string;
  sourceType: string;
  location: string;
  refreshPolicy: string;
  description?: string;
  domainTag?: string;
  language?: string;
}

/**
 * Validates one create, field by field, and throws the first refusal.
 *
 * Ordered so the operator is told about the field they are most likely to have
 * got wrong first: the source type decides which Library IDs and locations are
 * even legal, so a wrong type would otherwise be reported as a wrong id.
 */
export function draftPlatformLibrary(input: PlatformLibraryInput): PlatformLibraryDraft {
  if (!isPlatformSourceType(input.sourceType)) {
    throw new PlatformLibraryRefused('unsupported_source', 'unsupported source type');
  }
  const sourceType = input.sourceType;

  const title = input.title.trim();
  if (title.length === 0 || title.length > TITLE_MAX_LENGTH) {
    throw new PlatformLibraryRefused('invalid_title', 'a title is required');
  }

  const publicId = normalizePublicId(sourceType, input.publicId);
  if (!publicId) {
    throw new PlatformLibraryRefused(
      'invalid_public_id',
      `a ${sourceType} library is published under ${namespaceFor(sourceType)}`,
    );
  }

  const location = normalizeLocation(sourceType, input.location);
  if (!location) {
    throw new PlatformLibraryRefused('invalid_location', 'the source location is not usable');
  }

  if (!isRefreshPolicy(input.refreshPolicy)) {
    throw new PlatformLibraryRefused('invalid_refresh_policy', 'unknown refresh policy');
  }

  const description = optional(input.description, DESCRIPTION_MAX_LENGTH);
  const domainTag = optional(input.domainTag, TAG_MAX_LENGTH);
  const language = optional(input.language, LANGUAGE_MAX_LENGTH);

  return {
    publicId,
    title,
    description,
    domainTag,
    language,
    sourceType,
    location,
    refreshPolicy: input.refreshPolicy,
  };
}

/**
 * An optional free-text field: empty becomes null, over-long is refused.
 *
 * Refused rather than truncated. These are descriptions and tags shown in the
 * public catalogue, and silently cutting one in half produces a record that
 * looks like the operator wrote it that way.
 */
function optional(value: string | undefined, max: number): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw new PlatformLibraryRefused('invalid_metadata', 'a field is longer than allowed');
  }
  return trimmed;
}
