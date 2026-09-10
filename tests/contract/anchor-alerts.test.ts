/**
 * Every alerting condition, shown firing.
 *
 * The rules are a function over a state, so proving each one triggers -- and
 * that none of them carries anything it should not -- is a test rather than an
 * incident someone has to stage. Deliberately few: what is not alerted on is
 * reported as a number on the console instead, because a rule needing its own
 * setting is a rule that can disagree with the setting.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateAnchorAlerts,
  formatAnchorAlert,
  type AnchorAlertInput,
} from '@/lib/domain/anchor-alerts';

const HEALTHY: AnchorAlertInput = {
  configured: true,
  balanceOctas: 996_286_800,
  minBalanceOctas: 50_000_000,
  monitorReachable: true,
  monitorError: null,
  failedBatches: 0,
  oldestOpenBatchAgeMs: null,
  sloWindowMs: 2 * 60 * 60 * 1000,
};

const codes = (input: Partial<AnchorAlertInput>) =>
  evaluateAnchorAlerts({ ...HEALTHY, ...input }).map((alert) => alert.code);

describe('evaluateAnchorAlerts', () => {
  it('says nothing when everything is fine', () => {
    expect(evaluateAnchorAlerts(HEALTHY)).toEqual([]);
  });

  /* A deployment with anchoring switched off is not an incident. */
  it('says nothing when anchoring is not configured', () => {
    expect(codes({ configured: false, monitorReachable: false })).toEqual([]);
  });

  it('fires when the watch itself cannot answer', () => {
    expect(codes({ monitorReachable: false, monitorError: 'indexer_query_failed' })).toContain(
      'monitor_unreachable',
    );
  });

  it('separates an empty account from a low one', () => {
    expect(codes({ balanceOctas: 0 })).toContain('signer_balance_empty');
    expect(codes({ balanceOctas: 1_000 })).toContain('signer_balance_low');
    expect(codes({ balanceOctas: null })).toEqual([]);
  });

  it('fires on batches that were given up on', () => {
    expect(codes({ failedBatches: 1 })).toContain('batches_failed');
  });

  it('fires when a batch has been open longer than the SLO window', () => {
    expect(codes({ oldestOpenBatchAgeMs: 3 * 60 * 60 * 1000 })).toContain('backlog_stalled');
    expect(codes({ oldestOpenBatchAgeMs: 60 * 60 * 1000 })).toEqual([]);
  });

  it('puts critical conditions first', () => {
    const alerts = evaluateAnchorAlerts({
      ...HEALTHY,
      monitorReachable: false,
      balanceOctas: 1_000,
      failedBatches: 2,
    });
    expect(alerts[0]?.severity).toBe('critical');
    expect(alerts.map((alert) => alert.severity)).toEqual(['critical', 'warning', 'warning']);
  });

  /*
   * architecture.md 17.2: an alert travels further than a console session. A
   * detail field that ever held a preimage, a title or key material would leak
   * by the same route that makes alerts useful.
   */
  it('carries only ids, counts and codes', () => {
    const alerts = evaluateAnchorAlerts({
      ...HEALTHY,
      balanceOctas: 0,
      failedBatches: 1,
      oldestOpenBatchAgeMs: 9 * 60 * 60 * 1000,
      monitorReachable: false,
      monitorError: 'indexer_http_500',
    });
    for (const alert of alerts) {
      for (const value of Object.values(alert.detail)) {
        expect(typeof value === 'number' || /^[a-z0-9_]+$/.test(String(value))).toBe(true);
      }
    }
  });

  it('formats a line that can be grepped and forwarded', () => {
    expect(
      formatAnchorAlert({
        code: 'signer_balance_low',
        severity: 'warning',
        detail: { octas: 1000, floor: 50000000 },
      }),
    ).toBe('anchor-alert warning signer_balance_low octas=1000 floor=50000000');
  });
});
