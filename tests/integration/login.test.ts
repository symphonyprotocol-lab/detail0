/**
 * The acceptance points of requirement.md 14.1 that need a real database:
 * first login creates the account, workspace and Free subscription together;
 * a second login reuses them; a suspended account cannot come back; sign-out
 * kills the session.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database -- these
 * tests write rows. Against Neon, use a dev branch:
 *
 *   TEST_DATABASE_URL='postgres://...' npx vitest run tests/integration
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

const { completeOAuth } = await import('@/lib/application/auth/complete-oauth');
const { resolveSession } = await import('@/lib/application/auth/resolve-session');
const { signOut } = await import('@/lib/application/auth/sign-out');
const { seal } = await import('@/lib/infrastructure/crypto/sealed');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { OAUTH_STATE_TTL_MS } = await import('@/lib/domain/auth');

const subject = `test-${Date.now()}`;
const profile: import('@/lib/domain/auth').IdentityProfile = {
  provider: 'github',
  subject,
  email: `${subject}@example.test`,
  emailVerified: true,
  displayName: 'Integration Tester',
  avatarUrl: null,
};

/** Stands in for GitHub: the handshake is real, only the network call is not. */
const adapter = {
  supportsPkce: () => false,
  authorizeUrl: () => 'https://example.test/authorize',
  exchange: async () => profile,
};

async function login(now = new Date()) {
  const state = 'state-for-integration';
  const sealedHandshake = await seal({
    provider: 'github',
    state,
    nonce: 'nonce',
    codeVerifier: 'verifier',
    returnTo: '/dashboard',
    expiresAt: now.getTime() + OAUTH_STATE_TTL_MS,
  });

  return completeOAuth({
    provider: 'github',
    code: 'code',
    state,
    sealedHandshake,
    redirectUri: 'https://example.test/api/auth/github/callback',
    workspaceNaming: { personalWorkspace: '{owner} 的空间', fallbackOwner: '个人' },
    adapter,
    now,
  });
}

describeWithDb('login against a real database', () => {
  let userId: string;

  afterAll(async () => {
    if (!userId) return;
    const database = db();
    const workspaces = await database
      .select({ id: schema.workspaceMember.workspaceId })
      .from(schema.workspaceMember)
      .where(eq(schema.workspaceMember.userId, userId));
    const workspaceIds = workspaces.map((w) => w.id);

    await database.delete(schema.userSession).where(eq(schema.userSession.userId, userId));
    if (workspaceIds.length > 0) {
      await database
        .delete(schema.subscription)
        .where(inArray(schema.subscription.workspaceId, workspaceIds));
    }
    await database.delete(schema.workspaceMember).where(eq(schema.workspaceMember.userId, userId));
    if (workspaceIds.length > 0) {
      await database.delete(schema.workspace).where(inArray(schema.workspace.id, workspaceIds));
    }
    await database.delete(schema.oauthAccount).where(eq(schema.oauthAccount.userId, userId));
    await database.delete(schema.user).where(eq(schema.user.id, userId));
  });

  it('creates account, personal workspace and a Free subscription on first login', async () => {
    const result = await login();
    const session = await resolveSession(result.sessionToken);

    expect(session).not.toBeNull();
    userId = session!.user.id;
    expect(session!.user.email).toBe(profile.email);
    expect(session!.workspace.role).toBe('owner');
    expect(session!.workspace.planId).toBe('free');
    expect(session!.workspace.monthlyCalls).toBe(1000);
    expect(result.returnTo).toBe('/dashboard');
  });

  it('reuses the same account and workspace on the next login', async () => {
    const second = await login();
    const session = await resolveSession(second.sessionToken);

    expect(session!.user.id).toBe(userId);

    const memberships = await db()
      .select({ workspaceId: schema.workspaceMember.workspaceId })
      .from(schema.workspaceMember)
      .where(eq(schema.workspaceMember.userId, userId));
    expect(memberships).toHaveLength(1);
  });

  it('drops the session as soon as it is signed out', async () => {
    const result = await login();
    expect(await resolveSession(result.sessionToken)).not.toBeNull();

    await signOut(result.sessionToken);
    expect(await resolveSession(result.sessionToken)).toBeNull();
  });

  it('refuses a login and any live session once the account is suspended', async () => {
    const result = await login();
    await db().update(schema.user).set({ status: 'suspended' }).where(eq(schema.user.id, userId));

    // requirement.md 3.2: suspension takes the web session down immediately.
    expect(await resolveSession(result.sessionToken)).toBeNull();
    await expect(login()).rejects.toThrow(/not active/);

    await db().update(schema.user).set({ status: 'active' }).where(eq(schema.user.id, userId));
  });

  it('rejects a callback whose state does not match the sealed handshake', async () => {
    const now = new Date();
    const sealedHandshake = await seal({
      provider: 'github',
      state: 'the-real-state',
      nonce: 'nonce',
      codeVerifier: 'verifier',
      returnTo: '/dashboard',
      expiresAt: now.getTime() + OAUTH_STATE_TTL_MS,
    });

    await expect(
      completeOAuth({
        provider: 'github',
        code: 'code',
        state: 'a-different-state',
        sealedHandshake,
        redirectUri: 'https://example.test/api/auth/github/callback',
        workspaceNaming: { personalWorkspace: '{owner} 的空间', fallbackOwner: '个人' },
        adapter,
        now,
      }),
    ).rejects.toThrow(/state mismatch/);
  });
});
