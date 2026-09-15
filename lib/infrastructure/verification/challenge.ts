/**
 * The two challenge checks that leave the building: a DNS TXT lookup and a
 * well-known file fetch. requirement.md 7.3.2, architecture.md 5.4.
 *
 * Both answer only "did a value matching the challenge exist" -- never what
 * was there. The record set and the fetched body stay inside this module, so a
 * claim cannot be turned into a probe that reads other people's DNS or pages
 * back to the caller (requirement.md 7.3.7).
 *
 * The well-known fetch goes through the ingestion fetcher on purpose: it is
 * the one outbound path that refuses private ranges, metadata endpoints, plain
 * http and unchecked redirects, and 7.3.2 says the verification request gets
 * no exemption from those rules.
 */
import { Resolver } from 'node:dns/promises';
import { IngestionFailure } from '@/lib/domain/ingestion';
import { fetchDocument } from '@/lib/infrastructure/connectors/http';
import { sha256, timingSafeEqual } from '@/lib/infrastructure/crypto/tokens';

const DNS_TIMEOUT_MS = 5_000;

/** A challenge file is a token; anything much larger is not one. */
const WELL_KNOWN_MAX_BYTES = 4_096;

export type ChallengeOutcome = 'matched' | 'not_found' | 'unreachable';

/**
 * The resolver the platform controls. architecture.md 5.4: never a nameserver
 * the claimant named. `CLAIM_DNS_RESOLVERS` lets a deployment pin public
 * resolvers; otherwise the host's configuration is used.
 */
function resolver(): Resolver {
  const instance = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
  const configured = process.env.CLAIM_DNS_RESOLVERS?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) instance.setServers(configured);
  return instance;
}

async function matchesHash(candidate: string, tokenHash: string): Promise<boolean> {
  return timingSafeEqual(await sha256(candidate.trim()), tokenHash);
}

/**
 * Whether any TXT value under `recordName` hashes to the challenge.
 *
 * Multi-string records are joined the way DNS clients present them. Every
 * value is hashed and compared; no value is returned or logged.
 */
export async function checkDnsChallenge(input: {
  recordName: string;
  tokenHash: string;
}): Promise<ChallengeOutcome> {
  let records: string[][];
  try {
    records = await resolver().resolveTxt(input.recordName);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN') return 'not_found';
    return 'unreachable';
  }
  for (const record of records) {
    if (await matchesHash(record.join(''), input.tokenHash)) return 'matched';
  }
  return 'not_found';
}

/**
 * Whether the well-known file at `url` contains the challenge.
 *
 * The body is trimmed and compared whole, so a file that holds the token on
 * its one line matches while a page that merely mentions it somewhere does
 * not.
 */
export async function checkWellKnownChallenge(input: {
  url: string;
  tokenHash: string;
}): Promise<ChallengeOutcome> {
  try {
    const resource = await fetchDocument(input.url, {
      accept: 'text/plain, */*;q=0.5',
      maxBytes: WELL_KNOWN_MAX_BYTES,
    });
    return (await matchesHash(resource.body, input.tokenHash)) ? 'matched' : 'not_found';
  } catch (error) {
    if (error instanceof IngestionFailure) {
      return error.code === 'source_empty' || error.code === 'source_too_large'
        ? 'not_found'
        : 'unreachable';
    }
    return 'unreachable';
  }
}
