/**
 * Administration rules, as pure functions. No Next.js, no driver, no fetch.
 *
 * The console is a separate authority from the product: its own entrance, its
 * own credentials, a mandatory second factor, and a session that must not be
 * usable as a product session (requirement.md 3.2, 5.3).
 */

export type AdminCapability =
  | 'users'
  | 'libraries'
  | 'platformLibraries'
  | 'plans'
  | 'billing'
  | 'administrators'
  | 'audit';

export const ADMIN_CAPABILITIES: readonly AdminCapability[] = [
  'users',
  'libraries',
  'platformLibraries',
  'plans',
  'billing',
  'administrators',
  'audit',
];

export type AdminRoleId = 'super' | 'operator' | 'reviewer' | 'support';

export const ADMIN_ROLE_IDS: readonly AdminRoleId[] = ['super', 'operator', 'reviewer', 'support'];

/**
 * Least privilege, as requirement.md 3.1 and 5.3 describe the preset roles:
 * only the super administrator reaches everything, and each other role reaches
 * exactly what its job needs. This is the single source for both the console's
 * permission matrix and any server-side capability check.
 */
const ROLE_CAPABILITIES: Record<AdminRoleId, readonly AdminCapability[]> = {
  super: ADMIN_CAPABILITIES,
  operator: ['users', 'libraries', 'platformLibraries', 'plans', 'billing'],
  /*
   * `libraries` and `platformLibraries` are separate capabilities because
   * requirement.md 3.1 gives them to different people: a Reviewer decides
   * whether a *user's* public library may ship, while creating, refreshing,
   * suspending and publishing the platform's own libraries is the Operator's
   * job. One capability covering both would let a reviewer publish a library
   * under re0's name.
   */
  reviewer: ['libraries'],
  support: ['users'],
};

export function capabilitiesForRoles(roles: readonly AdminRoleId[]): AdminCapability[] {
  const granted = new Set<AdminCapability>();
  for (const role of roles) {
    for (const capability of ROLE_CAPABILITIES[role] ?? []) granted.add(capability);
  }
  return ADMIN_CAPABILITIES.filter((capability) => granted.has(capability));
}

export function roleAllows(role: AdminRoleId, capability: AdminCapability): boolean {
  return (ROLE_CAPABILITIES[role] ?? []).includes(capability);
}

export function isAdminRoleId(value: unknown): value is AdminRoleId {
  return typeof value === 'string' && (ADMIN_ROLE_IDS as readonly string[]).includes(value);
}

/**
 * Admin sessions are far shorter-lived than product sessions.
 *
 * A product session trades some risk for convenience over 30 days; a console
 * session holds the power to suspend accounts and rewrite plan quotas, so it
 * expires within a working day and idles out over a coffee break.
 */
export const ADMIN_SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const ADMIN_SESSION_IDLE_MS = 30 * 60 * 1000;
/** `last_seen_at` is rewritten at most this often, to keep reads read-mostly. */
export const ADMIN_SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

/** Failed attempts before the account stops answering, and for how long. */
export const ADMIN_MAX_FAILED_ATTEMPTS = 5;
export const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;

export interface AdminSessionRow {
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export function isAdminSessionLive(session: AdminSessionRow, now: Date): boolean {
  if (session.revokedAt !== null) return false;
  if (session.expiresAt.getTime() <= now.getTime()) return false;
  return now.getTime() - session.lastSeenAt.getTime() < ADMIN_SESSION_IDLE_MS;
}

export function shouldTouchAdminSession(session: AdminSessionRow, now: Date): boolean {
  return now.getTime() - session.lastSeenAt.getTime() >= ADMIN_SESSION_TOUCH_INTERVAL_MS;
}

export function adminSessionExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + ADMIN_SESSION_ABSOLUTE_MS);
}

