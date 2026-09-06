'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { AppError } from '@/contracts/errors';
import { runOperation } from '@/lib/application/ingestion';
import { requestLibraryRebuild } from '@/lib/application/libraries';
import { requireSession } from '@/lib/http/session';

/** The library page's one mutation: queue a rebuild and start it. */
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
