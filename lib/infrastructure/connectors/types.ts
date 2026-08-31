/**
 * What every connector returns, and nothing more.
 *
 * A connector's whole job is to turn a location into an immutable set of files
 * plus the few facts about the source that scoring needs (requirement.md 6.3:
 * maintenance and licence are Trust inputs). Parsing, chunking and embedding
 * are the same for every source type and happen once, in the application layer,
 * which is why nothing here is format-aware.
 */
import type { SourceConfig } from '@/lib/domain/ingestion';

export interface FetchedFile {
  /** Stable path within the source. Part of the snapshot digest. */
  path: string;
  /** Where a reader can see this document. Goes into every citation. */
  url: string;
  content: string;
}

export interface SourceSnapshot {
  files: FetchedFile[];
  /** `re0.json` if the source carries one, empty otherwise. */
  config: SourceConfig;
  /** Provider revision, such as a commit sha. Null when the source has none. */
  revision: string | null;
  lastModifiedAt: Date | null;
  hasLicense: boolean;
  /** True when the source itself says it is no longer maintained. */
  stale: boolean;
}
