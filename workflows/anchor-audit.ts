/**
 * Workflow: anchor-audit
 *
 * Every step must be idempotent and resumable, deduped by digest and operation id.
 * architecture.md 8.2.
 *
 * One transaction a day, committing the previous UTC day's audit chain head
 * (aptos-anchoring-proposal.md 2.1). There is no schedule state: the leaf's
 * subject id is the date and `anchor_leaf` is unique on it, so running this at
 * every cron tick anchors each day exactly once.
 */
import { anchorAuditHead, type AnchorRunResult } from '@/lib/application/anchors';

export async function run(): Promise<AnchorRunResult> {
  const result = await anchorAuditHead();
  if (result.skipped) return result;
  console.info(
    `anchor-audit: planned ${result.planned}, submitted ${result.submitted}, confirmed ${result.confirmed}, failed ${result.failed}`,
  );
  return result;
}
