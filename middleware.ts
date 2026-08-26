import { NextResponse, type NextRequest } from 'next/server';

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

export function middleware(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;

  if (path.startsWith('/admin')) {
    if (ADMIN_COOKIES.some((name) => request.cookies.has(name))) return NextResponse.next();
    const signIn = new URL('/admin/login', request.url);
    signIn.searchParams.set('returnTo', path);
    return NextResponse.redirect(signIn);
  }

  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('returnTo', path);
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
