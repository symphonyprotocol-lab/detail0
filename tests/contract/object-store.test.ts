/**
 * Which store answers is an environment fact (architecture.md 1.2): Vercel
 * Blob when its token is set, the S3 adapter when only the bucket is, and
 * neither when nothing is -- so a build refuses at validate-source instead
 * of failing on its first write.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isObjectStoreConfigured, objectStore } from '@/lib/infrastructure/objects/store';
import { VercelBlobStore } from '@/lib/infrastructure/objects/vercel-blob';

const KEYS = [
  'BLOB_READ_WRITE_TOKEN',
  'OBJECT_STORE_ENDPOINT',
  'OBJECT_STORE_BUCKET',
  'OBJECT_STORE_ACCESS_KEY_ID',
  'OBJECT_STORE_SECRET_ACCESS_KEY',
] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function clear() {
  for (const key of KEYS) delete process.env[key];
}

describe('objectStore', () => {
  it('is unconfigured when neither store is described', () => {
    clear();
    expect(isObjectStoreConfigured()).toBe(false);
    expect(() => objectStore()).toThrow();
  });

  it('prefers Vercel Blob when its token is set', () => {
    clear();
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    process.env.OBJECT_STORE_ENDPOINT = 'https://s3.example.test';
    process.env.OBJECT_STORE_BUCKET = 'b';
    process.env.OBJECT_STORE_ACCESS_KEY_ID = 'k';
    process.env.OBJECT_STORE_SECRET_ACCESS_KEY = 's';
    expect(isObjectStoreConfigured()).toBe(true);
    expect(objectStore()).toBeInstanceOf(VercelBlobStore);
  });

  it('falls back to the S3 adapter without the token', () => {
    clear();
    process.env.OBJECT_STORE_ENDPOINT = 'https://s3.example.test';
    process.env.OBJECT_STORE_BUCKET = 'b';
    process.env.OBJECT_STORE_ACCESS_KEY_ID = 'k';
    process.env.OBJECT_STORE_SECRET_ACCESS_KEY = 's';
    expect(isObjectStoreConfigured()).toBe(true);
    expect(objectStore()).not.toBeInstanceOf(VercelBlobStore);
  });
});
