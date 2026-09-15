/**
 * What the chain says about our signer and our code object.
 *
 * Numbers, not verdicts. Anchoring is a side system that has to stay removable
 * (proposal 4.1), so the console reads the chain and shows what it found:
 * balance, how many times the code object has been published to, how many
 * transactions the signer has sent. An operator compares those to what they
 * expect; nothing here compares them to a configured expectation, because a
 * configured expectation is one more thing to keep in step and one more way to
 * be wrong.
 *
 * `reachable` is the exception, and it earns its place: a check that cannot
 * answer must say so, or "nothing to report" and "the check died" look the
 * same.
 */
import { and, count, eq, isNotNull } from 'drizzle-orm';
import {
  anchorSigner,
  isAnchorSignerConfigured,
  MIN_BALANCE_OCTAS,
} from '@/lib/infrastructure/chain/anchor-signer';
import { checkChain } from '@/lib/infrastructure/chain/anchor-monitor';
import { db, schema } from '@/lib/infrastructure/postgres/client';

export interface AnchorHealth {
  configured: boolean;
  balanceOctas: number | null;
  minBalanceOctas: number;
  balanceLow: boolean;
  monitor: {
    reachable: boolean;
    checkedAt: string;
    error: string | null;
    /** Publishes to the code object -- the deploy, plus any upgrade since. */
    publishes: number;
    /** Recent transactions from the signing account, as the indexer has them. */
    recentSignerTransactions: number;
    /** Batch transactions this platform knows it sent, to compare against. */
    knownBatchTransactions: number;
  };
}

export async function anchorHealth(): Promise<AnchorHealth> {
  const minBalance = MIN_BALANCE_OCTAS;
  const empty: AnchorHealth = {
    configured: false,
    balanceOctas: null,
    minBalanceOctas: minBalance,
    balanceLow: false,
    monitor: {
      reachable: false,
      checkedAt: new Date().toISOString(),
      error: 'not_configured',
      publishes: 0,
      recentSignerTransactions: 0,
      knownBatchTransactions: 0,
    },
  };
  if (!isAnchorSignerConfigured()) return empty;

  let signer;
  try {
    signer = anchorSigner();
  } catch {
    return empty;
  }

  const [balance, chain, [known]] = await Promise.all([
    /* A balance the node will not answer for is unknown, not zero: an alarm
       raised by an unreachable node is an alarm nobody will trust twice. */
    signer.balanceOctas().catch(() => null),
    checkChain({ objectAddress: signer.objectAddress, signerAddress: signer.accountAddress }),
    db()
      .select({ n: count() })
      .from(schema.anchorBatch)
      .where(
        and(isNotNull(schema.anchorBatch.txHash), eq(schema.anchorBatch.network, signer.network)),
      ),
  ]);

  const knownBatches = known?.n ?? 0;
  return {
    configured: true,
    balanceOctas: balance,
    minBalanceOctas: minBalance,
    balanceLow: balance !== null && balance < minBalance,
    monitor: {
      reachable: chain.reachable,
      checkedAt: chain.checkedAt.toISOString(),
      error: chain.error,
      publishes: chain.objectTransactions.length,
      recentSignerTransactions: chain.signerTransactions.length,
      knownBatchTransactions: knownBatches,
    },
  };
}
