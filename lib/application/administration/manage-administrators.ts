/**
 * Use cases behind the administrators screen: list, invite, enrol, change role,
 * change status, revoke sessions, reset the second factor.
 *
 * requirement.md 5.3 asks for least-privilege roles, invitation, deactivation
 * and enforced MFA, and requires every sensitive action to record the operator,
 * the target, the values before and after, the reason, the result, the time and
 * a summary of the network origin. `recordAudit` takes all of that; the callers
 * here supply it.
 */
import { and, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  AdminChangeRefused,
  ADMIN_PASSWORD_MIN_LENGTH,
  normalizeReason,
  capabilitiesForRoles,
  inviteExpiryFrom,
  isAcceptableAdminPassword,
  isAdminRoleId,
  isInviteLive,
  refuseLastSuperAdmin,
  refuseSelfChange,
  type AdminRoleId,
  type AdminStatus,
} from '@/lib/domain/admin';
import { base32Encode, totpProvisioningUri, verifyTotpCounter } from '@/lib/domain/totp';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { seal } from '@/lib/infrastructure/crypto/sealed';
import { hmacSha256, hmacSha256Bytes, randomToken } from '@/lib/infrastructure/crypto/tokens';
import { likePattern } from './like-pattern';
import { hashAdminPassword } from './password';
import { recordAudit } from './audit';

function signingSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SIGNING_SECRET is not set (needs at least 32 characters)');
  }
  return secret;
}

/** Same "never store the secret itself" rule the session tokens follow. */
function inviteTokenHash(token: string): Promise<string> {
  return hmacSha256(signingSecret(), `admin-invite:${token}`);
}

/**
 * The TOTP secret an invitation is worth, derived rather than chosen.
 *
 * It used to be minted per render and carried back through a hidden form field,
 * which meant the browser decided what got stored: a caller could post a
 * one-byte secret and reach `active` with a second factor worth 256 guesses.
 * Deriving it from the invitation token under the server's signing key removes
 * the client from the decision entirely, and as a bonus makes it stable across
 * reloads -- the same invitation always shows the same secret.
 *
 * 20 bytes is what RFC 4226 recommends for HMAC-SHA1.
 */
async function secretForInvite(token: string): Promise<string> {
  const bytes = await hmacSha256Bytes(signingSecret(), `admin-totp:${token}`);
  return base32Encode(bytes.slice(0, 20));
}

export interface AdministratorRow {
  id: string;
  username: string;
  email: string;
  roles: AdminRoleId[];
  status: AdminStatus;
  lastActiveAt: Date | null;
  createdAt: Date;
  mfaEnrolled: boolean;
  /** Live console sessions, so an operator can see what revoking would end. */
  activeSessions: number;
  inviteExpiresAt: Date | null;
}

export async function listAdministrators(query?: string): Promise<AdministratorRow[]> {
  const database = db();
  const term = query?.trim();
  const pattern = term ? likePattern(term) : '';
  const filter = term
    ? or(
        ilike(schema.administrator.username, pattern),
        ilike(schema.administrator.email, pattern),
      )
    : undefined;

  const rows = await database
    .select({
      id: schema.administrator.id,
      username: schema.administrator.username,
      email: schema.administrator.email,
      status: schema.administrator.status,
      lastActiveAt: schema.administrator.lastActiveAt,
      createdAt: schema.administrator.createdAt,
      mfaEnrolledAt: schema.administrator.mfaEnrolledAt,
      inviteExpiresAt: schema.administrator.inviteExpiresAt,
    })
    .from(schema.administrator)
    .where(filter)
    .orderBy(schema.administrator.createdAt);

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  /*
   * Roles and session counts in one query each rather than per row: the list is
   * small today, but a per-row query is the kind of thing that only shows up as
   * a problem once there are enough administrators to care.
   */
  const roleRows = await database
    .select({
      administratorId: schema.administratorRole.administratorId,
      roleId: schema.administratorRole.roleId,
    })
    .from(schema.administratorRole)
    .where(inArray(schema.administratorRole.administratorId, ids));

  const now = new Date();
  const sessionRows = await database
    .select({
      administratorId: schema.adminSession.administratorId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.adminSession)
    .where(
      and(
        inArray(schema.adminSession.administratorId, ids),
        isNull(schema.adminSession.revokedAt),
        sql`${schema.adminSession.expiresAt} > ${now}`,
      ),
    )
    .groupBy(schema.adminSession.administratorId);

  const rolesById = new Map<string, AdminRoleId[]>();
  for (const role of roleRows) {
    if (!isAdminRoleId(role.roleId)) continue;
    const list = rolesById.get(role.administratorId) ?? [];
    list.push(role.roleId);
    rolesById.set(role.administratorId, list);
  }
  const sessionsById = new Map(sessionRows.map((row) => [row.administratorId, row.count]));

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    email: row.email,
    roles: rolesById.get(row.id) ?? [],
    status: (row.status as AdminStatus) ?? 'invited',
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
    mfaEnrolled: row.mfaEnrolledAt !== null,
    activeSessions: sessionsById.get(row.id) ?? 0,
    inviteExpiresAt: row.inviteExpiresAt,
  }));
}

