/**
 * Platform library rules, as pure functions. No Next.js, no driver, no fetch.
 *
 * A platform library is one re0 publishes itself: requirement.md 5.3 gives
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
 *
 * The three slug namespaces nest: `/websites/ethereum/whitepaper` is a library
 * of its own, grouped under `/websites/ethereum` in the catalogue. A repository
 * id is always exactly `/owner/repository`, because its third segment has
 * meant "version" since requirement.md 6.1 -- and for the nested namespaces a
 * trailing segment still can: `libraryIdCandidates` below says how the two
 * readings are told apart.
 */
const ID_NAMESPACE: Record<PlatformSourceType, 'repository' | 'websites' | 'notion' | 'docs'> = {
  github: 'repository',
  website: 'websites',
  llms_txt: 'websites',
  openapi: 'docs',
  notion: 'notion',
};

/** The raw id namespace a non-repository source publishes under. */
export function idNamespace(type: PlatformSourceType): 'repository' | 'websites' | 'notion' | 'docs' {
  return ID_NAMESPACE[type];
}

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

/**
 * How deep a nested id may go, in slug segments after the namespace.
 * `/websites/a/b/c/d` is the deepest allowed. Grouping wants two or three
 * levels; anything deeper is a path, not a name.
 */
export const MAX_NESTED_SLUGS = 4;

/**
 * The slug a title suggests, so the wizard can fill the id in as the title is
 * typed instead of asking for it twice. Runs of anything outside the slug
 * alphabet fold to one dash, accents drop their marks first (`Café` gives
 * `cafe`), and the result is clipped to a segment's length. A title with no
 * usable characters -- one written in Chinese, say -- gives '' and the id has
 * to be typed; `normalizePublicId` is still the check on what was typed.
 */
export function slugFromTitle(title: string): string {
  const folded = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-+$/, '');
  const clipped = folded.slice(0, 64).replace(/-+$/, '');
  return SLUG.test(clipped) && !isVersionLabelShaped(clipped) ? clipped : '';
}

/**
 * The shape `versionLabel` in lib/domain/ingestion.ts produces: a UTC date, a
 * digest prefix, an optional build number. A nested slug may not look like
 * one, because `/websites/ethereum/<label>` must keep meaning "that version of
 * `/websites/ethereum`" (requirement.md 6.1), and a library created at that id
 * would shadow it.
 */
const VERSION_LABEL_SHAPE = /^\d{8}-[0-9a-f]{8}(\.\d+)?$/;

export function isVersionLabelShaped(segment: string): boolean {
  return VERSION_LABEL_SHAPE.test(segment);
}

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

  if (segments.length < 2 || segments.length > 1 + MAX_NESTED_SLUGS) return null;
  const [prefix, ...slugs] = segments;
  if (prefix !== namespace) return null;
  const folded = slugs.map((slug) => slug.toLowerCase());
  if (!folded.every((slug) => SLUG.test(slug))) return null;
  /* Only the last segment can be mistaken for a version; the ones before it
     are always a library's, and are refused too so the rule reads simply. */
  if (folded.some(isVersionLabelShaped)) return null;
  return `/${namespace}/${folded.join('/')}`;
}

/* ------------------------------------------------------------- nesting */

/**
 * The id a nested library is grouped under, or null at the top of its
 * namespace. `/websites/ethereum/whitepaper` is under `/websites/ethereum`;
 * `/websites/ethereum` and `/vercel/next.js` are under nothing.
 */
export function parentPublicId(publicId: string): string | null {
  const segments = publicId.split('/').filter(Boolean);
  if (segments.length <= 2) return null;
  return `/${segments.slice(0, -1).join('/')}`;
}

export interface LibraryIdCandidate {
  publicId: string;
  /** The segments left over if `publicId` is the library, as a version label. */
  versionLabel: string | null;
}

/**
 * The ways a typed id can be read, longest library first.
 *
 * `/websites/ethereum/whitepaper` is either the library of that name, or the
 * `whitepaper` version of `/websites/ethereum`. A nested id and a pinned
 * version share one grammar, so the reading is decided by what exists: the
 * caller looks the candidates up and takes the first that is a library. Two
 * segments is the floor -- every library has at least a namespace and a slug,
 * or an owner and a repository.
 */
export function libraryIdCandidates(input: string): LibraryIdCandidate[] {
  const segments = input.split('/').filter(Boolean);
  const candidates: LibraryIdCandidate[] = [];
  for (let length = segments.length; length >= 2; length -= 1) {
    candidates.push({
      publicId: `/${segments.slice(0, length).join('/')}`,
      versionLabel: length === segments.length ? null : segments.slice(length).join('/'),
    });
  }
  return candidates;
}

