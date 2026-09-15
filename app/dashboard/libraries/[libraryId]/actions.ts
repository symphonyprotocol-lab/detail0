'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { AppError } from '@/contracts/errors';
import { runOperation } from '@/lib/application/ingestion';
import {
  applyOwnerLifecycleAction,
  editLibraryMetadata,
  requestLibraryRebuild,
  updateParseScope,
} from '@/lib/application/libraries';
import type { LifecycleStatus } from '@/lib/domain';
import {
  isOwnerLifecycleAction,
  PlatformLibraryRefused,
  type OwnerLifecycleAction,
} from '@/lib/domain/library';
import { requireSession } from '@/lib/http/session';

/** Queue a rebuild and start it. Also handed to the list's per-row refresh control. */
export interface RebuildLibraryActionResult {
  ok: boolean;
  /** False when a pending build was already waiting. */
  created?: boolean;
  error?: 'not_found' | 'access_denied' | 'invalid' | 'quota' | 'unavailable';
}

export async function rebuildLibraryAction(
  _previous: RebuildLibraryActionResult | null,
  form: FormData,
): Promise<RebuildLibraryActionResult> {
  const libraryId = String(form.get('libraryId') ?? '');
  const session = await requireSession(`/dashboard/libraries/${libraryId}`);
  try {
    const { operationId, created } = await requestLibraryRebuild({
      workspaceId: session.workspace.id,
      role: session.workspace.role,
      libraryId,
    });
    revalidatePath(`/dashboard/libraries/${libraryId}`);
    revalidatePath('/dashboard/libraries');
    /* Run whether this call queued it or found it waiting: a pending row
       nobody has claimed yet is exactly what the owner is asking about, and
       `runOperation` claims conditionally, so a drain that gets there first
       simply wins. */
    {
      after(async () => {
        try {
          await runOperation({ operationId });
        } catch (error) {
          console.error(`library rebuild run failed: ${error instanceof Error ? error.message : 'unknown'}`);
        }
      });
    }
    return { ok: true, created };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'library_not_found') return { ok: false, error: 'not_found' };
      if (error.code === 'access_denied') return { ok: false, error: 'access_denied' };
      if (error.code === 'invalid_request') return { ok: false, error: 'invalid' };
      if (error.code === 'quota_exceeded') return { ok: false, error: 'quota' };
    }
    console.error(`rebuild library failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}

/* ------------------------------------------------------ owner management */

/**
 * The owner's verbs beside rebuild (requirement.md 5.2): pause, resume and
 * resubmit, each answering with where the library now is. The use case
 * re-checks the role and the domain rule; the page only decides what is
 * drawn.
 */
export interface OwnerLifecycleActionResult {
  ok: boolean;
  action?: OwnerLifecycleAction;
  lifecycleStatus?: LifecycleStatus;
  /** Pause only: queued fetches withdrawn with it. */
  cancelledOperations?: number;
  error?: 'not_found' | 'access_denied' | 'invalid' | 'unavailable';
}

export async function ownerLifecycleAction(
  _previous: OwnerLifecycleActionResult | null,
  form: FormData,
): Promise<OwnerLifecycleActionResult> {
  const libraryId = String(form.get('libraryId') ?? '');
  const action = String(form.get('action') ?? '');
  const session = await requireSession(`/dashboard/libraries/${libraryId}`);
  if (!isOwnerLifecycleAction(action)) return { ok: false, error: 'invalid' };
  try {
    const result = await applyOwnerLifecycleAction({
      workspaceId: session.workspace.id,
      role: session.workspace.role,
      libraryId,
      action,
    });
    revalidatePath(`/dashboard/libraries/${libraryId}`);
    revalidatePath('/dashboard/libraries');
    return {
      ok: true,
      action,
      lifecycleStatus: result.lifecycleStatus,
      cancelledOperations: result.cancelledOperations,
    };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'library_not_found') return { ok: false, error: 'not_found' };
      if (error.code === 'access_denied') return { ok: false, error: 'access_denied' };
      if (error.code === 'invalid_request') return { ok: false, error: 'invalid' };
    }
    console.error(`${action} library failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}

