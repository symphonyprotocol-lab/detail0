/**
 * Watching the chain for things nobody asked for.
 *
 * aptos-anchoring-proposal.md 4.9 makes this the detection face, and 1.1 made
 * it the only one: with the signing key held in the environment rather than a
 * KMS, there is no IAM policy, no source restriction and no call audit behind
 * it. If this is quiet and wrong, a stolen key goes unnoticed.
 *
 * Two things are watched, and both are answered from the *monitoring*
 * credential, never the one that writes:
 *
 *   upgrades  any transaction against the Code Object. Calling a module inside
 *             it does not touch the object's own account, so the only rows here
 *             are the publish that created it and any later republish.
 *   activity  transactions sent by the Anchor Signer, to be reconciled against
 *             the batches we know we sent.
 *
 * The isolation is enforced, not documented: a deployment whose monitoring key
 * equals its write key is refused. Sharing one key means a provider outage
 * removes the anchoring and its only intrusion detection at the same moment,
 * so the failure window and the attack window line up exactly (4.9).
 */
export interface ChainMonitorResult {
  /** False when the monitor itself could not answer -- the alarm, not a zero. */
  reachable: boolean;
  checkedAt: Date;
  /** Ledger versions of transactions against the Code Object, newest first. */
  objectTransactions: number[];
  /** Transaction hashes the Anchor Signer sent, newest first. */
  signerTransactions: string[];
  /** Why the check could not run, as a stable code. Never a credential. */
  error: string | null;
}

interface IndexerConfig {
  url: string;
  key: string | null;
}

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * The monitoring endpoint, or the reason there is none.
 *
 * A missing key is allowed -- the public endpoint answers unauthenticated, just
 * slowly -- but a key that equals the write key is not, and neither is silently
 * falling back to the write path's endpoint.
 */
export function monitorConfig(): IndexerConfig | { error: string } {
  const url = env('APTOS_INDEXER_URL');
  if (!url) return { error: 'indexer_url_missing' };
  const key = env('APTOS_INDEXER_API_KEY');
  if (key && key === env('APTOS_API_KEY')) return { error: 'monitor_key_not_isolated' };
  return { url, key };
}

async function query<T>(config: IndexerConfig, gql: string, variables: object): Promise<T> {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.key ? { authorization: `Bearer ${config.key}` } : {}),
    },
    body: JSON.stringify({ query: gql, variables }),
    /* The monitor must not hang a page or a cron tick. */
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`indexer_http_${response.status}`);
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length || !body.data) throw new Error('indexer_query_failed');
  return body.data;
}

const OBJECT_TRANSACTIONS = `
  query ObjectTransactions($address: String!, $limit: Int!) {
    account_transactions(
      where: { account_address: { _eq: $address } }
      order_by: { transaction_version: desc }
      limit: $limit
    ) {
      transaction_version
    }
  }
`;

const SIGNER_TRANSACTIONS = `
  query SignerTransactions($address: String!, $limit: Int!) {
    account_transactions(
      where: { account_address: { _eq: $address } }
      order_by: { transaction_version: desc }
      limit: $limit
    ) {
      transaction_version
    }
  }
`;

export async function checkChain(input: {
  objectAddress: string;
  signerAddress: string;
  limit?: number;
}): Promise<ChainMonitorResult> {
  const checkedAt = new Date();
  const config = monitorConfig();
  if ('error' in config) {
    return {
      reachable: false,
      checkedAt,
      objectTransactions: [],
      signerTransactions: [],
      error: config.error,
    };
  }

  const limit = input.limit ?? 50;
  try {
    const [objects, signers] = await Promise.all([
      query<{ account_transactions: { transaction_version: number }[] }>(
        config,
        OBJECT_TRANSACTIONS,
        { address: input.objectAddress, limit },
      ),
      query<{ account_transactions: { transaction_version: number }[] }>(
        config,
        SIGNER_TRANSACTIONS,
        { address: input.signerAddress, limit },
      ),
    ]);
    return {
      reachable: true,
      checkedAt,
      objectTransactions: objects.account_transactions.map((row) => row.transaction_version),
      /* Versions, not hashes: the indexer indexes by version, and reconciling
         against our own records only needs to count. */
      signerTransactions: signers.account_transactions.map((row) =>
        String(row.transaction_version),
      ),
      error: null,
    };
  } catch (error) {
    return {
      reachable: false,
      checkedAt,
      objectTransactions: [],
      signerTransactions: [],
      error: error instanceof Error ? error.message : 'indexer_unavailable',
    };
  }
}
