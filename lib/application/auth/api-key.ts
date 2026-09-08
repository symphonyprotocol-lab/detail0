/**
 * API key authentication for REST and MCP. architecture.md 5.1.
 *
 * Only the HMAC of a key is stored (`api_key.key_hash`); the plaintext exists
 * once, in the creation response. Verification is therefore one keyed hash and
 * one unique-index lookup -- no per-key salt round-trips, and a database dump
 * alone cannot be turned into working keys without API_KEY_HASH_SECRET.
 */
import { and, asc, eq } from 'drizzle-orm';
import { AppError } from '@/contracts/errors';
import {
  API_KEY_MANAGEMENT_SCOPE,
  hasScope,
  normaliseScopes,
  type ApiKeyScope,
} from '@/lib/domain/api-key';
import { isAccountUsable } from '@/lib/domain/auth';
import { hmacSha256 } from '@/lib/infrastructure/crypto/tokens';
import { db, schema } from '@/lib/infrastructure/postgres/client';

export const API_KEY_PREFIXES = ['mm_live_', 'mm_test_'] as const;

export interface ApiKeyPrincipal {
  apiKeyId: string;
  workspaceId: string;
  environment: string;
  /** Normalised: legacy `retrieval` rows already read as the full set. */
  scopes: string[];
}

/**
 * The scope gate. A key is a workspace credential narrowed to what its owner
 * chose at creation (requirement.md 5.2); a request outside that set is
 * `access_denied` (requirement.md 11: workspace, scope or access rule), never
 * `invalid_api_key` -- the key is real, it just cannot do this.
 *
 * Only Bearer keys carry scopes. A session or an anonymous caller has none to
 * check, so `null`/`undefined` scopes pass: the caller was admitted by some
 * other gate.
 */
export function requireScope(
  principal: { scopes?: readonly string[] | null } | null | undefined,
  needed: ApiKeyScope | typeof API_KEY_MANAGEMENT_SCOPE,
): void {
  const scopes = principal?.scopes;
  if (!scopes) return;
  if (!hasScope(scopes, needed)) {
    throw new AppError('access_denied', `this API key lacks the ${needed} scope`);
  }
}

export async function hashApiKey(key: string): Promise<string> {
  const secret = process.env.API_KEY_HASH_SECRET;
  if (!secret) throw new AppError('internal_error', 'API_KEY_HASH_SECRET is not set');
  return hmacSha256(secret, key);
}

/**
 * Resolve a Bearer API key to its workspace. Every failure is the same
 * `invalid_api_key`: which check failed is not information a caller holding a
 * guessed key should receive.
 */
export async function resolveApiKey(authorization: string | null): Promise<ApiKeyPrincipal | null> {
  if (!authorization) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) throw new AppError('invalid_api_key', 'malformed authorization header');
  const key = match[1]!;
  if (!API_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    throw new AppError('invalid_api_key', 'unrecognised key format');
  }

  const [row] = await db()
    .select({
      id: schema.apiKey.id,
      workspaceId: schema.apiKey.workspaceId,
      environment: schema.apiKey.environment,
      scopes: schema.apiKey.scopes,
      revokedAt: schema.apiKey.revokedAt,
      ownerStatus: schema.user.status,
    })
    .from(schema.apiKey)
    /*
     * Joined to the account behind the workspace, because `isAccountUsable` is
     * the gate for requirement.md 3.2 and this is one of the three resolvers it
     * names: suspending an account revokes its sessions, and a key that kept
     * working would leave the same account reading its usage, rewriting its
     * policies and spending its quota through REST and MCP.
     *
     * Left, not inner: the rule is "a suspended account stops", so a workspace
     * that has no owner row at all has no account to suspend and is not what
     * this refuses. The founding owner decides, the same membership
     * `resolveSession` picks.
     */
    .leftJoin(
      schema.workspaceMember,
      and(
        eq(schema.workspaceMember.workspaceId, schema.apiKey.workspaceId),
        eq(schema.workspaceMember.role, 'owner'),
      ),
    )
    .leftJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
    .where(eq(schema.apiKey.keyHash, await hashApiKey(key)))
    .orderBy(asc(schema.workspaceMember.createdAt), asc(schema.workspaceMember.userId))
    .limit(1);

  if (!row || row.revokedAt) throw new AppError('invalid_api_key', 'unknown or revoked key');
  if (row.ownerStatus !== null && !isAccountUsable(row.ownerStatus)) {
    throw new AppError('invalid_api_key', 'unknown or revoked key');
  }

  /* A usage timestamp, not an audit fact: losing one write is acceptable,
     failing the request over it is not. */
  db()
    .update(schema.apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKey.id, row.id))
    .catch(() => {});

  return {
    apiKeyId: row.id,
    workspaceId: row.workspaceId,
    environment: row.environment,
    scopes: normaliseScopes(row.scopes),
  };
}
