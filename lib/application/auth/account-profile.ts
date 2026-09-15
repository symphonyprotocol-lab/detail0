/**
 * Use case: what the settings screen shows about the signed-in account.
 *
 * requirement.md 5.2 (设置): profile, sign-in methods, join date and email
 * verification. Both providers refuse an unverified email at sign-in
 * (lib/infrastructure/identity), so every stored address is verified by
 * construction and the screen can say so without a column for it.
 */
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';

export interface AccountProfile {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Date;
  /** Sign-in providers linked to the account, oldest first: `github`, `google`. */
  providers: string[];
}

export async function accountProfile(userId: string): Promise<AccountProfile | null> {
  const database = db();
  const [account, identities] = await Promise.all([
    database
      .select({
        email: schema.user.email,
        displayName: schema.user.displayName,
        avatarUrl: schema.user.avatarUrl,
        createdAt: schema.user.createdAt,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1)
      .then((rows) => rows[0]),
    database
      .select({ provider: schema.oauthAccount.provider })
      .from(schema.oauthAccount)
      .where(eq(schema.oauthAccount.userId, userId))
      .orderBy(asc(schema.oauthAccount.createdAt)),
  ]);
  if (!account) return null;
  return {
    email: account.email,
    displayName: account.displayName ?? account.email.split('@')[0] ?? account.email,
    avatarUrl: account.avatarUrl,
    createdAt: account.createdAt,
    providers: identities.map((row) => row.provider),
  };
}
