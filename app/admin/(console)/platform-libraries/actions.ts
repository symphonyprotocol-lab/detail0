'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  createPlatformLibrary,
  requestPlatformLibraryRefresh,
  setPlatformLibraryLifecycle,
} from '@/lib/application/administration';
import { AdminChangeRefused } from '@/lib/domain/admin';
import {
  isPlatformLifecycleAction,
  PlatformLibraryRefused,
  type PlatformLibraryError,
} from '@/lib/domain/library';
import { requireAdminCapability } from '@/lib/http/admin';

/**
 * The three mutations behind the platform-library screens.
 *
 * Each one re-resolves the session and re-checks the capability, like every
 * other console action: a server action is a public endpoint with a generated
 * name, and that a screen only renders a control for entitled operators says
 * nothing about who can post to it.
 */
export interface PlatformLibraryActionResult {
  ok: boolean;
  error?: PlatformLibraryError;
  /** Set on a successful create, so the dialog can name what it made. */
  libraryId?: string;
  publicId?: string;
  /** Set on a refresh: false means one was already queued. */
  queued?: boolean;
}

async function clientAddress(): Promise<string | null> {
  const bag = await headers();
  return bag.get('x-forwarded-for')?.split(',')[0]?.trim() ?? bag.get('x-real-ip');
}

/**
 * Maps a thrown refusal onto a code the dialog has a sentence for.
 *
 * `normalizeReason` is shared with the administrator screens and throws the
 * administrator refusal, so its one reachable code is translated rather than
 * flattened into a field error the operator would go looking for.
 */
function refused(error: unknown, context: string): PlatformLibraryActionResult {
  if (error instanceof PlatformLibraryRefused) return { ok: false, error: error.code };
  if (error instanceof AdminChangeRefused && error.code === 'reason_required') {
    return { ok: false, error: 'reason_required' };
  }
  console.error(
    `${context} failed: ${error instanceof Error ? error.message : 'unknown'}`,
  );
  return { ok: false, error: 'unavailable' };
}

const text = (form: FormData, field: string) => String(form.get(field) ?? '');

export async function createPlatformLibraryAction(
  _previous: PlatformLibraryActionResult | null,
  form: FormData,
): Promise<PlatformLibraryActionResult> {
  const session = await requireAdminCapability('platformLibraries');
  try {
    const { libraryId, publicId } = await createPlatformLibrary({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: await clientAddress(),
      },
      title: text(form, 'title'),
      publicId: text(form, 'publicId'),
      sourceType: text(form, 'sourceType'),
      location: text(form, 'location'),
      refreshPolicy: text(form, 'refreshPolicy'),
      description: text(form, 'description'),
      domainTag: text(form, 'domainTag'),
      language: text(form, 'language'),
      reason: text(form, 'reason'),
    });
    revalidatePath('/admin/platform-libraries');
    return { ok: true, libraryId, publicId };
  } catch (error) {
    return refused(error, 'platform library create');
  }
}

export async function setPlatformLifecycleAction(
  _previous: PlatformLibraryActionResult | null,
  form: FormData,
): Promise<PlatformLibraryActionResult> {
  const session = await requireAdminCapability('platformLibraries');
  const action = text(form, 'action');
  if (!isPlatformLifecycleAction(action)) return { ok: false, error: 'invalid_transition' };

  const libraryId = text(form, 'libraryId');
  try {
    await setPlatformLibraryLifecycle({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: await clientAddress(),
      },
      libraryId,
      action,
      reason: text(form, 'reason'),
    });
    // The list shows the status too, and its tab counts move with it.
    revalidatePath('/admin/platform-libraries');
    revalidatePath(`/admin/platform-libraries/${libraryId}`);
    return { ok: true, libraryId };
  } catch (error) {
    return refused(error, 'platform library lifecycle');
  }
}

export async function refreshPlatformLibraryAction(
  _previous: PlatformLibraryActionResult | null,
  form: FormData,
): Promise<PlatformLibraryActionResult> {
  const session = await requireAdminCapability('platformLibraries');
  const libraryId = text(form, 'libraryId');
  try {
    const { created } = await requestPlatformLibraryRefresh({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: await clientAddress(),
      },
      libraryId,
      reason: text(form, 'reason'),
    });
    /*
     * The list's queue figure moves with this too, which is why both paths are
     * revalidated for what looks like a change to one library.
     */
    revalidatePath('/admin/platform-libraries');
    revalidatePath(`/admin/platform-libraries/${libraryId}`);
    return { ok: true, libraryId, queued: created };
  } catch (error) {
    return refused(error, 'platform library refresh');
  }
}
