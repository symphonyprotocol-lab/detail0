/**
 * The connector registry: one location in, one immutable snapshot out.
 *
 * The application layer knows only this function. Which provider a source type
 * happens to use, and what it costs to talk to it, stays inside the adapters --
 * architecture.md 4 keeps provider detail out of everything above
 * `lib/infrastructure`.
 */
import { IngestionFailure } from '@/lib/domain/ingestion';
import { indexDepthOf, type ConnectedSourceType } from '@/lib/domain/library';
import { objectStore } from '@/lib/infrastructure/objects/store';
import { fetchGithubSnapshot } from './github';
import { fetchNotionSnapshot } from './notion';
import { fetchPdfSnapshot } from './pdf';
import { fetchWebSnapshot } from './web';
import type { SourceSnapshot } from './types';

export type { FetchedFile, SourceSnapshot } from './types';

export interface FetchSnapshotInput {
  type: ConnectedSourceType;
  location: string;
  /** `source.config`: what the source row carries beyond a location. */
  config?: Record<string, unknown>;
}

export async function fetchSnapshot(input: FetchSnapshotInput): Promise<SourceSnapshot> {
  switch (input.type) {
    case 'github':
      return fetchGithubSnapshot({ location: input.location });
    case 'website':
    case 'llms_txt':
    case 'openapi':
      return fetchWebSnapshot({
        type: input.type,
        location: input.location,
        indexDepth: indexDepthOf(input.config ?? {}),
      });
    case 'notion':
      return fetchNotionSnapshot({ location: input.location });
    case 'pdf':
      return fetchPdfSnapshot({ config: input.config ?? {}, store: objectStore() });
    default:
      throw new IngestionFailure(
        'source_unsupported',
        'validate-source',
        `no connector for ${String(input.type)}`,
      );
  }
}

/**
 * Whether a source type can be fetched with the current configuration.
 *
 * Answered before a refresh is queued so the console can refuse at the point
 * the operator is looking at the library, rather than leaving a row in the
 * queue that fails minutes later for a reason that was knowable up front.
 */
export function connectorConfigured(type: ConnectedSourceType): boolean {
  return type === 'notion' ? Boolean(process.env.NOTION_INGESTION_TOKEN) : true;
}
