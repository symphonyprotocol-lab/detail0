/**
 * Use case: start a login.
 *
 * Mints state, PKCE verifier and nonce, seals them with the validated
 * `returnTo`, and returns the provider URL to redirect to.
 */
import { safeReturnTo, type IdentityProvider } from '@/lib/domain/auth';
import { seal } from '@/lib/infrastructure/crypto/sealed';
import { codeChallengeS256, randomToken } from '@/lib/infrastructure/crypto/tokens';
import { identityAdapter } from '@/lib/infrastructure/identity/oauth';
import { handshakeExpiry, type Handshake } from '@/lib/application/auth/handshake';

export interface BeginOAuthInput {
  provider: IdentityProvider;
  returnTo: unknown;
  /** `${APP_BASE_URL}/api/auth/${provider}/callback`, built by the caller. */
  redirectUri: string;
  now?: Date;
}

export interface BeginOAuthResult {
  redirectUrl: string;
  /** Sealed handshake, to be written as a short-lived cookie. */
  handshake: string;
  expiresAt: number;
}

export async function beginOAuth(input: BeginOAuthInput): Promise<BeginOAuthResult> {
  const now = input.now ?? new Date();
  const adapter = identityAdapter();

  const handshake: Handshake = {
    provider: input.provider,
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: randomToken(),
    returnTo: safeReturnTo(input.returnTo),
    expiresAt: handshakeExpiry(now),
  };

  const redirectUrl = adapter.authorizeUrl({
    provider: input.provider,
    state: handshake.state,
    nonce: handshake.nonce,
    codeChallenge: await codeChallengeS256(handshake.codeVerifier),
    redirectUri: input.redirectUri,
  });

  return {
    redirectUrl,
    handshake: await seal(handshake),
    expiresAt: handshake.expiresAt,
  };
}
