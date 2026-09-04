/**
 * Session cookie identity, shared between the Edge middleware and the Node
 * handlers that issue the cookies.
 *
 * Its own module because `lib/http/session.ts` and `lib/http/admin.ts` pull in
 * `next/headers`, `next/navigation` and the Postgres client, none of which the
 * Edge runtime can carry -- so the middleware used to restate the names and
 * attributes from memory. Two lists that must agree and nothing checking that
 * they do: renaming a cookie, changing its path or its SameSite would have
 * left the middleware re-issuing the old one with the old attributes.
 *
 * No imports, so both runtimes can have it.
 */

export function isSecureDeployment(): boolean {
  return (process.env.APP_BASE_URL ?? '').startsWith('https://');
}

/**
 * `__Host-` pins the cookie to this exact origin, but the prefix requires
 * Secure, which http://localhost cannot satisfy. Production gets the hardened
 * name, local development the plain one.
 */
export const SESSION_COOKIE = isSecureDeployment() ? '__Host-r0_session' : 'r0_session';
export const HANDSHAKE_COOKIE = isSecureDeployment() ? '__Host-r0_oauth' : 'r0_oauth';

/**
 * `__Host-` is unavailable for the console because that prefix forbids a path
 * other than `/`, and the narrower path is worth more here than the prefix.
 */
export const ADMIN_SESSION_COOKIE = isSecureDeployment() ? '__Secure-r0_admin' : 'r0_admin';

/**
 * Both spellings of each cookie.
 *
 * A deployment only ever issues one of the two, but the middleware reads
 * whatever the browser sends, and a deployment that gains https keeps the old
 * name in circulation until each visitor's cookie is replaced.
 */
export const SESSION_COOKIE_NAMES = ['__Host-r0_session', 'r0_session'] as const;
export const ADMIN_SESSION_COOKIE_NAMES = ['__Secure-r0_admin', 'r0_admin'] as const;
