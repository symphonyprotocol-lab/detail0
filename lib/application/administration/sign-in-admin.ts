/**
 * Use case: turn an administrator's credentials into a console session.
 *
 * Three checks, in this order and all of them mandatory: the account is usable,
 * the password verifies, the second factor verifies (requirement.md 3.2 --
 * the console enforces MFA, it is not opt-in). Whatever happens, the attempt is
 * written to the audit log (requirement.md 5.3).
 */
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import {
  AdminAuthFailure,
  ADMIN_LOCKOUT_MS,
  ADMIN_MAX_FAILED_ATTEMPTS,
  adminSessionExpiryFrom,
  isAdminRoleId,
  isLockedOut,
  type AdminRoleId,
} from '@/lib/domain/admin';
import { verifyTotpCounter } from '@/lib/domain/totp';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { unseal } from '@/lib/infrastructure/crypto/sealed';
import { randomToken } from '@/lib/infrastructure/crypto/tokens';
import { adminSessionTokenHash } from './admin-session-token';
import { decoyPasswordHash, verifyAdminPassword } from './password';
import { recordAudit } from './audit';

export interface SignInAdminInput {
  email: string;
  password: string;
  mfaCode: string;
  clientSummary?: Record<string, string>;
  clientAddress?: string | null;
}

export interface SignInAdminResult {
  token: string;
  expiresAt: Date;
  administratorId: string;
}

const SIGN_IN_ACTION = 'admin.sign_in';

/**
 * Records the attempt and refuses it.
 *
 * `email` is always the normalized address, never the caller's raw casing, so
 * a later audit search by the address stored on the account finds the failures
 * as well as the successes.
 *
 * Every caller passes `invalid_credentials`: the real reason goes to the audit
 * log, the browser is told the one generic thing (see ADMIN_LOGIN_ERRORS).
 */
async function fail(
  email: string,
  clientAddress: string | null,
  administratorId: string | null,
  reason: string,
): Promise<never> {
  await recordAudit({
    administratorId,
    action: SIGN_IN_ACTION,
    targetType: 'administrator',
    // The address, not the id: a failed attempt often has no id to point at.
    targetId: email,
    reason,
    clientAddress,
    result: 'failure',
  });
  throw new AdminAuthFailure('invalid_credentials', reason);
}