export function isLockedOut(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

export function lockoutUntil(failedAttempts: number, now: Date): Date | null {
  return failedAttempts >= ADMIN_MAX_FAILED_ATTEMPTS
    ? new Date(now.getTime() + ADMIN_LOCKOUT_MS)
    : null;
}

/**
 * Stable, user-facing failure codes for the console sign-in.
 *
 * Deliberately coarse. The form takes address, password and code together, so
 * one generic answer for all three costs a mistyping administrator nothing and
 * denies an attacker the oracle that a separate "wrong code" reply would be
 * -- it would confirm the password was right (architecture.md 5.4).
 *
 * There is deliberately no `locked` code either: telling an unauthenticated
 * caller that an address is locked tells them the address is an administrator,
 * which is exactly the enumeration the decoy password hash exists to prevent.
 * The lockout is real, it is recorded in the audit log, and the browser is told
 * the same thing it is told for a typo.
 */
export const ADMIN_LOGIN_ERRORS = ['invalid_credentials', 'rate_limited', 'unavailable'] as const;

export type AdminLoginError = (typeof ADMIN_LOGIN_ERRORS)[number];

export function isAdminLoginError(value: unknown): value is AdminLoginError {
  return typeof value === 'string' && (ADMIN_LOGIN_ERRORS as readonly string[]).includes(value);
}

/**
 * A sign-in attempt that ended for a reason the administrator may see.
 *
 * `message` is for the audit trail and our own logs; only `loginError` ever
 * reaches the browser.
 */
export class AdminAuthFailure extends Error {
  constructor(
    readonly loginError: AdminLoginError,
    message: string,
  ) {
    super(message);
    this.name = 'AdminAuthFailure';
  }
}

/**
 * Post-sign-in destinations inside the console, as prefixes.
 *
 * The same strict allow list `safeReturnTo` applies to the product, narrowed to
 * `/admin`: a console session must never be bounced onto a product page, and an
 * open redirect out of the console would be worth more to an attacker than one
 * out of the dashboard.
 */
export const ADMIN_DEFAULT_RETURN_TO = '/admin/overview';

export function safeAdminReturnTo(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 512) {
    return ADMIN_DEFAULT_RETURN_TO;
  }
  if (!input.startsWith('/admin/') || input.startsWith('//')) return ADMIN_DEFAULT_RETURN_TO;
  if (input.includes('\\')) return ADMIN_DEFAULT_RETURN_TO;
  for (const character of input) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return ADMIN_DEFAULT_RETURN_TO;
  }
  // The sign-in itself is not a destination; it would loop.
  const path = (input.split('?')[0] ?? '').split('#')[0] ?? '';
  if (path === '/admin/login') return ADMIN_DEFAULT_RETURN_TO;
  return input;
}

/* ------------------------------------------------- managing administrators */

export const ADMIN_STATUSES = ['invited', 'active', 'disabled'] as const;

export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export function isAdminStatus(value: unknown): value is AdminStatus {
  return typeof value === 'string' && (ADMIN_STATUSES as readonly string[]).includes(value);
}

/** How long an invitation stays usable before it stops being a way in. */
export const ADMIN_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function inviteExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + ADMIN_INVITE_TTL_MS);
}

export function isInviteLive(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() > now.getTime();
}

/** Minimum length for a chosen administrator password. */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_PASSWORD_MAX_LENGTH = 256;

export function isAcceptableAdminPassword(password: string): boolean {
  return (
    password.length >= ADMIN_PASSWORD_MIN_LENGTH && password.length <= ADMIN_PASSWORD_MAX_LENGTH
  );
}

/**
 * Why a change to an administrator was refused.
 *
 * Unlike the sign-in codes these are shown to a signed-in super administrator
 * who is entitled to know exactly what went wrong, so they are specific.
 */
export const ADMIN_CHANGE_ERRORS = [
  'not_found',
  'self_change',
  'last_super_admin',
  'email_taken',
  'invalid_input',
  'invite_invalid',
  'weak_password',
  'reason_required',
  'already_enrolled',
] as const;

export type AdminChangeError = (typeof ADMIN_CHANGE_ERRORS)[number];

export function isAdminChangeError(value: unknown): value is AdminChangeError {
  return typeof value === 'string' && (ADMIN_CHANGE_ERRORS as readonly string[]).includes(value);
}

export class AdminChangeRefused extends Error {
  constructor(
    readonly code: AdminChangeError,
    message: string,
  ) {
    super(message);
    this.name = 'AdminChangeRefused';
  }
}

/** An audited action has to say why. requirement.md 5.3. */
export const ADMIN_REASON_MAX_LENGTH = 200;

export function normalizeReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new AdminChangeRefused('reason_required', 'a reason is recorded with every change');
  }
  return trimmed.slice(0, ADMIN_REASON_MAX_LENGTH);
}

/**
 * Whether an administrator may act on a target.
 *
 * Two rules, and both exist to stop the console being locked shut:
 *
 * - nobody edits their own role or status, because the mistake is unrecoverable
 *   from inside the console -- there would be no one entitled to undo it;
 * - the last active super administrator cannot be demoted or disabled, for the
 *   same reason. Adding a second one first is the way past this.
 */
export function refuseSelfChange(actorId: string, targetId: string): void {
  if (actorId === targetId) {
    throw new AdminChangeRefused(
      'self_change',
      'an administrator cannot change their own role or status',
    );
  }
}

export function refuseLastSuperAdmin(input: {
  targetIsSuper: boolean;
  otherActiveSuperAdmins: number;
}): void {
  if (input.targetIsSuper && input.otherActiveSuperAdmins === 0) {
    throw new AdminChangeRefused(
      'last_super_admin',
      'the last active super administrator cannot be demoted or disabled',
    );
  }
}

/* --------------------------------------------- registered user accounts */

/**
 * What the console may set a registered account to.
 *
 * Deliberately narrower than the `user.status` column: the column is text and
 * could hold anything a future flow invents, but the two values an operator
 * decides between are enable and suspend (requirement.md 5.3).
 */
export const USER_ACCOUNT_STATUSES = ['active', 'suspended'] as const;

export type UserAccountStatus = (typeof USER_ACCOUNT_STATUSES)[number];

export function isUserAccountStatus(value: unknown): value is UserAccountStatus {
  return typeof value === 'string' && (USER_ACCOUNT_STATUSES as readonly string[]).includes(value);
}