/**
 * Orders a list so each library is followed by the libraries nested under it,
 * keeping the list's own order among siblings and among top-level entries.
 * A nested library whose parent is not in the list stays where it was: the
 * catalogue only groups what it is showing.
 */
export function groupNestedIds<T>(items: readonly T[], idOf: (item: T) => string): T[] {
  const present = new Set(items.map(idOf));
  const children = new Map<string, T[]>();
  const roots: T[] = [];

  for (const item of items) {
    const parent = nearestPresentAncestor(idOf(item), present);
    if (parent === null) {
      roots.push(item);
    } else {
      children.set(parent, [...(children.get(parent) ?? []), item]);
    }
  }

  const ordered: T[] = [];
  const emit = (item: T) => {
    ordered.push(item);
    for (const child of children.get(idOf(item)) ?? []) emit(child);
  };
  for (const root of roots) emit(root);
  return ordered;
}

/** The closest ancestor id that is in `present`, walking up one segment at a time. */
function nearestPresentAncestor(publicId: string, present: ReadonlySet<string>): string | null {
  for (let parent = parentPublicId(publicId); parent !== null; parent = parentPublicId(parent)) {
    if (present.has(parent)) return parent;
  }
  return null;
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
  'no_version',
  'source_not_found',
  'last_source',
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

/* ------------------------------------------------------------------- edits */

/** A validated metadata edit, ready to update. */
export interface PlatformLibraryEdit {
  publicId: string;
  title: string;
  description: string | null;
  domainTag: string | null;
  language: string | null;
}

export interface PlatformLibraryEditInput {
  /** The type the library was created under. Its namespace is immutable. */
  sourceType: PlatformSourceType;
  title: string;
  publicId: string;
  description?: string;
  domainTag?: string;
  language?: string;
}

/**
 * Validates an edit of the fields the catalogue shows.
 *
 * The Library ID is editable, and deliberately so: requirement.md 6.1 says a
 * slug change keeps a redirect, which is only meaningful if a slug can change
 * at all. What it may not do is leave its namespace -- the namespace is decided
 * by the source type (requirement.md 6.1), and moving `/websites/x` to
 * `/docs/x` would be a different kind of library wearing the same row.
 *
 * The source type itself is not editable here. Changing it would invalidate
 * every version already built from the old one, and the honest way to do that
 * is a new library.
 */
export function editPlatformLibrary(input: PlatformLibraryEditInput): PlatformLibraryEdit {
  const title = input.title.trim();
  if (title.length === 0 || title.length > TITLE_MAX_LENGTH) {
    throw new PlatformLibraryRefused('invalid_title', 'a title is required');
  }

  const publicId = normalizePublicId(input.sourceType, input.publicId);
  if (!publicId) {
    throw new PlatformLibraryRefused(
      'invalid_public_id',
      `a ${input.sourceType} library is published under ${namespaceFor(input.sourceType)}`,
    );
  }

  return {
    publicId,
    title,
    description: optional(input.description, DESCRIPTION_MAX_LENGTH),
    domainTag: optional(input.domainTag, TAG_MAX_LENGTH),
    language: optional(input.language, LANGUAGE_MAX_LENGTH),
  };
}

/* ----------------------------------------------------------------- sources */

/** A validated source, ready to insert or update. */
export interface PlatformSourceDraft {
  type: PlatformSourceType;
  location: string;
  refreshPolicy: RefreshPolicy;
}

/**
 * Validates one source of a platform library.
 *
 * Shares `normalizeLocation` with the create form rather than re-deriving the
 * rules, so a location the create form refuses cannot arrive through the edit
 * one. requirement.md 6.1 allows a library more than one source, which is why
 * this exists apart from `draftPlatformLibrary`.
 */
export function draftPlatformSource(input: {
  type: string;
  location: string;
  refreshPolicy: string;
}): PlatformSourceDraft {
  if (!isPlatformSourceType(input.type)) {
    throw new PlatformLibraryRefused('unsupported_source', 'unsupported source type');
  }
  const location = normalizeLocation(input.type, input.location);
  if (!location) {
    throw new PlatformLibraryRefused('invalid_location', 'the source location is not usable');
  }
  if (!isRefreshPolicy(input.refreshPolicy)) {
    throw new PlatformLibraryRefused('invalid_refresh_policy', 'unknown refresh policy');
  }
  return { type: input.type, location, refreshPolicy: input.refreshPolicy };
}
