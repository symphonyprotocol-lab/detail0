/**
 * The console cookie carries a random token; `admin_session.token_hash` holds
 * only its keyed digest, so a database dump cannot be turned back into live
 * console sessions.
 *
 * The digest is domain-separated from the product one (`session:` vs
 * `admin-session:`): the same random string presented to the wrong surface
 * hashes to something that matches nothing.
 */
import { hmacSha256 } from '@/lib/infrastructure/crypto/tokens';

function signingSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SIGNING_SECRET is not set (needs at least 32 characters)');
  }
  return secret;
}

export function adminSessionTokenHash(token: string): Promise<string> {
  return hmacSha256(signingSecret(), `admin-session:${token}`);
}
