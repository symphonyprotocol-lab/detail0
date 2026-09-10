/**
 * The anchoring alerts, gathered from the chain and the batch tables.
 *
 * The rules live in lib/domain/anchor-alerts.ts and are tested there; this
 * assembles their input. The split is what makes aptos-anchoring-proposal.md
 * 4.11 gate 8 -- "the contract-change alert is live and shown to fire" --
 * something a test can demonstrate rather than something an operator has to
 * stage against a real chain.
 */
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import {
  evaluateAnchorAlerts,
  formatAnchorAlert,
  type AnchorAlert,
} from '@/lib/domain/anchor-alerts';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { anchorHealth } from './health';

/** Proposal 4.8: 99% confirmed within two hours. */
const SLO_WINDOW_MS = 2 * 60 * 60 * 1000;

export async function anchorAlerts(now = new Date()): Promise<AnchorAlert[]> {
  const [health, [failed], [oldestOpen]] = await Promise.all([
    anchorHealth(),
    db()
      .select({ n: count() })
      .from(schema.anchorBatch)
      .where(eq(schema.anchorBatch.status, 'failed')),
    db()
      .select({ createdAt: schema.anchorBatch.createdAt })
      .from(schema.anchorBatch)
      .where(
        and(
          inArray(schema.anchorBatch.status, ['pending', 'submitted']),
          isNull(schema.anchorBatch.confirmedAt),
        ),
      )
      .orderBy(asc(schema.anchorBatch.createdAt))
      .limit(1),
  ]);

  return evaluateAnchorAlerts({
    configured: health.configured,
    balanceOctas: health.balanceOctas,
    minBalanceOctas: health.minBalanceOctas,
    monitorReachable: health.monitor.reachable,
    monitorError: health.monitor.error,
    failedBatches: failed?.n ?? 0,
    oldestOpenBatchAgeMs: oldestOpen
      ? now.getTime() - oldestOpen.createdAt.getTime()
      : null,
    sloWindowMs: SLO_WINDOW_MS,
  });
}

/**
 * Emit the current alerts to the log.
 *
 * The platform has no alert delivery of its own (architecture.md 17.2 names
 * what to watch, not where to send it), so this is the delivery that exists:
 * one stable, greppable line per condition, at a level a log drain can route
 * on. Wiring a channel to these lines is a configuration change, not a code
 * change -- which is the point of the format.
 */
export async function reportAnchorAlerts(now = new Date()): Promise<AnchorAlert[]> {
  const alerts = await anchorAlerts(now);
  for (const alert of alerts) {
    const line = formatAnchorAlert(alert);
    if (alert.severity === 'critical') console.error(line);
    else console.warn(line);
  }
  return alerts;
}
