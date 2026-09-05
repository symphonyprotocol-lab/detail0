/**
 * Vercel Blob behind the same `ObjectStore` seam as the S3 adapter.
 *
 * Chosen over the S3-compatible bucket on 2026-09-05 (architecture.md 1.2
 * records the reversal): one account, one invoice, no bucket to provision per
 * environment. The price is that this adapter is the only implementation the
 * `@vercel/blob` API will ever have; every key stays store-neutral so the S3
 * adapter remains a drop-in.
 *
 * Every blob is `private`: a snapshot, a quarantined file or an uploaded PDF
 * must never be reachable by guessing its URL. Reads go through the SDK with
 * the read-write token; anything handed to a browser is a signed, short-lived
 * URL or a scoped client token, never the token itself.
 */
import {
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  list,
  presignUrl,
  put,
} from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import type { ObjectStore, StoredObject, UploadTicket } from './store';

export function isVercelBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export class VercelBlobStore implements ObjectStore {
  constructor(private readonly token: string) {}

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await put(key, body.slice().buffer as ArrayBuffer, {
      access: 'private',
      contentType,
      token: this.token,
      addRandomSuffix: false,
      /* A retried step writes the same key again; refusing would fail the
         retry for having succeeded once. */
      allowOverwrite: true,
    });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const result = await get(key, { access: 'private', token: this.token, useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }

  async head(key: string): Promise<{ size: number; contentType: string | null } | null> {
    try {
      const result = await head(key, { token: this.token });
      return { size: result.size, contentType: result.contentType ?? null };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    /* `del` of a missing pathname resolves; the SDK treats it as done. */
    await del(key, { token: this.token });
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const validUntil = Date.now() + ttlSeconds * 1000;
    const signed = await issueSignedToken({
      token: this.token,
      pathname: key,
      operations: ['get'],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(signed, {
      operation: 'get',
      pathname: key,
      access: 'private',
      validUntil,
    });
    return presignedUrl;
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ token: this.token, prefix, cursor, limit: 1000 });
      for (const blob of page.blobs) objects.push({ key: blob.pathname, uploadedAt: blob.uploadedAt });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return objects;
  }

  async uploadTicket(
    key: string,
    options: { contentType: string; maxBytes: number; ttlSeconds: number },
  ): Promise<UploadTicket> {
    /* The token is scoped to this one pathname, this content type and this
       size, and expires with the wizard's window; a client that alters any of
       them is refused by the store, not by us. */
    const token = await generateClientTokenFromReadWriteToken({
      token: this.token,
      pathname: key,
      allowedContentTypes: [options.contentType],
      maximumSizeInBytes: options.maxBytes,
      validUntil: Date.now() + options.ttlSeconds * 1000,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { kind: 'vercel-blob', pathname: key, token };
  }
}
