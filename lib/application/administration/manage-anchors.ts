/**
 * The one move the console has over anchoring.
 *
 * High-risk in architecture.md 14's sense -- it changes what does or does not
 * reach an irreversible ledger -- so it takes a reason and writes an audit row,
 * like every other console action.
 *
 * It is deliberately narrow, and the naming matters. aptos-anchoring-
 * proposal.md 4.5.1's "re-anchor" is what happens when the *leaf construction*
 * is found defective: the affected subjects are anchored again under a new
 * `leaf_schema_version` and the old batches stay, superseded, as history. That
 * is a deploy, not a button, and no operator action here does it.
 *
 * What an operator does need is the other case: a batch that never landed --
 * submission exhausted its attempts, or the chain aborted it -- whose subjects
 * are otherwise stranded reading `unavailable` forever. Releasing it puts them
 * back in the queue under the same schema, which is only sound because nothing
 * about that batch was ever published. A confirmed batch is refused: its leaves
 * are evidence, and this is not a tool for editing evidence.
 */
import { and, count, eq } from 'drizzle-orm';
import { AdminChangeRefused } from '@/lib/domain/admin';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { recordAudit } from './audit';

export interface AnchorAdminActor {
  administratorId: string;
  clientAddress?: string | null;
}

export interface ReleasedBatch {
  batchId: string;
  subjectType: string;
  /** Subjects put back in the queue. */
  released: number;
}

/**
 * Put a failed batch's subjects back in the queue.
 *
 * The leaves go, the batch row stays. That asymmetry is the point: the row
 * keeps the record that a batch existed, what root it computed and how many
 * attempts it took, while the leaves have to go because `anchor_leaf` is unique
 * per (subject, subject_id, leaf_schema_version) and that uniqueness is exactly
 * what stops the workflow from picking those subjects up again.
 */
export async function releaseFailedBatch(input: {
  batchId: string;
  reason: string;
  actor: AnchorAdminActor;
}): Promise<ReleasedBatch> {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new AdminChangeRefused('reason_required', 'a reason is required');
  }

  const [batch] = await db()
    .select({
      id: schema.anchorBatch.id,
      status: schema.anchorBatch.status,
      subjectType: schema.anchorBatch.subjectType,
      merkleRoot: schema.anchorBatch.merkleRoot,
      attempts: schema.anchorBatch.attempts,
    })
    .from(schema.anchorBatch)
    .where(eq(schema.anchorBatch.id, input.batchId))
    .limit(1);
  if (!batch) throw new AdminChangeRefused('not_found', 'no such batch');

  /*
   * Only a batch that never landed. `confirmed` is refused because its leaves
   * are the evidence a third party checks; `pending` and `submitted` are
   * refused because they are still moving, and releasing a batch whose
   * transaction the chain later accepts would anchor the same subjects twice.
   */
  if (batch.status !== 'failed') {
    throw new AdminChangeRefused('invalid_input', 'only a failed batch can be released');
  }

  const [leaves] = await db()
    .select({ n: count() })
    .from(schema.anchorLeaf)
    .where(eq(schema.anchorLeaf.batchId, batch.id));

  await db().transaction(async (tx) => {
    await tx.delete(schema.anchorLeaf).where(eq(schema.anchorLeaf.batchId, batch.id));
    await tx
      .update(schema.anchorBatch)
      .set({ status: 'superseded' })
      .where(and(eq(schema.anchorBatch.id, batch.id), eq(schema.anchorBatch.status, 'failed')));
  });

  await recordAudit({
    administratorId: input.actor.administratorId,
    action: 'anchor.release_batch',
    targetType: 'anchor_batch',
    targetId: batch.id,
    reason,
    beforeValue: { status: batch.status, attempts: batch.attempts, merkleRoot: batch.merkleRoot },
    afterValue: { status: 'superseded', releasedLeaves: leaves?.n ?? 0 },
    clientAddress: input.actor.clientAddress ?? null,
    result: 'success',
  });

  return { batchId: batch.id, subjectType: batch.subjectType, released: leaves?.n ?? 0 };
}
