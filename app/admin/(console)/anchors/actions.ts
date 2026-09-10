'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { releaseFailedBatch, setAnchorPause } from '@/lib/application/administration';
import { AdminChangeRefused } from '@/lib/domain/admin';
import { requireAdminCapability } from '@/lib/http/admin';
import { clientAddress } from '@/lib/http/client-address';

/**
 * The console's two moves over anchoring. architecture.md 14.
 *
 * Each re-resolves the session and re-checks the capability. That is not belt
 * and braces: a server action is a public endpoint with a generated name, and
 * the page only rendering these controls for an entitled operator says nothing
 * about who can post to them.
 *
 * Each takes a reason, and the use case writes the audit row. Both change what
 * does or does not reach an irreversible ledger, which is precisely the kind of
 * action requirement.md 5.3 wants a record of.
 */
export interface AnchorAdminActionResult {
  ok: boolean;
  error?: 'not_found' | 'invalid_input' | 'reason_required' | 'unavailable';
  /** Set on a release: how many subjects went back in the queue. */
  released?: number;
}

function refused(error: unknown, context: string): AnchorAdminActionResult {
  if (error instanceof AdminChangeRefused) {
    if (
      error.code === 'not_found' ||
      error.code === 'invalid_input' ||
      error.code === 'reason_required'
    ) {
      return { ok: false, error: error.code };
    }
  }
  console.error(`${context} failed: ${error instanceof Error ? error.message : 'unknown'}`);
  return { ok: false, error: 'unavailable' };
}

async function actor() {
  const session = await requireAdminCapability('audit');
  return {
    administratorId: session.administratorId,
    clientAddress: clientAddress(await headers()),
  };
}

export async function setAnchorPauseAction(
  _state: AnchorAdminActionResult | null,
  form: FormData,
): Promise<AnchorAdminActionResult> {
  try {
    await setAnchorPause({
      paused: form.get('paused') === 'true',
      reason: String(form.get('reason') ?? ''),
      actor: await actor(),
    });
    revalidatePath('/admin/anchors');
    return { ok: true };
  } catch (error) {
    return refused(error, 'anchor pause');
  }
}

export async function releaseAnchorBatchAction(
  _state: AnchorAdminActionResult | null,
  form: FormData,
): Promise<AnchorAdminActionResult> {
  try {
    const released = await releaseFailedBatch({
      batchId: String(form.get('batchId') ?? ''),
      reason: String(form.get('reason') ?? ''),
      actor: await actor(),
    });
    revalidatePath('/admin/anchors');
    return { ok: true, released: released.released };
  } catch (error) {
    return refused(error, 'anchor batch release');
  }
}
