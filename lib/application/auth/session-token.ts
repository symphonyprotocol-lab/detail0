/**
 * The cookie carries a random token; `user_session.token_hash` holds only its
 * keyed digest, so a database dump cannot be turned back into live sessions.
 */
import { hmacSha256 } from '@/lib/infrastructure/crypto/tokens';

function signingSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SIGNING_SECRET is not set (needs at least 32 characters)');
  }
  return secret;
}

export function sessionTokenHash(token: string): Promise<string> {
  return hmacSha256(signingSecret(), `session:${token}`);
}
