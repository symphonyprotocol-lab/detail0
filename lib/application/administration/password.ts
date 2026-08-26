/**
 * Administrator password hashing.
 *
 * Argon2id, as `db/schema.ts` specifies, through `hash-wasm`: a pure-WASM
 * implementation runs unchanged on every runtime this deploys to, where a
 * native binding would tie the build to one platform.
 *
 * Parameters follow OWASP's Argon2id guidance (19 MiB, t=2, p=1), the setting
 * chosen for interactive logins rather than offline key derivation.
 */
import { argon2id, argon2Verify } from 'hash-wasm';

const MEMORY_KIB = 19 * 1024;
const ITERATIONS = 2;
const PARALLELISM = 1;
const HASH_LENGTH = 32;
const SALT_BYTES = 16;

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  return argon2id({
    password,
    salt,
    parallelism: PARALLELISM,
    iterations: ITERATIONS,
    memorySize: MEMORY_KIB,
    hashLength: HASH_LENGTH,
    outputType: 'encoded',
  });
}

/**
 * Never throws: a malformed or truncated hash is a failed verification, not an
 * error that could crash the sign-in and reveal which accounts have one.
 */
export async function verifyAdminPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}

/**
 * A hash to compare against when no administrator matched.
 *
 * Verifying this instead of returning early keeps a sign-in for an unknown
 * address as slow as one for a known address, so response time does not
 * enumerate the administrator list.
 */
let decoyHash: Promise<string> | undefined;

export function decoyPasswordHash(): Promise<string> {
  decoyHash ??= hashAdminPassword(`decoy:${crypto.randomUUID()}`);
  return decoyHash;
}
