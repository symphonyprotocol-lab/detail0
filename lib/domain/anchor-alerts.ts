/**
 * What about anchoring is worth waking someone for, as a pure function.
 *
 * aptos-anchoring-proposal.md 4.9 requires the contract-change alert to exist
 * and forbids turning it off, and 4.11 gate 8 wants it demonstrated firing
 * before the first mainnet batch. A rule that only exists inside a rendering
 * path cannot be demonstrated; this one is a function over a state, so proving
 * it fires is a test rather than an incident.
 *
 * Two disciplines, both from architecture.md 17.2 and proposal 4.9:
 *
 * - the payload carries ids, counts and stable codes only. No leaf preimage, no
 *   key material, no library title -- an alert travels further than a console
 *   session and lands in more inboxes than a database does;
 * - severity is about what the condition means, not how loud it feels. The
 *   watch failing is critical because it is the only thing that would notice a
 *   stolen key (proposal 1.1's 0.1), while a low balance is a warning because
 *   it has months of runway behind it.
 */

export type AnchorAlertSeverity = 'critical' | 'warning';

export type AnchorAlertCode =
  | 'unannounced_upgrade'
  | 'monitor_unreachable'
  | 'monitor_key_not_isolated'
  | 'signer_balance_empty'
  | 'signer_balance_low'
  | 'unexplained_signer_activity'
  | 'batches_failed'
  | 'backlog_stalled';

export interface AnchorAlert {
  code: AnchorAlertCode;
  severity: AnchorAlertSeverity;
  /** Ids, counts and codes. Never a preimage, a title or key material. */
  detail: Record<string, string | number>;
}

export interface AnchorAlertInput {
  configured: boolean;
  balanceOctas: number | null;
  minBalanceOctas: number;
  monitorReachable: boolean;
  monitorError: string | null;
  publishes: number;
  expectedPublishes: number;
  unexplainedSignerTransactions: number;
  failedBatches: number;
  /** Age of the oldest batch still waiting to confirm, in milliseconds. */
  oldestOpenBatchAgeMs: number | null;
  sloWindowMs: number;
}

const SEVERITY_ORDER: Record<AnchorAlertSeverity, number> = { critical: 0, warning: 1 };

export function evaluateAnchorAlerts(input: AnchorAlertInput): AnchorAlert[] {
  /* Nothing configured is not an incident; it is a deployment without the
     side path enabled at all (proposal 4.1). */
  if (!input.configured) return [];

  const alerts: AnchorAlert[] = [];

  /*
   * The one proposal 4.9 says may never be silenced. Anything published to the
   * code object beyond what an announcement declared is either an upgrade
   * nobody told us about or the Upgrade Authority in someone else's hands.
   */
  if (input.publishes > input.expectedPublishes) {
    alerts.push({
      code: 'unannounced_upgrade',
      severity: 'critical',
      detail: {
        publishes: input.publishes,
        expected: input.expectedPublishes,
        unannounced: input.publishes - input.expectedPublishes,
      },
    });
  }

  /*
   * A watch that cannot answer is critical rather than cosmetic: while it is
   * down, "no alarm" carries no information at all, and with the signing key in
   * the environment there is no second line to fall back on.
   */
  if (!input.monitorReachable) {
    alerts.push({
      code: input.monitorError === 'monitor_key_not_isolated'
        ? 'monitor_key_not_isolated'
        : 'monitor_unreachable',
      severity: 'critical',
      detail: { reason: input.monitorError ?? 'unknown' },
    });
  }

  if (input.balanceOctas !== null) {
    if (input.balanceOctas === 0) {
      /* Empty is not "low": anchoring has stopped, not slowed. */
      alerts.push({ code: 'signer_balance_empty', severity: 'critical', detail: { octas: 0 } });
    } else if (input.balanceOctas < input.minBalanceOctas) {
      alerts.push({
        code: 'signer_balance_low',
        severity: 'warning',
        detail: { octas: input.balanceOctas, floor: input.minBalanceOctas },
      });
    }
  }

  if (input.unexplainedSignerTransactions > 0) {
    alerts.push({
      code: 'unexplained_signer_activity',
      severity: 'warning',
      detail: { count: input.unexplainedSignerTransactions },
    });
  }

  if (input.failedBatches > 0) {
    alerts.push({
      code: 'batches_failed',
      severity: 'warning',
      detail: { count: input.failedBatches },
    });
  }

  /*
   * Measured against the SLO window rather than a fixed number of ticks: a
   * batch that has been open longer than the window it promised is late by
   * definition, whatever the schedule happens to be (proposal 4.8).
   */
  if (input.oldestOpenBatchAgeMs !== null && input.oldestOpenBatchAgeMs > input.sloWindowMs) {
    alerts.push({
      code: 'backlog_stalled',
      severity: 'warning',
      detail: {
        oldestOpenMinutes: Math.round(input.oldestOpenBatchAgeMs / 60_000),
        sloMinutes: Math.round(input.sloWindowMs / 60_000),
      },
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** One alert as a log line: stable, greppable, and safe to forward. */
export function formatAnchorAlert(alert: AnchorAlert): string {
  const detail = Object.entries(alert.detail)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  return `anchor-alert ${alert.severity} ${alert.code}${detail ? ` ${detail}` : ''}`;
}
