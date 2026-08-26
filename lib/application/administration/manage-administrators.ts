/**
 * Use cases behind the administrators screen: list, invite, enrol, change role,
 * change status, revoke sessions.
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
import { randomTotpSecret, totpProvisioningUri } from '@/lib/domain/totp';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { seal } from '@/lib/infrastructure/crypto/sealed';
import { hmacSha256, randomToken } from '@/lib/infrastructure/crypto/tokens';
import { hashAdminPassword } from './password';
import { recordAudit } from './audit';

/** Same "never store the secret itself" rule the session tokens follow. */
function inviteTokenHash(token: string): Promise<string> {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SIGNING_SECRET is not set (needs at least 32 characters)');
  }
  return hmacSha256(secret, `admin-invite:${token}`);
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
  const filter = term
    ? or(
        ilike(schema.administrator.username, `%${term}%`),
        ilike(schema.administrator.email, `%${term}%`),
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

interface Actor {
  administratorId: string;
  email: string;
  clientAddress?: string | null;
}

async function countOtherActiveSuperAdmins(targetId: string): Promise<number> {
  const [row] = await db()
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
  if (existing) throw new AdminChangeRefused('email_taken', 'that address is already an administrator');

  const now = new Date();
  const token = randomToken();
  const administratorId = crypto.randomUUID();
  const expiresAt = inviteExpiryFrom(now);

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
    await tx
      .insert(schema.administratorRole)
      .values({ administratorId, roleId: input.role });
  });

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
  refuseSelfChange(input.actor.administratorId, input.administratorId);

  const target = await loadTarget(input.administratorId);
  refuseLastSuperAdmin({
    targetIsSuper: target.roles.includes('super') && input.role !== 'super',
    otherActiveSuperAdmins: await countOtherActiveSuperAdmins(target.id),
  });

  const database = db();
  await database.transaction(async (tx) => {
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
    reason: input.reason.trim() || null,
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
  refuseSelfChange(input.actor.administratorId, input.administratorId);

  const target = await loadTarget(input.administratorId);
  if (input.status === 'disabled') {
    refuseLastSuperAdmin({
      targetIsSuper: target.roles.includes('super'),
      otherActiveSuperAdmins: await countOtherActiveSuperAdmins(target.id),
    });
  }

  /*
   * An invited administrator has no credential yet, so "enable" is meaningless
   * for them -- they become active by finishing enrolment, not by decree.
   */
  if (input.status === 'active' && target.status === 'invited') {
    throw new AdminChangeRefused('invalid_input', 'an invited administrator must finish enrolment');
  }

  const database = db();
  await database.transaction(async (tx) => {
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
    reason: input.reason.trim() || null,
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
    reason: input.reason.trim() || null,
    afterValue: { revokedSessions: revoked.length },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });

  return revoked.length;
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
 * Turns a live invitation into the pair of secrets the invitee has to accept:
 * their own password, and a TOTP secret. Called on render, so the secret shown
 * is the one `completeEnrolment` will store.
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

  const secret = randomTotpSecret();
  return {
    administratorId: row.id,
    email: row.email,
    username: row.username,
    secret,
    provisioningUri: totpProvisioningUri({ secret, account: row.email, issuer: 'recall0' }),
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
  secret: string;
  mfaCode: string;
  clientAddress?: string | null;
}): Promise<void> {
  const { verifyTotpCounter } = await import('@/lib/domain/totp');

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

  const counter = await verifyTotpCounter(input.secret, input.mfaCode, now);
  if (counter === null) {
    throw new AdminChangeRefused('invalid_input', 'that code does not match the secret');
  }

  await database
    .update(schema.administrator)
    .set({
      passwordHash: await hashAdminPassword(input.password),
      mfaSecret: await seal(input.secret),
      mfaEnrolledAt: now,
      mfaLastCounter: counter,
      status: 'active',
      // Single use: the invitation stops being a way in the moment it is spent.
      inviteTokenHash: null,
      inviteExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(schema.administrator.id, row.id));

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
