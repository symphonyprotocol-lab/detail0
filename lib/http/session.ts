/**
 * Web-facing session plumbing: cookie names and attributes, the redirect for
 * pages that require a session, and the CSRF origin check for the auth POSTs.
 *
 * The Next.js specifics stop here; `lib/application/auth` stays framework free.
 */
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextResponse } from 'next/server';
import { resolveSession, type UserSession } from '@/lib/application/auth';
/* The names and the secure predicate live in a dependency-free module, because
   the Edge middleware slides these same cookies and cannot import this file --
   it used to restate them from memory instead. Re-exported here so every
   existing importer keeps its one obvious source. */
import { HANDSHAKE_COOKIE, isSecureDeployment, SESSION_COOKIE } from '@/lib/http/cookie-names';

export { HANDSHAKE_COOKIE, isSecureDeployment, SESSION_COOKIE };

export function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) throw new Error('APP_BASE_URL is not set');
  return url.replace(/\/+$/, '');
}

export function callbackUrl(provider: string): string {
  return `${appBaseUrl()}/api/auth/${provider}/callback`;
}

interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge?: number;
  expires?: Date;
}

function baseCookieOptions(): CookieOptions {
  return { httpOnly: true, secure: isSecureDeployment(), sameSite: 'lax', path: '/' };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(SESSION_COOKIE, token, { ...baseCookieOptions(), expires: expiresAt });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', { ...baseCookieOptions(), maxAge: 0 });
}

export function setHandshakeCookie(response: NextResponse, value: string, expiresAt: number): void {
  response.cookies.set(HANDSHAKE_COOKIE, value, {
    ...baseCookieOptions(),
    expires: new Date(expiresAt),
  });
}

export function clearHandshakeCookie(response: NextResponse): void {
  response.cookies.set(HANDSHAKE_COOKIE, '', { ...baseCookieOptions(), maxAge: 0 });
}

/**
 * The session behind the current request, or null. Server components only.
 *
 * Memoised for the request, as `currentAdminSession` is.
 *
 * A dashboard render resolves the session in the layout and again in the page
 * -- two session+workspace joins and, inside the sliding window, two writes --
 * for one navigation. `cache()` collapses them; nothing is shared between
 * requests, because React's cache is per-request.
 */
export const currentSession = cache(async (): Promise<UserSession | null> => {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
});

/**
 * Session for surfaces that merely decorate themselves with it.
 *
 * The marketing header only chooses between two links, so a database that is
 * unreachable degrades it to the anonymous state instead of taking the public
 * site down. Gated surfaces must keep using `requireSession`, which fails
 * closed.
 */
export async function optionalSession(): Promise<UserSession | null> {
  try {
    return await currentSession();
  } catch (error) {
    console.warn(`session lookup failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return null;
  }
}

/** Same, but sends anonymous callers to the login page with a return path. */
export async function requireSession(returnTo: string): Promise<UserSession> {
  const session = await currentSession();
  if (session) return session;
  redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

/**
 * CSRF guard for the auth POSTs (architecture.md 15.3).
 *
 * A cross-site form post carries the attacker's Origin, or none at all on some
 * clients; both are refused. SameSite=Lax already blocks the session cookie
 * from riding along, this closes the login-CSRF case as well.
 */
export async function isSameOrigin(): Promise<boolean> {
  const headerBag = await headers();
  const origin = headerBag.get('origin');
  if (origin) return origin === appBaseUrl();

  const referer = headerBag.get('referer');
  if (!referer) return false;
  try {
    return new URL(referer).origin === new URL(appBaseUrl()).origin;
  } catch {
    return false;
  }
}

/**
 * Coarse client fingerprint stored with the session.
 *
 * Browser family only. Plain IPs must not reach product storage, so none is
 * recorded here (architecture.md 11.2, requirement.md 12).
 */
export function clientSummary(userAgent: string | null): Record<string, string> {
  if (!userAgent) return {};
  const family = /Firefox\//.test(userAgent)
    ? 'firefox'
    : /Edg\//.test(userAgent)
      ? 'edge'
      : /Chrome\//.test(userAgent)
        ? 'chrome'
        : /Safari\//.test(userAgent)
          ? 'safari'
          : 'other';
  return { browser: family };
}
