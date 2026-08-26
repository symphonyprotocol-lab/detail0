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
  | 'plans'
  | 'billing'
  | 'administrators'
  | 'audit';

export const ADMIN_CAPABILITIES: readonly AdminCapability[] = [
  'users',
  'libraries',
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
  operator: ['users', 'libraries', 'plans', 'billing'],
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