/** Postgres `unique_violation`. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

interface Actor {
  administratorId: string;
  email: string;
  clientAddress?: string | null;
}

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/**
 * Serialises the last-super-admin guard with the write it protects.
 *
 * The guard used to be a plain read before the transaction opened, so two
 * operators demoting each other both counted the other as "another active
 * super admin", both passed, and both wrote -- leaving zero. Locking the
 * target row and every active super admin `FOR UPDATE`, in one id-ordered
 * statement, makes concurrent demotions take the same locks in the same
 * order: the loser waits here, and the recount that follows (a fresh
 * statement, so it sees the winner's committed write) refuses it.
 */
async function lockLastSuperAdminGuardRows(tx: Tx, targetId: string): Promise<void> {
  await tx
    .select({ id: schema.administrator.id })
    .from(schema.administrator)
    .where(
      or(
        eq(schema.administrator.id, targetId),
        and(
          eq(schema.administrator.status, 'active'),
          sql`exists (
            select 1 from ${schema.administratorRole}
            where ${schema.administratorRole.administratorId} = ${schema.administrator.id}
              and ${schema.administratorRole.roleId} = 'super'
          )`,
        ),
      ),
    )
    .orderBy(schema.administrator.id)
    .for('update');
}

async function countOtherActiveSuperAdmins(tx: Tx, targetId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.administratorRole)
    .innerJoin(
      schema.administrator,
      eq(schema.administrator.id, schema.administratorRole.administratorId),
    )
    .where(
      and(
        eq(schema.administratorRole.roleId, 'super'),
        eq(schema.administrator.status, 'active'),
        ne(schema.administrator.id, targetId),
      ),
    );
  return row?.count ?? 0;
}

async function loadTarget(administratorId: string) {
  const [row] = await db()
    .select({
      id: schema.administrator.id,
      username: schema.administrator.username,
      email: schema.administrator.email,
      status: schema.administrator.status,
    })
    .from(schema.administrator)
    .where(eq(schema.administrator.id, administratorId))
    .limit(1);
  if (!row) throw new AdminChangeRefused('not_found', 'no such administrator');

  const roles = (
    await db()
      .select({ roleId: schema.administratorRole.roleId })
      .from(schema.administratorRole)
      .where(eq(schema.administratorRole.administratorId, administratorId))
  )
    .map((role) => role.roleId)
    .filter(isAdminRoleId);

  return { ...row, roles };
}

export interface InviteResult {
  administratorId: string;
  /** Shown once; only its digest is stored. */
  enrolmentPath: string;
  expiresAt: Date;
}

