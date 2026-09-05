'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { reviewUserLibrary } from '@/lib/application/administration';
import { AdminChangeRefused } from '@/lib/domain/admin';
import { isUserReviewAction, PlatformLibraryRefused } from '@/lib/domain/library';
import { requireAdminCapability } from '@/lib/http/admin';
import { clientAddress } from '@/lib/http/client-address';
import type { PlatformLibraryActionResult } from '../platform-libraries/actions';

/**
 * The one mutation behind the user-library screens: a review decision.
 *
 * Re-resolves the session and re-checks the `libraries` capability like every
 * console action -- a server action is a public endpoint with a generated
 * name. The result shape is shared with the platform-library actions so the
 * dialogs can share their refusal copy.
 */
export async function reviewUserLibraryAction(
  _previous: PlatformLibraryActionResult | null,
  form: FormData,
): Promise<PlatformLibraryActionResult> {
  const session = await requireAdminCapability('libraries');
  const libraryId = String(form.get('libraryId') ?? '');
  const action = String(form.get('action') ?? '');
  if (!isUserReviewAction(action)) return { ok: false, error: 'invalid_transition' };

  try {
    await reviewUserLibrary({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: clientAddress(await headers()),
      },
      libraryId,
      action,
      reason: String(form.get('reason') ?? ''),
    });
    revalidatePath('/admin/libraries');
    revalidatePath(`/admin/libraries/${libraryId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof PlatformLibraryRefused) return { ok: false, error: error.code };
    if (error instanceof AdminChangeRefused && error.code === 'reason_required') {
      return { ok: false, error: 'reason_required' };
    }
    console.error(`review library failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}
