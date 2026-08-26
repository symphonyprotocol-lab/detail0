/**
 * The in-flight OAuth handshake: what we hand to the provider and what we must
 * still hold when the browser comes back.
 *
 * It lives in one sealed, short-lived cookie (see infrastructure/crypto/sealed)
 * so the callback can verify state, PKCE and nonce without a shared store.
 */
import { OAUTH_STATE_TTL_MS, type IdentityProvider } from '@/lib/domain/auth';

export interface Handshake {
  provider: IdentityProvider;
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export function handshakeExpiry(now: Date): number {
  return now.getTime() + OAUTH_STATE_TTL_MS;
}

export function isHandshakeShape(value: unknown): value is Handshake {
  if (typeof value !== 'object' || value === null) return false;
  const h = value as Record<string, unknown>;
  return (
    (h.provider === 'github' || h.provider === 'google') &&
    typeof h.state === 'string' &&
    typeof h.nonce === 'string' &&
    typeof h.codeVerifier === 'string' &&
    typeof h.returnTo === 'string' &&
    typeof h.expiresAt === 'number'
  );
}
