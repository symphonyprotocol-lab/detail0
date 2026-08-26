/**
 * Use case: the registered users the console lists.
 *
 * Reads the real `user` table. The counts beside each account come from the
 * tables that own them -- libraries from `library`, calls from `usage_summary`
 * -- so an account with no activity reads zero rather than an invented number.
 */
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { likePattern } from './like-pattern';

export type UserStatusFilter = 'all' | 'active' | 'suspended';

export interface ConsoleUserRow {
  id: string;
  displayName: string;
  email: string;
  planName: string;
  libraries: number;
  callsThisMonth: number;
  joinedAt: Date;
  status: string;
}

export interface UserListInput {
  query?: string;
  status?: UserStatusFilter;
  limit?: number;
}

export async function listConsoleUsers(input: UserListInput = {}): Promise<{
  rows: ConsoleUserRow[];
  total: number;
}> {
  const database = db();
  const term = input.query?.trim();
  const monthStart = startOfMonth(new Date());

  const conditions = [
    term
      ? or(ilike(schema.user.displayName, likePattern(term)), ilike(schema.user.email, likePattern(term)))
      : undefined,
    input.status && input.status !== 'all'
      ? eq(schema.user.status, input.status === 'active' ? 'active' : 'suspended')
      : undefined,
  ].filter(Boolean);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await database
    .select({ n: count() })
    .from(schema.user)
    .where(where);

  /*
   * The per-account counts are correlated subqueries rather than joins: a join
   * to `library` and one to `usage_summary` at once would multiply rows against
   * each other and inflate both numbers.
   */
  const libraryCount = sql<number>`(
    select count(*)::int from ${schema.library}
    join ${schema.workspaceMember} wm on wm.workspace_id = ${schema.library.ownerWorkspaceId}
    where wm.user_id = ${schema.user.id}
  )`;
  const callsThisMonth = sql<number>`(
    select coalesce(sum(${schema.usageSummary.calls}), 0)::int from ${schema.usageSummary}
    join ${schema.workspaceMember} wm on wm.workspace_id = ${schema.usageSummary.workspaceId}
    where wm.user_id = ${schema.user.id} and ${schema.usageSummary.bucketDate} >= ${monthStart}
  )`;

  const rows = await database
    .select({
      id: schema.user.id,
      displayName: schema.user.displayName,
      email: schema.user.email,
      status: schema.user.status,
      joinedAt: schema.user.createdAt,
      planName: schema.plan.name,
      libraries: libraryCount,
      callsThisMonth,
    })
    .from(schema.user)
    .leftJoin(schema.workspaceMember, eq(schema.workspaceMember.userId, schema.user.id))
    .leftJoin(
      schema.subscription,
      and(
        eq(schema.subscription.workspaceId, schema.workspaceMember.workspaceId),
        eq(schema.subscription.status, 'active'),
      ),
    )
    .leftJoin(schema.planVersion, eq(schema.planVersion.id, schema.subscription.planVersionId))
    .leftJoin(schema.plan, eq(schema.plan.id, schema.planVersion.planId))
    .where(where)
    .orderBy(desc(schema.user.createdAt))
    .limit(input.limit ?? 50);

  return {
    total: totalRow?.n ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      displayName: row.displayName ?? row.email.split('@')[0] ?? row.email,
      email: row.email,
      // No active subscription is Free by definition. requirement.md 4.1
      planName: row.planName ?? 'Free',
      libraries: row.libraries ?? 0,
      callsThisMonth: row.callsThisMonth ?? 0,
      joinedAt: row.joinedAt,
      status: row.status,
    })),
  };
}

export function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
