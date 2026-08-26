/**
 * POST /admin/sign-out -- ends the console session.
 *
 * It lives under `/admin`, not beside the sign-in under `/api/admin/auth`, and
 * that is the whole point: the session cookie is scoped to `path=/admin`, so a
 * handler outside that prefix never receives it and could only clear the
 * browser's copy while leaving the row live server side. The sign-in has the
 * opposite constraint -- it must be reachable without the cookie and without
 * the middleware redirect -- so the two endpoints sit on different paths on
 * purpose.
 *
 * POST so the request carries an Origin to check (architecture.md 15.3), and so
 * no prefetch or image tag can sign an administrator out.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  recordAudit,
  resolveAdminSession,
  revokeAdminSession,
} from '@/lib/application/administration';
import { ADMIN_SESSION_COOKIE, clearAdminSessionCookie } from '@/lib/http/admin';
import { appBaseUrl, isSameOrigin } from '@/lib/http/session';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/admin/login', appBaseUrl()), 303);

  if (!(await isSameOrigin())) return response;

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    try {
      // Resolved before revoking, so the audit entry can name who signed out.
      const session = await resolveAdminSession(token);
      await revokeAdminSession(token);
      await recordAudit({
        administratorId: session?.administratorId ?? null,
        action: 'admin.sign_out',
        targetType: 'administrator',
        targetId: session?.email ?? null,
        clientAddress:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          request.headers.get('x-real-ip'),
        result: 'success',
      });
    } catch (error) {
      // The cookie is cleared regardless: a failed revoke must not strand a session in the browser.
      console.warn(
        `admin sign-out revoke failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  clearAdminSessionCookie(response);
  return response;
}
