/**
 * The three outside systems a build talks to, behind one seam.
 *
 * Passed in rather than imported at the point of use so a test can run the
 * whole pipeline -- fetch, scan, parse, chunk, embed, write, publish -- against
 * a fixed snapshot and an in-memory store. The alternative is a pipeline whose
 * only integration test needs a live repository, an embedding provider and an
 * S3 bucket, which in practice means a pipeline with no integration test.
 */
import type { EmbeddingAdapter } from '@/lib/infrastructure/ai/providers';
import { embeddingAdapter, isEmbeddingConfigured } from '@/lib/infrastructure/ai/providers';
import { fetchSnapshot } from '@/lib/infrastructure/connectors';
import type { SourceSnapshot } from '@/lib/infrastructure/connectors';
import type { ObjectStore } from '@/lib/infrastructure/objects/store';
import { isObjectStoreConfigured, objectStore } from '@/lib/infrastructure/objects/store';
import type { PlatformSourceType } from '@/lib/domain/library';

export interface IngestionDependencies {
  fetchSnapshot(input: { type: PlatformSourceType; location: string }): Promise<SourceSnapshot>;
  embeddings(): EmbeddingAdapter;
  store(): ObjectStore;
  /** Whether a build could run at all. Checked before anything is fetched. */
  configured(): { embeddings: boolean; storage: boolean };
}

export const defaultDependencies: IngestionDependencies = {
  fetchSnapshot,
  embeddings: embeddingAdapter,
  store: objectStore,
  configured: () => ({
    embeddings: isEmbeddingConfigured(),
    storage: isObjectStoreConfigured(),
  }),
};

/** An in-memory store, for tests and for nothing else. */
export function memoryObjectStore(): ObjectStore & { keys(): string[] } {
  const objects = new Map<string, Uint8Array>();
  return {
    keys: () => [...objects.keys()],
    async put(key, body) {
      objects.set(key, body);
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async signedUrl(key) {
      return `memory://${key}`;
    },
  };
}

/**
 * Whether this environment could build a version at all.
 *
 * Read by the console so an operator is told before they queue a refresh,
 * rather than by an operation that fails at `validate-source` minutes later
 * with a reason that was knowable up front.
 */
export function isIngestionConfigured(): boolean {
  const available = defaultDependencies.configured();
  return available.embeddings && available.storage;
}
