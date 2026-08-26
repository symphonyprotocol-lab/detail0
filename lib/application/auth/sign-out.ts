/**
 * Use case: end a session.
 *
 * Revocation is a row update rather than a delete: `user_session` is the record
 * of which sessions existed and when they were withdrawn (architecture.md 6.1).
 */
import { eq, isNull, and } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { sessionTokenHash } from '@/lib/application/auth/session-token';

export async function signOut(
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (!token) return;
  await db()
    .update(schema.userSession)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.userSession.tokenHash, await sessionTokenHash(token)),
        isNull(schema.userSession.revokedAt),
      ),
    );
}
