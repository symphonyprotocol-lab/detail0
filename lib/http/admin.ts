/**
 * Web-facing plumbing for the admin console.
 *
 * Mirrors `lib/http/session` for the other authority: the cookie name and its
 * attributes live here, the decision lives in `lib/application/administration`,
 * and everything fails closed -- an unresolved session is sent to the console's
 * own sign-in, never to the product one.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextResponse } from 'next/server';
import { cache } from 'react';
import { resolveAdminSession, type AdminSession } from '@/lib/application/administration';
import { ADMIN_SESSION_ABSOLUTE_MS, type AdminCapability } from '@/lib/domain/admin';
import { isSecureDeployment } from '@/lib/http/session';

/**
 * Separate from the product session cookie, and scoped to `/admin`.
 *
 * The path is not cosmetic: the console cookie is simply not sent to product
 * routes, so a bug in a public handler cannot pick it up (requirement.md 3.2).
 * It does mean every handler that needs to *read* the session has to live under
 * `/admin` -- which is why sign-out is `/admin/sign-out` and not an
 * `/api/admin/...` route.
 */
export const ADMIN_SESSION_COOKIE = isSecureDeployment() ? '__Secure-r0_admin' : 'r0_admin';

interface AdminCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/admin';
  expires?: Date;
  maxAge?: number;
}

/**
 * `SameSite=Lax` rather than `Strict`: the sign-in POST redirects back into the
 * console, and Strict would withhold the cookie on that first navigation.
 * `__Host-` is unavailable because that prefix forbids a path other than `/`,
 * and the narrower path is worth more here than the prefix.
 */
function baseCookieOptions(): AdminCookieOptions {
  return { httpOnly: true, secure: isSecureDeployment(), sameSite: 'lax', path: '/admin' };
}

export function setAdminSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    ...baseCookieOptions(),
    expires: expiresAt,
    // Belt and braces: the session dies with the row regardless of the cookie.
    maxAge: Math.floor(ADMIN_SESSION_ABSOLUTE_MS / 1000),
  });
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_SESSION_COOKIE, '', { ...baseCookieOptions(), maxAge: 0 });
}

/**
 * The console session behind the current request, or null. Server components only.
 *
 * Deduplicated per request: the shell resolves it and so does any screen that
 * needs the capability list, and resolving twice would mean a second round trip
 * plus a second `last_seen_at` write for one page render.
 */
export const currentAdminSession = cache(async (): Promise<AdminSession | null> => {
  const jar = await cookies();
  try {
    return await resolveAdminSession(jar.get(ADMIN_SESSION_COOKIE)?.value);
  } catch (error) {
    /*
     * Fails closed, unlike `optionalSession`. A database the console cannot
     * reach means permission state cannot be checked, and an unchecked console
     * is worse than an unavailable one.
     */
    console.warn(
      `admin session lookup failed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
    return null;
  }
});

/** Same, but sends everyone else to the console's sign-in. */
export async function requireAdmin(returnTo?: string): Promise<AdminSession> {
  const session = await currentAdminSession();
  if (session) return session;
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  redirect(`/admin/login${query}`);
}

/**
 * A session that actually reaches this screen.
 *
 * Least privilege only exists if it is checked on the way in: resolving
 * capabilities and then rendering the page anyway makes the permission matrix a
 * drawing (requirement.md 3.1, 5.3). Every console screen except the overview
 * names the capability it needs.
 *
 * An administrator who is signed in but not entitled goes to the overview
 * rather than the sign-in -- they are authenticated, so asking them to
 * authenticate again would be a lie about what went wrong.
 */
export async function requireAdminCapability(
  capability: AdminCapability,
  returnTo?: string,
): Promise<AdminSession> {
  const session = await requireAdmin(returnTo);
  if (!session.capabilities.includes(capability)) redirect('/admin/overview');
  return session;
}
