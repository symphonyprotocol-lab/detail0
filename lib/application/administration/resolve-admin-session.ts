/**
 * Use case: turn a console cookie into an administrator identity.
 *
 * The console is a separate authority from the dashboard: its own entrance,
 * its own credentials and mandatory two-factor authentication, and a signed-in
 * product user must never reach it (requirement.md 3.2). So this reads
 * `admin_session` only -- a product session token hashes into a different
 * namespace and matches nothing here.
 *
 * Always reads the primary: permission state must not come from a replica
 * (architecture.md 16).
 */
import { eq } from 'drizzle-orm';
import {
  adminSessionExpiryFrom,
  capabilitiesForRoles,
  isAdminRoleId,
  isAdminSessionLive,
  shouldTouchAdminSession,
  type AdminCapability,
  type AdminRoleId,
} from '@/lib/domain/admin';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { adminSessionTokenHash } from './admin-session-token';

export interface AdminSession {
  id: string;
  administratorId: string;
  username: string;
  email: string;
  roles: AdminRoleId[];
  capabilities: AdminCapability[];
  expiresAt: Date;
}

export async function resolveAdminSession(
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<AdminSession | null> {
  if (!token) return null;

  const database = db();
  const [row] = await database
    .select({
      sessionId: schema.adminSession.id,
      expiresAt: schema.adminSession.expiresAt,
      lastSeenAt: schema.adminSession.lastSeenAt,
      revokedAt: schema.adminSession.revokedAt,
      createdAt: schema.adminSession.createdAt,
      administratorId: schema.administrator.id,
      username: schema.administrator.username,
      email: schema.administrator.email,
      status: schema.administrator.status,
      mfaEnrolledAt: schema.administrator.mfaEnrolledAt,
    })
    .from(schema.adminSession)
    .innerJoin(
      schema.administrator,
      eq(schema.administrator.id, schema.adminSession.administratorId),
    )
    .where(eq(schema.adminSession.tokenHash, await adminSessionTokenHash(token)))
    .limit(1);

  if (!row) return null;
  if (!isAdminSessionLive(row, now)) return null;
  // Disabling an administrator kills their console sessions at once.
  if (row.status !== 'active') return null;
  // Clearing the second factor invalidates the sessions it let through.
  if (row.mfaEnrolledAt === null) return null;

  const roleRows = await database
    .select({ roleId: schema.administratorRole.roleId })
    .from(schema.administratorRole)
    .where(eq(schema.administratorRole.administratorId, row.administratorId));

  const roles = roleRows.map((role) => role.roleId).filter(isAdminRoleId);
  // An administrator with no role reaches nothing; that is a real state, not an
  // error, and it must not silently widen into full access.
  const capabilities = capabilitiesForRoles(roles);

  /* Sliding expiry (lib/domain/admin.ts): a use inside the window moves it,
     never past the 90-day cap counted from sign-in. */
  const expiresAt = shouldTouchAdminSession(row, now)
    ? adminSessionExpiryFrom(now, row.createdAt)
    : row.expiresAt;
  if (expiresAt !== row.expiresAt) {
    await database
      .update(schema.adminSession)
      .set({ lastSeenAt: now, expiresAt })
      .where(eq(schema.adminSession.id, row.sessionId));
    await database
      .update(schema.administrator)
      .set({ lastActiveAt: now })
      .where(eq(schema.administrator.id, row.administratorId));
  }

  return {
    id: row.sessionId,
    administratorId: row.administratorId,
    username: row.username,
    email: row.email,
    roles,
    capabilities,
    expiresAt,
  };
}