export async function inviteAdministrator(input: {
  actor: Actor;
  email: string;
  username: string;
  role: string;
}): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  if (!email.includes('@') || email.length > 254 || username.length === 0 || username.length > 80) {
    throw new AdminChangeRefused('invalid_input', 'email and username are required');
  }
  if (!isAdminRoleId(input.role)) {
    throw new AdminChangeRefused('invalid_input', 'unknown role');
  }

  const database = db();
  const [existing] = await database
    .select({ id: schema.administrator.id })
    .from(schema.administrator)
    .where(eq(schema.administrator.email, email))
    .limit(1);
  if (existing) {
    throw new AdminChangeRefused('email_taken', 'that address is already an administrator');
  }

  const now = new Date();
  const token = randomToken();
  const administratorId = crypto.randomUUID();
  const expiresAt = inviteExpiryFrom(now);

  try {
    await database.transaction(async (tx) => {
      await tx.insert(schema.administrator).values({
        id: administratorId,
        username,
        email,
        passwordHash: null,
        status: 'invited',
        inviteTokenHash: await inviteTokenHash(token),
        inviteExpiresAt: expiresAt,
        invitedBy: input.actor.administratorId,
      });
      await tx.insert(schema.administratorRole).values({ administratorId, roleId: input.role });
    });
  } catch (error) {
    /*
     * The check above is a read followed by a write, so two invitations to the
     * same address can both pass it. The unique index is what actually holds
     * the line; catching its violation is what turns the loser of that race
     * into the accurate answer instead of a generic "check the form".
     */
    if (isUniqueViolation(error)) {
      throw new AdminChangeRefused('email_taken', 'that address is already an administrator');
    }
    throw error;
  }

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: 'admin.invite',
    targetType: 'administrator',
    targetId: email,
    afterValue: { username, role: input.role, status: 'invited' },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });

  return { administratorId, enrolmentPath: `/admin/enroll?token=${token}`, expiresAt };
}

export async function changeAdministratorRole(input: {
  actor: Actor;
  administratorId: string;
  role: string;
  reason: string;
}): Promise<void> {
  if (!isAdminRoleId(input.role)) {
    throw new AdminChangeRefused('invalid_input', 'unknown role');
  }
  const reason = normalizeReason(input.reason);
  refuseSelfChange(input.actor.administratorId, input.administratorId);

  const target = await loadTarget(input.administratorId);

  const database = db();
  await database.transaction(async (tx) => {
    await lockLastSuperAdminGuardRows(tx, target.id);
    refuseLastSuperAdmin({
      targetIsSuper: target.roles.includes('super') && input.role !== 'super',
      otherActiveSuperAdmins: await countOtherActiveSuperAdmins(tx, target.id),
    });

    await tx
      .delete(schema.administratorRole)
      .where(eq(schema.administratorRole.administratorId, target.id));
    await tx
      .insert(schema.administratorRole)
      .values({ administratorId: target.id, roleId: input.role });
    /*
     * A narrower role has to take effect now, not at the end of an eight-hour
     * session: the point of the change is that this person should no longer
     * reach those screens.
     */
    await tx
      .update(schema.adminSession)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.adminSession.administratorId, target.id),
          isNull(schema.adminSession.revokedAt),
        ),
      );
  });

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: 'admin.change_role',
    targetType: 'administrator',
    targetId: target.email,
    reason,
    beforeValue: { roles: target.roles, capabilities: capabilitiesForRoles(target.roles) },
    afterValue: { roles: [input.role], capabilities: capabilitiesForRoles([input.role]) },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });
}

export async function setAdministratorStatus(input: {
  actor: Actor;
  administratorId: string;
  status: Extract<AdminStatus, 'active' | 'disabled'>;
  reason: string;
}): Promise<void> {
  const reason = normalizeReason(input.reason);
  refuseSelfChange(input.actor.administratorId, input.administratorId);

  const target = await loadTarget(input.administratorId);

  /*
   * An invited administrator is outside this control in both directions. They
   * become active by finishing enrolment, not by decree -- and disabling them
   * used to strand the account: status moved off `invited`, which made the
   * invitation unusable, while `email_taken` blocked a fresh one, leaving a row
   * nobody could sign in as and nobody could fix from the console.
   */
  if (target.status === 'invited') {
    throw new AdminChangeRefused('invalid_input', 'an invited administrator must finish enrolment');
  }

  const database = db();
  await database.transaction(async (tx) => {
    if (input.status === 'disabled') {
      await lockLastSuperAdminGuardRows(tx, target.id);
      refuseLastSuperAdmin({
        targetIsSuper: target.roles.includes('super'),
        otherActiveSuperAdmins: await countOtherActiveSuperAdmins(tx, target.id),
      });
    }

    await tx
      .update(schema.administrator)
      .set({ status: input.status, failedAttempts: 0, lockedUntil: null })
      .where(eq(schema.administrator.id, target.id));
    if (input.status === 'disabled') {
      // requirement.md 3.2: disabling takes effect at once, not at expiry.
      await tx
        .update(schema.adminSession)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.adminSession.administratorId, target.id),
            isNull(schema.adminSession.revokedAt),
          ),
        );
    }
  });

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: input.status === 'disabled' ? 'admin.disable' : 'admin.enable',
    targetType: 'administrator',
    targetId: target.email,
    reason,
    beforeValue: { status: target.status },
    afterValue: { status: input.status },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });
}