/** Edit title, description, language and visibility. */
export interface EditLibraryMetadataActionResult {
  ok: boolean;
  lifecycleStatus?: LifecycleStatus;
  /** True when the visibility change queued the library for review. */
  queuedForReview?: boolean;
  error?:
    | 'not_found'
    | 'access_denied'
    | 'invalid_title'
    | 'invalid_metadata'
    | 'archived'
    | 'unavailable';
}

export async function editLibraryMetadataAction(
  _previous: EditLibraryMetadataActionResult | null,
  form: FormData,
): Promise<EditLibraryMetadataActionResult> {
  const libraryId = String(form.get('libraryId') ?? '');
  const session = await requireSession(`/dashboard/libraries/${libraryId}`);
  try {
    const result = await editLibraryMetadata({
      workspaceId: session.workspace.id,
      role: session.workspace.role,
      libraryId,
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      language: String(form.get('language') ?? ''),
      visibility: String(form.get('visibility') ?? ''),
    });
    revalidatePath(`/dashboard/libraries/${libraryId}`);
    revalidatePath('/dashboard/libraries');
    return { ok: true, lifecycleStatus: result.lifecycleStatus, queuedForReview: result.queuedForReview };
  } catch (error) {
    if (error instanceof PlatformLibraryRefused) {
      if (error.code === 'invalid_title') return { ok: false, error: 'invalid_title' };
      if (error.code === 'archived') return { ok: false, error: 'archived' };
      return { ok: false, error: 'invalid_metadata' };
    }
    if (error instanceof AppError) {
      if (error.code === 'library_not_found') return { ok: false, error: 'not_found' };
      if (error.code === 'access_denied') return { ok: false, error: 'access_denied' };
      if (error.code === 'invalid_request') return { ok: false, error: 'invalid_metadata' };
    }
    console.error(`edit library failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}

/** Configure the parse scope (and the refresh cadence where the source has one). */
export interface UpdateParseScopeActionResult {
  ok: boolean;
  /** True when a rebuild is what applies the saved scope. */
  rebuildAdvised?: boolean;
  /** With `error: 'invalid_scope'`: the entry that was refused, when one was. */
  detail?: string;
  error?:
    | 'not_found'
    | 'access_denied'
    | 'unsupported'
    | 'invalid_scope'
    | 'invalid_refresh_policy'
    | 'unavailable';
}

export async function updateParseScopeAction(
  _previous: UpdateParseScopeActionResult | null,
  form: FormData,
): Promise<UpdateParseScopeActionResult> {
  const libraryId = String(form.get('libraryId') ?? '');
  const session = await requireSession(`/dashboard/libraries/${libraryId}`);
  try {
    const result = await updateParseScope({
      workspaceId: session.workspace.id,
      role: session.workspace.role,
      libraryId,
      folders: String(form.get('folders') ?? ''),
      excludeFolders: String(form.get('excludeFolders') ?? ''),
      excludeFiles: String(form.get('excludeFiles') ?? ''),
      indexDepth: String(form.get('indexDepth') ?? ''),
      refreshPolicy: String(form.get('refreshPolicy') ?? ''),
    });
    revalidatePath(`/dashboard/libraries/${libraryId}`);
    return { ok: true, rebuildAdvised: result.rebuildAdvised };
  } catch (error) {
    if (error instanceof PlatformLibraryRefused) {
      if (error.code === 'unsupported_source') return { ok: false, error: 'unsupported' };
      if (error.code === 'invalid_refresh_policy') return { ok: false, error: 'invalid_refresh_policy' };
      return { ok: false, error: 'invalid_scope', detail: error.message };
    }
    if (error instanceof AppError) {
      if (error.code === 'library_not_found') return { ok: false, error: 'not_found' };
      if (error.code === 'access_denied') return { ok: false, error: 'access_denied' };
      if (error.code === 'invalid_request') return { ok: false, error: 'invalid_scope' };
    }
    console.error(`configure library failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}
