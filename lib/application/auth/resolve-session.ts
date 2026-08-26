/**
 * Use case: turn a session cookie into the caller's identity.
 *
 * Step 1 and 2 of the authorization order in architecture.md 5.2 (resolve the
 * session, then check user and workspace state). Always reads the primary --
 * permission state must not come from a replica (architecture.md 16).
 */
import { and, eq } from 'drizzle-orm';
import {
  isAccountUsable,
  isSessionLive,
  shouldTouchSession,
  workspaceInitial,
} from '@/lib/domain/auth';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { sessionTokenHash } from '@/lib/application/auth/session-token';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SessionWorkspace {
  id: string;
  name: string;
  /** Avatar monogram, as drawn in the design source. */
  initial: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  planId: string;
  planName: string;
  monthlyCalls: number;
}

export interface UserSession {
  id: string;
  user: SessionUser;
  workspace: SessionWorkspace;
  expiresAt: Date;
}

export async function resolveSession(
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<UserSession | null> {
  if (!token) return null;

  const database = db();
  const [row] = await database
    .select({
      sessionId: schema.userSession.id,
      expiresAt: schema.userSession.expiresAt,
      lastSeenAt: schema.userSession.lastSeenAt,
      revokedAt: schema.userSession.revokedAt,
      userId: schema.user.id,
      email: schema.user.email,
      displayName: schema.user.displayName,
      avatarUrl: schema.user.avatarUrl,
      status: schema.user.status,
    })
    .from(schema.userSession)
    .innerJoin(schema.user, eq(schema.user.id, schema.userSession.userId))
    .where(eq(schema.userSession.tokenHash, await sessionTokenHash(token)))
    .limit(1);

  if (!row) return null;
  if (!isSessionLive(row, now)) return null;
  // requirement.md 3.2: suspending an account kills its web sessions at once.
  if (!isAccountUsable(row.status)) return null;

  const [workspace] = await database
    .select({
      id: schema.workspace.id,
      name: schema.workspace.name,
      role: schema.workspaceMember.role,
      planId: schema.plan.id,
      planName: schema.plan.name,
      monthlyCalls: schema.planVersion.monthlyCalls,
    })
    .from(schema.workspaceMember)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
    .leftJoin(
      schema.subscription,
      and(
        eq(schema.subscription.workspaceId, schema.workspace.id),
        eq(schema.subscription.status, 'active'),
      ),
    )
    .leftJoin(schema.planVersion, eq(schema.planVersion.id, schema.subscription.planVersionId))
    .leftJoin(schema.plan, eq(schema.plan.id, schema.planVersion.planId))
    .where(eq(schema.workspaceMember.userId, row.userId))
    .limit(1);

  if (!workspace) return null;

  if (shouldTouchSession(row, now)) {
    await database
      .update(schema.userSession)
      .set({ lastSeenAt: now })
      .where(eq(schema.userSession.id, row.sessionId));
  }

  return {
    id: row.sessionId,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      email: row.email,
      displayName: row.displayName ?? row.email.split('@')[0] ?? row.email,
      avatarUrl: row.avatarUrl,
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      initial: workspaceInitial(workspace.name),
      role: workspace.role,
      planId: workspace.planId ?? 'free',
      planName: workspace.planName ?? 'Free',
      monthlyCalls: workspace.monthlyCalls ?? 0,
    },
  };
}
