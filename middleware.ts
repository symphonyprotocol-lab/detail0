import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_SESSION_LIFETIME_MS } from '@/lib/domain/admin';
import { SESSION_LIFETIME_MS } from '@/lib/domain/auth';

/**
 * Cheap gate in front of the dashboard.
 *
 * This only looks for the presence of a session cookie: it saves anonymous
 * visitors a render, nothing more. The real check -- session live, account
 * active, workspace resolved -- happens in the dashboard layout against the
 * primary database, because permission state must not be decided on a cookie's
 * word (architecture.md 5.2, 16).
 *
 * The console gets the same treatment against its own cookie, and the two
 * never cross: a product session cookie is not an admin one, so it does not
 * open `/admin` even here (requirement.md 3.2). The real console check lives in
 * `app/admin/(console)/layout.tsx`. Capturing the path here is also what lets
 * the sign-in send an administrator back where they were headed.
 */
const SESSION_COOKIES = ['__Host-r0_session', 'r0_session'];
const ADMIN_COOKIES = ['__Secure-r0_admin', 'r0_admin'];

/**
 * Re-issues the session cookie with its window moved out again.
 *
 * The session row's expiry slides on use (lib/domain/auth.ts, admin.ts), and
 * the browser's copy has to slide with it or the cookie dies on the sign-in
 * date while the row is still live. Same value, same attributes, new
 * `Expires`; the row stays the only authority on whether the session is
 * alive -- a cookie that outlives its row simply resolves to nothing.
 * Set-Cookie on every gated request is the price of not needing a response
 * hook in every server component.
 */
function slideCookie(
  request: NextRequest,
  response: NextResponse,
  names: readonly string[],
  path: '/' | '/admin',
  lifetimeMs: number,
): NextResponse {
  for (const name of names) {
    const value = request.cookies.get(name)?.value;
    if (!value) continue;
    response.cookies.set(name, value, {
      httpOnly: true,
      /* The prefixed names exist only on https deployments (lib/http/session.ts). */
      secure: name.startsWith('__'),
      sameSite: 'lax',
      path,
      expires: new Date(Date.now() + lifetimeMs),
    });
  }
  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  /* Query string included: `safeReturnTo` preserves it on the way back. */
  const returnTo = path + request.nextUrl.search;

  if (path.startsWith('/admin')) {
    if (ADMIN_COOKIES.some((name) => request.cookies.has(name))) {
      return slideCookie(
        request,
        NextResponse.next(),
        ADMIN_COOKIES,
        '/admin',
        ADMIN_SESSION_LIFETIME_MS,
      );
    }
    const signIn = new URL('/admin/login', request.url);
    signIn.searchParams.set('returnTo', returnTo);
    return NextResponse.redirect(signIn);
  }

  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    return slideCookie(request, NextResponse.next(), SESSION_COOKIES, '/', SESSION_LIFETIME_MS);
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('returnTo', returnTo);
  return NextResponse.redirect(login);
}

export const config = {
  /*
   * Three console paths are excluded, each anchored so the exclusion cannot
   * widen to a future `/admin/login-history`: the sign-in, which would
   * otherwise redirect to itself; the sign-out, which has to answer a POST
   * rather than be bounced once the cookie is already gone; and enrolment,
   * which an invited administrator reaches before they have any session at all.
   */
  matcher: ['/dashboard/:path*', '/admin/((?!login$|login/|sign-out$|enroll$).*)'],
};
