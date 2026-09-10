/**
 * Is anchoring alive, and is anyone else using our key?
 *
 * aptos-anchoring-proposal.md 4.9 asks for the balance, the contract-change
 * watch and a heartbeat. 1.1 raised the stakes: with the signing key in the
 * environment there is nothing else between a stolen key and a forged anchor,
 * so "no alarm" has to mean "checked and clear", never "the check died".
 *
 * Hence `reachable`. A monitor that cannot answer reports that it cannot
 * answer, and the console shows it as a fault rather than as zero upgrades and
 * a clean bill of health.
 */
import { and, count, eq, isNotNull } from 'drizzle-orm';
import {
  anchorSigner,
  isAnchorSignerConfigured,
  minBalanceOctas,
} from '@/lib/infrastructure/chain/anchor-signer';
import { checkChain } from '@/lib/infrastructure/chain/anchor-monitor';
import { db, schema } from '@/lib/infrastructure/postgres/client';

/**
 * Publishes to the Code Object this deployment expects to see.
 *
 * One by default: the deploy that created it. An announced upgrade raises it,
 * which is what makes "unannounced" a thing this can measure at all -- proposal
 * 4.5 requires an announcement per upgrade, and this is where that announcement
 * lands in the software.
 */
function expectedPublishes(): number {
  const raw = Number.parseInt(process.env.APTOS_ANCHOR_EXPECTED_PUBLISHES ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

export interface AnchorHealth {
  configured: boolean;
  balanceOctas: number | null;
  minBalanceOctas: number;
  balanceLow: boolean;
  monitor: {
    reachable: boolean;
    checkedAt: string;
    error: string | null;
    publishes: number;
    expectedPublishes: number;
    /** Above zero means someone published to the Code Object unannounced. */
    unannouncedPublishes: number;
    recentSignerTransactions: number;
    knownBatchTransactions: number;
    /**
     * Signer transactions this platform cannot account for. A deployment's own
     * publish and any manual operator transaction land here too -- which is the
     * point: anything re0 did not send is worth a look.
     */
    unexplainedSignerTransactions: number;
  };
}

export async function anchorHealth(): Promise<AnchorHealth> {
  const minBalance = minBalanceOctas();
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
      expectedPublishes: expectedPublishes(),
      unannouncedPublishes: 0,
      recentSignerTransactions: 0,
      knownBatchTransactions: 0,
      unexplainedSignerTransactions: 0,
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

  const expected = expectedPublishes();
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
      expectedPublishes: expected,
      unannouncedPublishes: Math.max(0, chain.objectTransactions.length - expected),
      recentSignerTransactions: chain.signerTransactions.length,
      knownBatchTransactions: knownBatches,
      unexplainedSignerTransactions: Math.max(0, chain.signerTransactions.length - knownBatches),
    },
  };
}