export async function signInAdmin(input: SignInAdminInput): Promise<SignInAdminResult> {
  const database = db();
  const now = new Date();
  const email = input.email.trim().toLowerCase();
  const clientAddress = input.clientAddress ?? null;

  const [account] = await database
    .select({
      id: schema.administrator.id,
      email: schema.administrator.email,
      passwordHash: schema.administrator.passwordHash,
      mfaSecret: schema.administrator.mfaSecret,
      mfaEnrolledAt: schema.administrator.mfaEnrolledAt,
      mfaLastCounter: schema.administrator.mfaLastCounter,
      status: schema.administrator.status,
      lockedUntil: schema.administrator.lockedUntil,
    })
    .from(schema.administrator)
    .where(eq(schema.administrator.email, email))
    .limit(1);

  /*
   * An unknown address still pays for a full Argon2id verification. Returning
   * early here would make "no such administrator" measurably faster than "wrong
   * password" and turn the sign-in into an account enumerator.
   */
  if (!account) {
    await verifyAdminPassword(input.password, await decoyPasswordHash());
    return fail(email, clientAddress, null, 'no such administrator');
  }

  /*
   * A locked account is refused before any verification: the lock exists to
   * stop an attacker spending our CPU on Argon2id, so doing the work anyway
   * would defeat it. The caller is told the same generic thing either way.
   */
  if (isLockedOut(account.lockedUntil, now)) {
    return fail(email, clientAddress, account.id, 'account locked out');
  }

  /*
   * An invited account has no password yet, and a disabled one must not be able
   * to use the password it still has. Both still pay for a verification against
   * the decoy so their timing matches an active account's.
   */
  if (account.status !== 'active' || account.passwordHash === null) {
    await verifyAdminPassword(input.password, account.passwordHash ?? (await decoyPasswordHash()));
    return fail(
      email,
      clientAddress,
      account.id,
      account.passwordHash === null ? 'enrolment not completed' : `account status ${account.status}`,
    );
  }

  const passwordOk = await verifyAdminPassword(input.password, account.passwordHash);

  /*
   * MFA is not optional and not skippable: an account without an enrolled
   * secret cannot sign in at all, rather than falling back to password only.
   * The matched step is carried out of here so it can be marked as spent.
   */
  const secret = account.mfaSecret ? await unseal<string>(account.mfaSecret) : null;
  const mfaCounter =
    account.mfaEnrolledAt !== null && secret !== null
      ? await verifyTotpCounter(secret, input.mfaCode, now, {
          minCounter: account.mfaLastCounter,
        })
      : null;

  if (!passwordOk || mfaCounter === null) {
    /*
     * Counted in SQL, not read-modify-written in the app: attempts arriving in
     * parallel would otherwise each read the same value and overwrite one
     * another, so a burst of guesses would never reach the threshold.
     */
    const [updated] = await database
      .update(schema.administrator)
      .set({
        failedAttempts: sql`${schema.administrator.failedAttempts} + 1`,
        lockedUntil: sql`CASE WHEN ${schema.administrator.failedAttempts} + 1 >= ${ADMIN_MAX_FAILED_ATTEMPTS}
          THEN now() + (${ADMIN_LOCKOUT_MS} || ' milliseconds')::interval
          ELSE ${schema.administrator.lockedUntil} END`,
      })
      .where(eq(schema.administrator.id, account.id))
      .returning({ failedAttempts: schema.administrator.failedAttempts });

    const detail = !passwordOk
      ? 'password mismatch'
      : account.mfaEnrolledAt === null
        ? 'mfa not enrolled'
        : 'mfa code mismatch or already spent';
    return fail(
      email,
      clientAddress,
      account.id,
      `${detail} (${updated?.failedAttempts ?? '?'}/${ADMIN_MAX_FAILED_ATTEMPTS})`,
    );
  }

  const token = randomToken();
  const expiresAt = adminSessionExpiryFrom(now);

  const claimed = await database.transaction(async (tx) => {
    /*
     * The step is burned first, and only by whoever still finds it unspent.
     * `verifyTotpCounter` compared against a counter read at the top of this
     * function, so two sign-ins carrying the same code both passed that check
     * and both reached here: without the predicate, both wrote the counter and
     * both got a session out of one code. Counted in SQL for the same reason
     * the failure counter above is -- the read and the write have to be one
     * statement, or the value read is already stale.
     */
    const [burned] = await tx
      .update(schema.administrator)
      .set({
        failedAttempts: 0,
        lockedUntil: null,
        lastActiveAt: now,
        mfaLastCounter: mfaCounter,
      })
      .where(
        and(
          eq(schema.administrator.id, account.id),
          or(
            isNull(schema.administrator.mfaLastCounter),
            lt(schema.administrator.mfaLastCounter, mfaCounter),
          ),
        ),
      )
      .returning({ id: schema.administrator.id });

    if (!burned) return false;

    await tx.insert(schema.adminSession).values({
      id: crypto.randomUUID(),
      administratorId: account.id,
      tokenHash: await adminSessionTokenHash(token),
      clientSummary: input.clientSummary ?? {},
      lastSeenAt: now,
      expiresAt,
    });
    return true;
  });

  if (!claimed) {
    return fail(email, clientAddress, account.id, 'mfa code mismatch or already spent');
  }

  await recordAudit({
    administratorId: account.id,
    action: SIGN_IN_ACTION,
    targetType: 'administrator',
    targetId: account.email,
    clientAddress,
    result: 'success',
  });

  return { token, expiresAt, administratorId: account.id };
}

/** Roles granted to one administrator, as domain ids. */
export async function rolesFor(administratorId: string): Promise<AdminRoleId[]> {
  const rows = await db()
    .select({ roleId: schema.administratorRole.roleId })
    .from(schema.administratorRole)
    .where(eq(schema.administratorRole.administratorId, administratorId));
  return rows.map((row) => row.roleId).filter(isAdminRoleId);
}

/** Revokes one live console session. Used by sign-out. */
export async function revokeAdminSession(token: string, now: Date = new Date()): Promise<void> {
  await db()
    .update(schema.adminSession)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.adminSession.tokenHash, await adminSessionTokenHash(token)),
        isNull(schema.adminSession.revokedAt),
      ),
    );
}
