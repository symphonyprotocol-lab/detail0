'use server';

import { after } from 'next/server';
import { AppError } from '@/contracts/errors';
import { runOperation } from '@/lib/application/ingestion';
import { createWorkspaceLibrary, prepareUploads, type PreparedUpload } from '@/lib/application/libraries';
import { isConnectedSourceType, UPLOAD_LIMITS } from '@/lib/domain/library';
import { requireSession } from '@/lib/http/session';

/**
 * The wizard's one mutation. Re-resolves the session like every action -- a
 * server action is a public endpoint with a generated name -- and returns a
 * coarse error code the wizard translates; detail stays server side.
 */
export interface CreateLibraryResult {
  ok: boolean;
  publicId?: string;
  /** Where the files page of a PDF library created without files is. */
  libraryId?: string;
  error?: 'invalid' | 'taken' | 'limit' | 'unavailable';
}

export async function createWorkspaceLibraryAction(
  _previous: CreateLibraryResult | null,
  form: FormData,
): Promise<CreateLibraryResult> {
  const session = await requireSession('/dashboard/libraries/new');
  try {
    const sourceType = String(form.get('sourceType') ?? '');
    if (!isConnectedSourceType(sourceType)) return { ok: false, error: 'invalid' };
    const visibility = form.get('visibility') === 'private' ? 'private' : 'public';

    /* The wizard posts an empty manifest field when no file was uploaded;
       that is an empty PDF library, filled in from its files page. */
    let uploads: unknown;
    const posted = String(form.get('uploads') ?? '');
    if (sourceType === 'pdf' && posted !== '') {
      try {
        uploads = JSON.parse(posted);
      } catch {
        return { ok: false, error: 'invalid' };
      }
    }

    const { publicId, libraryId, operationId } = await createWorkspaceLibrary({
      workspaceId: session.workspace.id,
      role: session.workspace.role,
      title: String(form.get('title') ?? ''),
      visibility,
      sourceType,
      location: String(form.get('location') ?? ''),
      slug: String(form.get('slug') ?? ''),
      uploads,
      description: String(form.get('description') ?? '') || null,
      language: String(form.get('language') ?? '') || null,
    });
    /* Queued, and then run after the response: the wizard says "queued" at
       once, and by the time the owner opens the library page the first build
       has usually finished. A drain that overlaps loses the claim and does
       nothing; a failure lands on the operation row, not here. */
    if (operationId) {
      after(async () => {
        try {
          await runOperation({ operationId });
        } catch (error) {
          console.error(`library build run failed: ${error instanceof Error ? error.message : 'unknown'}`);
        }
      });
    }
    return { ok: true, publicId, libraryId };
  } catch (error) {
    if (error instanceof AppError && error.code === 'library_limit_exceeded') {
      return { ok: false, error: 'limit' };
    }
    if (error instanceof AppError && error.code === 'invalid_request') {
      return { ok: false, error: error.message.includes('taken') ? 'taken' : 'invalid' };
    }
    if (error instanceof AppError && error.code === 'provider_unavailable') {
      return { ok: false, error: 'unavailable' };
    }
    console.error(`create library failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}

/**
 * Room in the store for the PDFs the wizard is about to upload: one upload
 * ticket per file. The browser uploads straight to storage, so a 20 MB
 * manual never passes through a server action and its body limit.
 * Returns a coarse code like the create action; the size limit is repeated
 * in the result so the wizard can say it without a second round trip.
 */
export interface PrepareUploadResult {
  ok: boolean;
  batchId?: string;
  files?: PreparedUpload[];
  maxFileBytes: number;
  error?: 'invalid' | 'too_large' | 'access_denied' | 'unavailable';
}

export async function prepareUploadAction(
  files: { name: string; size: number }[],
  batchId?: string,
): Promise<PrepareUploadResult> {
  /* Shared with the library files page, which hands the same action to the
     same uploader; the session is what matters, not the page. */
  const session = await requireSession('/dashboard/libraries');
  const maxFileBytes = UPLOAD_LIMITS.maxFileBytes;
  if (!Array.isArray(files) || files.length > UPLOAD_LIMITS.maxFiles) {
    return { ok: false, maxFileBytes, error: 'invalid' };
  }
  try {
    const prepared = await prepareUploads({
      workspaceId: session.workspace.id,
      role: session.workspace.role,
      files: files.map((file) => ({ name: String(file?.name ?? ''), size: Number(file?.size) })),
      batchId: typeof batchId === 'string' ? batchId : undefined,
    });
    return { ok: true, maxFileBytes, ...prepared };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'library_size_exceeded') return { ok: false, maxFileBytes, error: 'too_large' };
      if (error.code === 'access_denied') return { ok: false, maxFileBytes, error: 'access_denied' };
      if (error.code === 'invalid_request') return { ok: false, maxFileBytes, error: 'invalid' };
    }
    console.error(`prepare upload failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, maxFileBytes, error: 'unavailable' };
  }
}
