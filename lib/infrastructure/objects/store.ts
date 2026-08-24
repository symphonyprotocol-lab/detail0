/**
 * S3-compatible object storage. R2 first, but only the portable subset is used --
 * no vendor-specific API. architecture.md 1.2.
 */
export interface ObjectStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

export function objectStore(): ObjectStore {
  throw new Error('not implemented: objectStore adapter');
}
