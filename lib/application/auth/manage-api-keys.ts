/**
 * A workspace's API keys. architecture.md 5.1: the server keeps hash, prefix
 * and last four -- the full key exists once, in the creation response, and is
 * never reconstructable. Creation counts against the plan's key limit;
 * revocation is a timestamp, not a delete, so the row keeps explaining
 * historical usage.
 */
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { AppError } from '@/contracts/errors';
import { uuidv7 } from '@/lib/domain/id';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { PLAN_VERSION_NEWEST_FIRST } from '@/lib/application/plans/configuration';
import { hashApiKey } from './api-key';
import { canManageApiKeys, type WorkspaceRole } from '@/lib/application/libraries';

export interface ApiKeyView {
  id: string;
  name: string;
  masked: string;
  environment: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listApiKeys(workspaceId: string): Promise<ApiKeyView[]> {
  const rows = await db()
    .select()
    .from(schema.apiKey)
    .where(and(eq(schema.apiKey.workspaceId, workspaceId), isNull(schema.apiKey.revokedAt)))
    .orderBy(desc(schema.apiKey.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    masked: `${row.keyPrefix}••••${row.lastFour}`,
    environment: row.environment,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}

/**
 * Mint a key. The plaintext is returned exactly once; what the table keeps
 * cannot produce it again.
 */
export async function createApiKey(input: {
  workspaceId: string;
  role: WorkspaceRole;
  name: string;
}): Promise<{ key: string; view: ApiKeyView }> {
  /* requirement.md 3.3: keys are the owner's. A developer may use one; minting
     and revoking are not theirs to do, and a server action is a public
     endpoint whatever the page chooses to render. */
  if (!canManageApiKeys(input.role)) {
    throw new AppError('access_denied', 'only the workspace owner can create an API key');
  }

  const name = input.name.trim();
  if (name.length === 0 || name.length > 80) {
    throw new AppError('invalid_request', 'a key needs a name (1-80 characters)');
  }

  const database = db();
  const [active] = await database
    .select({ n: count() })
    .from(schema.apiKey)
    .where(and(eq(schema.apiKey.workspaceId, input.workspaceId), isNull(schema.apiKey.revokedAt)));
  if ((active?.n ?? 0) >= await apiKeyLimit(input.workspaceId)) {
    throw new AppError('api_key_limit_exceeded', 'the plan’s key limit is reached');
  }

  const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const key = `mm_live_${secret}`;
  const id = uuidv7();
  const createdAt = new Date();
  await database.insert(schema.apiKey).values({
    id,
    workspaceId: input.workspaceId,
    name,
    keyHash: await hashApiKey(key),
    keyPrefix: 'mm_live_',
    lastFour: key.slice(-4),
    scopes: ['retrieval'],
    environment: 'live',
    createdAt,
  });

  return {
    key,
    view: {
      id,
      name,
      masked: `mm_live_••••${key.slice(-4)}`,
      environment: 'live',
      scopes: ['retrieval'],
      createdAt: createdAt.toISOString(),
      lastUsedAt: null,
    },
  };
}

/** Revocation is scoped: a workspace can only silence its own keys. */
export async function revokeApiKey(input: {
  workspaceId: string;
  role: WorkspaceRole;
  keyId: string;
}): Promise<void> {
  if (!canManageApiKeys(input.role)) {
    throw new AppError('access_denied', 'only the workspace owner can revoke an API key');
  }

  await db()
    .update(schema.apiKey)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.apiKey.id, input.keyId),
        eq(schema.apiKey.workspaceId, input.workspaceId),
        isNull(schema.apiKey.revokedAt),
      ),
    );
}

/** The plan's key ceiling: the active subscription's version, or newest Free. */
async function apiKeyLimit(workspaceId: string): Promise<number> {
  const database = db();
  const [active] = await database
    .select({ limit: schema.planVersion.apiKeyLimit })
    .from(schema.subscription)
    .innerJoin(schema.planVersion, eq(schema.planVersion.id, schema.subscription.planVersionId))
    .where(
      and(
        eq(schema.subscription.workspaceId, workspaceId),
        eq(schema.subscription.status, 'active'),
        sql`${schema.subscription.periodStart} <= now()`,
        sql`${schema.subscription.periodEnd} >= now()`,
      ),
    )
    .orderBy(desc(schema.subscription.periodEnd))
    .limit(1);
  if (active) return active.limit;

  const [free] = await database
    .select({ limit: schema.planVersion.apiKeyLimit })
    .from(schema.planVersion)
    .where(eq(schema.planVersion.planId, 'free'))
    /* The id tiebreak, as every other plan-version reader uses. */
    .orderBy(...PLAN_VERSION_NEWEST_FIRST)
    .limit(1);
  return free?.limit ?? 1;
}
