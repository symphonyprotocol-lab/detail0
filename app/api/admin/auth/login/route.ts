/**
 * POST /api/admin/auth/login -- the console's sign-in.
 *
 * Separate from `/api/auth/*` on purpose: this endpoint verifies credentials
 * we hold, where the product endpoints only start and finish an OAuth
 * handshake. Failures land back on the console sign-in with one of the coarse
 * codes from `lib/domain/admin`; the detail stays server side and in the audit
 * log (architecture.md 5.4).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { signInAdmin } from '@/lib/application/administration';
import {
  AdminAuthFailure,
  safeAdminReturnTo,
  type AdminLoginError,
} from '@/lib/domain/admin';
import { rateLimitKey } from '@/lib/http/auth-endpoints';
import { setAdminSessionCookie } from '@/lib/http/admin';
import { appBaseUrl, clientSummary, isSameOrigin } from '@/lib/http/session';
import type { RateLimitRule } from '@/lib/infrastructure/cache/redis';
import { strictRateLimit } from '@/lib/infrastructure/cache/strict-rate-limit';
import { newRequestId } from '@/lib/http/respond';

export const runtime = 'nodejs';

/**
 * Tighter than the product's auth limit: this endpoint checks a password, so
 * every attempt is a guess. Argon2id already makes each one expensive; the
 * window stops a burst from spending the server's CPU on the attacker's behalf.
 */
const ADMIN_LOGIN_RATE_RULE: RateLimitRule = { limit: 10, windowSeconds: 300 };

/**
 * Bounds on what is read from the form, applied before any work.
 *
 * The address reaches `audit_log.target_id` on every failed attempt, and that
 * table is append only and kept a year, so an unbounded field here is an
 * unauthenticated way to grow storage that is deliberately hard to prune. The
 * limits are the longest legal address (RFC 5321) and a generous passphrase.
 */
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 256;
const MAX_MFA_LENGTH = 6;

function signInRedirect(error?: AdminLoginError, returnTo?: string): NextResponse {
  const url = new URL('/admin/login', appBaseUrl());
  if (error) url.searchParams.set('error', error);
  if (returnTo && returnTo !== '/admin/overview') url.searchParams.set('returnTo', returnTo);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();

  // Lax cookies plus an Origin check: the sign-in POST cannot be forged.
  if (!(await isSameOrigin())) return signInRedirect('invalid_credentials');

  /*
   * Unlike the OAuth endpoints, this one fails *closed* -- there the limiter
   * guards a handshake that verifies nothing, here it guards a password oracle,
   * and losing the count is not an acceptable degradation. `strictRateLimit`
   * refuses when a configured Upstash stops answering, and keeps an in-process
   * floor when none is configured at all. Checked before the body is even
   * parsed, so a malformed body still spends the sender's budget.
   */
  const verdict = await strictRateLimit(
    await rateLimitKey(request, 'admin-login'),
    ADMIN_LOGIN_RATE_RULE,
  );
  if (!verdict.allowed) return signInRedirect('rate_limited');

  const form = await request.formData().catch(() => null);
  if (!form) return signInRedirect('invalid_credentials');
  const returnTo = safeAdminReturnTo(form.get('returnTo'));
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const mfaCode = String(form.get('mfa') ?? '');

  if (
    !email ||
    !password ||
    !mfaCode ||
    email.length > MAX_EMAIL_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH ||
    mfaCode.length > MAX_MFA_LENGTH
  ) {
    return signInRedirect('invalid_credentials', returnTo);
  }

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientAddress = forwarded || request.headers.get('x-real-ip') || null;

  try {
    const { token, expiresAt } = await signInAdmin({
      email,
      password,
      mfaCode,
      clientSummary: clientSummary(request.headers.get('user-agent')),
      clientAddress,
    });

    const response = NextResponse.redirect(new URL(returnTo, appBaseUrl()), 303);
    setAdminSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    if (error instanceof AdminAuthFailure) {
      console.warn(
        `admin sign-in refused code=${error.loginError} requestId=${requestId} detail=${error.message}`,
      );
      return signInRedirect(error.loginError, returnTo);
    }
    console.error(
      `admin sign-in failed requestId=${requestId} detail=${
        error instanceof Error ? error.message : 'unknown'
      }`,
    );
    return signInRedirect('unavailable', returnTo);
  }
}
