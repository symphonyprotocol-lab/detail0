/**
 * Workflow: anchor-versions
 *
 * Every step must be idempotent and resumable, deduped by digest and operation id.
 * architecture.md 8.2.
 *
 * Cron-triggered, and a side path: it reads what publishing already wrote and
 * writes nothing publishing depends on, so a failure here leaves versions
 * published, retrievable and citable, with their anchor status stopped at
 * `pending` (aptos-anchoring-proposal.md 4.1, 4.8). Resumability is the
 * database's: a batch and its leaves land in one transaction, `anchor_leaf` is
 * unique per subject and schema, and a run that dies mid-flight is continued by
 * the next one rather than duplicated.
 */
import { anchorPublishedVersions, type AnchorRunResult } from '@/lib/application/anchors';

export async function run(): Promise<AnchorRunResult> {
  const result = await anchorPublishedVersions();
  if (result.skipped) return result;
  console.info(
    `anchor-versions: planned ${result.planned}, submitted ${result.submitted}, confirmed ${result.confirmed}, failed ${result.failed}`,
  );
  return result;
}