export async function revokeAdministratorSessions(input: {
  actor: Actor;
  administratorId: string;
  reason: string;
}): Promise<number> {
  const reason = normalizeReason(input.reason);
  const target = await loadTarget(input.administratorId);

  const revoked = await db()
    .update(schema.adminSession)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.adminSession.administratorId, target.id),
        isNull(schema.adminSession.revokedAt),
      ),
    )
    .returning({ id: schema.adminSession.id });

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: 'admin.revoke_sessions',
    targetType: 'administrator',
    targetId: target.email,
    reason,
    afterValue: { revokedSessions: revoked.length },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });

  return revoked.length;
}

export interface MfaResetResult {
  /** Shown once; only its digest is stored. Same shape as an invitation. */
  enrolmentPath: string;
  expiresAt: Date;
  revokedSessions: number;
}

/**
 * Clear an administrator's second factor and send them back through
 * enrolment.
 *
 * A lost authenticator has no self-service recovery on purpose: MFA is
 * mandatory (requirement.md 3.2), so the only way back in is another super
 * administrator vouching for the person, which is what this is. It clears
 * the sealed secret, ends every console session, returns the account to
 * `invited` and mints a fresh single-use enrolment link -- the same path a new
 * administrator takes, so the account cannot become `active` again without
 * proving a working second factor (`completeEnrolment`).
 *
 * Refused on oneself: an administrator who resets their own factor and loses
 * the link is locked out with nobody entitled to let them back in -- the same
 * reasoning as `refuseSelfChange`. Ask a colleague.
 */
export async function resetAdministratorMfa(input: {
  actor: Actor;
  administratorId: string;
  reason: string;
}): Promise<MfaResetResult> {
  const reason = normalizeReason(input.reason);
  refuseSelfChange(input.actor.administratorId, input.administratorId);

  const target = await loadTarget(input.administratorId);
  if (target.status !== 'active') {
    throw new AdminChangeRefused(
      'not_enrolled',
      'only an active, enrolled administrator has a second factor to reset',
    );
  }

  const now = new Date();
  const token = randomToken();
  const expiresAt = inviteExpiryFrom(now);
  let revokedSessions = 0;

  await db().transaction(async (tx) => {
    /*
     * Conditional on the row still being `active`, so two operators resetting
     * the same account cannot both mint a link: the second updates nothing
     * and is told the account is no longer enrolled.
     */
    const reset = await tx
      .update(schema.administrator)
      .set({
        mfaSecret: null,
        mfaEnrolledAt: null,
        mfaLastCounter: null,
        status: 'invited',
        inviteTokenHash: await inviteTokenHash(token),
        inviteExpiresAt: expiresAt,
        invitedBy: input.actor.administratorId,
        failedAttempts: 0,
        lockedUntil: null,
      })
      .where(and(eq(schema.administrator.id, target.id), eq(schema.administrator.status, 'active')))
      .returning({ id: schema.administrator.id });
    if (reset.length === 0) {
      throw new AdminChangeRefused('not_enrolled', 'that administrator is no longer enrolled');
    }

    /* requirement.md 3.2: a cleared factor takes effect now, not at expiry. */
    const revoked = await tx
      .update(schema.adminSession)
      .set({ revokedAt: now })
      .where(
        and(
          eq(schema.adminSession.administratorId, target.id),
          isNull(schema.adminSession.revokedAt),
        ),
      )
      .returning({ id: schema.adminSession.id });
    revokedSessions = revoked.length;
  });

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: 'admin.reset_mfa',
    targetType: 'administrator',
    targetId: target.email,
    reason,
    beforeValue: { status: target.status, mfaEnrolled: true },
    afterValue: {
      status: 'invited',
      mfaEnrolled: false,
      revokedSessions,
      inviteExpiresAt: expiresAt.toISOString(),
    },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });

  return { enrolmentPath: `/admin/enroll?token=${token}`, expiresAt, revokedSessions };
}

