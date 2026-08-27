/**
 * Sealed cookie payloads: AES-256-GCM with a key derived from
 * `SESSION_SIGNING_SECRET`.
 *
 * Used for the in-flight OAuth handshake (state, PKCE verifier, nonce,
 * returnTo). Keeping it in an encrypted, short-lived cookie rather than in
 * Redis means the handshake needs no shared store and cannot be read or forged
 * by the browser, while GCM's tag gives the integrity check that a plain
 * signature would.
 */
import { base64UrlDecode, base64UrlEncode } from '@/lib/infrastructure/crypto/tokens';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKey: Promise<CryptoKey> | undefined;

function signingSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SIGNING_SECRET is not set (needs at least 32 characters)');
  }
  return secret;
}

function sealKey(): Promise<CryptoKey> {
  cachedKey ??= (async () => {
    const material = await crypto.subtle.importKey(
      'raw',
      encoder.encode(signingSecret()),
      'HKDF',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode('re0/cookie-seal/v1'),
        info: encoder.encode('aes-gcm'),
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  })();
  return cachedKey;
}

export async function seal(payload: unknown): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await sealKey(),
    encoder.encode(JSON.stringify(payload)),
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

/** Returns null for anything that does not decrypt and parse. Never throws. */
export async function unseal<T>(value: string | undefined | null): Promise<T | null> {
  if (!value) return null;
  const [ivPart, dataPart] = value.split('.');
  if (!ivPart || !dataPart) return null;

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlDecode(ivPart) },
      await sealKey(),
      base64UrlDecode(dataPart),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    return null;
  }
}
