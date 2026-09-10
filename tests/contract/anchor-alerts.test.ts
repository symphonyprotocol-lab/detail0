/**
 * aptos-anchoring-proposal.md 4.11 gate 8 wants the contract-change alert shown
 * to fire before the first mainnet batch. These are that demonstration: the
 * rules are a function over a state, so proving each one triggers -- and that
 * none of them carries anything it should not -- is a test rather than an
 * incident someone has to stage.
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
  publishes: 1,
  expectedPublishes: 1,
  unexplainedSignerTransactions: 0,
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
    expect(codes({ configured: false, monitorReachable: false, publishes: 9 })).toEqual([]);
  });

  it('fires on a publish nobody announced', () => {
    expect(codes({ publishes: 2 })).toContain('unannounced_upgrade');
  });

  it('does not fire when the extra publish was announced', () => {
    expect(codes({ publishes: 2, expectedPublishes: 2 })).toEqual([]);
  });

  it('fires when the watch itself cannot answer', () => {
    expect(codes({ monitorReachable: false, monitorError: 'indexer_query_failed' })).toContain(
      'monitor_unreachable',
    );
  });

  /* Sharing one key collapses anchoring and its detection into one failure. */
  it('names the shared credential specifically', () => {
    expect(
      codes({ monitorReachable: false, monitorError: 'monitor_key_not_isolated' }),
    ).toContain('monitor_key_not_isolated');
  });

  it('separates an empty account from a low one', () => {
    expect(codes({ balanceOctas: 0 })).toContain('signer_balance_empty');
    expect(codes({ balanceOctas: 1_000 })).toContain('signer_balance_low');
    expect(codes({ balanceOctas: null })).toEqual([]);
  });

  it('fires on signer activity the platform cannot account for', () => {
    expect(codes({ unexplainedSignerTransactions: 7 })).toContain('unexplained_signer_activity');
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
      publishes: 3,
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
      publishes: 4,
      balanceOctas: 0,
      unexplainedSignerTransactions: 3,
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
        code: 'unannounced_upgrade',
        severity: 'critical',
        detail: { publishes: 2, expected: 1, unannounced: 1 },
      }),
    ).toBe('anchor-alert critical unannounced_upgrade publishes=2 expected=1 unannounced=1');
  });
});
