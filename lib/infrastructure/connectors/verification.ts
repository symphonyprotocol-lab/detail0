/**
 * The two lookups a domain challenge is checked with (requirement.md 7.3.2,
 * architecture.md 5.4). Both are outbound requests to a host a user named,
 * so both go through controlled channels and give back the least they can:
 * a list of TXT strings, or a small body, or nothing.
 *
 * - DNS asks the deployment's resolver, or the servers `DNS_VERIFICATION_SERVERS`
 *   names in the environment. A user never picks the nameserver: a challenge
 *   answered by a resolver the claimant runs proves nothing.
 * - The well-known file is fetched through `fetchDocument`, so the source
 *   address rules (https only, no private ranges, every redirect hop
 *   re-checked) apply to a verification request exactly as they apply to a
 *   crawl, and the body is capped far below anything a token needs.
 */
import { Resolver } from 'node:dns/promises';
import { IngestionFailure } from '@/lib/domain/ingestion';
import { fetchDocument } from './http';

/** Seam the use case is written against; tests hand in a fake. */
export interface DomainChallengeReader {
  /** Every TXT record at `name`, each as its character strings. None when the name does not resolve. */
  txtRecords(name: string): Promise<string[][]>;
  /** The body at `url`, or null when it cannot be fetched or has no 2xx body. */
  wellKnownBody(url: string): Promise<string | null>;
}

/** More than a token ever is; less than a page someone put there by mistake. */
const WELL_KNOWN_MAX_BYTES = 4 * 1024;

function resolver(): Resolver {
  const instance = new Resolver({ timeout: 5_000, tries: 2 });
  const servers = (process.env.DNS_VERIFICATION_SERVERS ?? '')
    .split(',')
    .map((server) => server.trim())
    .filter((server) => server.length > 0);
  if (servers.length > 0) instance.setServers(servers);
  return instance;
}

export async function txtRecords(name: string): Promise<string[][]> {
  try {
    return await resolver().resolveTxt(name);
  } catch {
    /* ENOTFOUND, ENODATA, SERVFAIL, timeout: all read as "no record". The
       distinction is not something the claimant is told (requirement.md
       7.3.7), so it is not something worth carrying out of here. */
    return [];
  }
}

export async function wellKnownBody(url: string): Promise<string | null> {
  try {
    const resource = await fetchDocument(url, {
      accept: 'text/plain, */*;q=0.5',
      maxBytes: WELL_KNOWN_MAX_BYTES,
    });
    return resource.body;
  } catch (error) {
    if (error instanceof IngestionFailure) return null;
    throw error;
  }
}

export const domainChallengeReader: DomainChallengeReader = { txtRecords, wellKnownBody };
