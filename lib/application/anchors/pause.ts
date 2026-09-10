/**
 * Whether anchoring is paused right now.
 *
 * The read lives here, beside the workflow that has to obey it; the write lives
 * in lib/application/administration, because pausing is an audited console
 * action and this is not. `anchor_control` is append-only, so "in force" means
 * the newest row.
 */
import { desc } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';

export interface AnchorPauseState {
  paused: boolean;
  reason: string | null;
  since: Date | null;
}

export async function anchorPauseState(): Promise<AnchorPauseState> {
  const [row] = await db()
    .select({
      paused: schema.anchorControl.paused,
      reason: schema.anchorControl.reason,
      createdAt: schema.anchorControl.createdAt,
    })
    .from(schema.anchorControl)
    .orderBy(desc(schema.anchorControl.createdAt))
    .limit(1);
  if (!row) return { paused: false, reason: null, since: null };
  return { paused: row.paused, reason: row.reason, since: row.createdAt };
}