export interface EnrolmentOffer {
  administratorId: string;
  email: string;
  username: string;
  /** Base32, shown once so it can be typed into an authenticator app. */
  secret: string;
  provisioningUri: string;
}

/**
 * What a live invitation is worth: who it is for, and the TOTP secret it binds.
 *
 * The secret is derived from the token, not minted here, so rendering this page
 * twice shows the same one and `completeEnrolment` can recompute it without
 * being told.
 */
export async function offerEnrolment(token: string): Promise<EnrolmentOffer> {
  const [row] = await db()
    .select({
      id: schema.administrator.id,
      email: schema.administrator.email,
      username: schema.administrator.username,
      status: schema.administrator.status,
      inviteExpiresAt: schema.administrator.inviteExpiresAt,
    })
    .from(schema.administrator)
    .where(eq(schema.administrator.inviteTokenHash, await inviteTokenHash(token)))
    .limit(1);

  if (!row || row.status !== 'invited' || !isInviteLive(row.inviteExpiresAt, new Date())) {
    throw new AdminChangeRefused('invite_invalid', 'invitation is unknown, used or expired');
  }

  const secret = await secretForInvite(token);
  return {
    administratorId: row.id,
    email: row.email,
    username: row.username,
    secret,
    provisioningUri: totpProvisioningUri({ secret, account: row.email, issuer: 're0' }),
  };
}

/**
 * Completes an invitation: the invitee sets a password and proves they have
 * loaded the TOTP secret by entering a current code.
 *
 * Proving the code before the account goes active is what makes MFA mandatory
 * rather than aspirational -- an account can never reach `active` without a
 * working second factor (requirement.md 3.2).
 */
export async function completeEnrolment(input: {
  token: string;
  password: string;
  mfaCode: string;
  clientAddress?: string | null;
}): Promise<void> {
  if (!isAcceptableAdminPassword(input.password)) {
    throw new AdminChangeRefused(
      'weak_password',
      `password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
    );
  }

  const now = new Date();
  const database = db();
  const [row] = await database
    .select({
      id: schema.administrator.id,
      email: schema.administrator.email,
      status: schema.administrator.status,
      inviteExpiresAt: schema.administrator.inviteExpiresAt,
    })
    .from(schema.administrator)
    .where(eq(schema.administrator.inviteTokenHash, await inviteTokenHash(input.token)))
    .limit(1);

  if (!row || row.status !== 'invited' || !isInviteLive(row.inviteExpiresAt, now)) {
    throw new AdminChangeRefused('invite_invalid', 'invitation is unknown, used or expired');
  }

  // Recomputed from the token: the caller has no say in which secret is bound.
  const secret = await secretForInvite(input.token);
  const counter = await verifyTotpCounter(secret, input.mfaCode, now);
  if (counter === null) {
    throw new AdminChangeRefused('invalid_input', 'that code does not match the secret');
  }

  /*
   * Conditional on the row still being `invited`, so two submissions of the
   * same invitation cannot both write: the second updates nothing and is told
   * the account is already enrolled, rather than silently rebinding a factor
   * the first one already confirmed.
   */
  const claimed = await database
    .update(schema.administrator)
    .set({
      passwordHash: await hashAdminPassword(input.password),
      mfaSecret: await seal(secret),
      mfaEnrolledAt: now,
      mfaLastCounter: counter,
      status: 'active',
      // Single use: the invitation stops being a way in the moment it is spent.
      inviteTokenHash: null,
      inviteExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
    })
    .where(and(eq(schema.administrator.id, row.id), eq(schema.administrator.status, 'invited')))
    .returning({ id: schema.administrator.id });

  if (claimed.length === 0) {
    throw new AdminChangeRefused('already_enrolled', 'that invitation was already completed');
  }

  await recordAudit({
    administratorId: row.id,
    action: 'admin.enrol',
    targetType: 'administrator',
    targetId: row.email,
    afterValue: { status: 'active', mfaEnrolled: true },
    clientAddress: input.clientAddress ?? null,
    result: 'success',
  });
}
