/**
 * POST /api/auth/logout -- revoke the current session.
 *
 * Revoking server side matters: clearing the cookie alone would leave a live
 * row that a copied cookie could still use (requirement.md 3.2).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/lib/application/auth';
import { clearSessionCookie, isSameOrigin, SESSION_COOKIE } from '@/lib/http/session';
import { appRedirect } from '@/lib/http/auth-endpoints';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await isSameOrigin())) {
    return new NextResponse('cross-origin request refused', { status: 403 });
  }

  await signOut(request.cookies.get(SESSION_COOKIE)?.value);

  const response = appRedirect('/');
  clearSessionCookie(response);
  return response;
}
