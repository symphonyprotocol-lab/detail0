'use server';

import { AppError } from '@/contracts/errors';
import { createWorkspaceLibrary } from '@/lib/application/libraries';
import { isPlatformSourceType } from '@/lib/domain/library';
import { requireSession } from '@/lib/http/session';

/**
 * The wizard's one mutation. Re-resolves the session like every action -- a
 * server action is a public endpoint with a generated name -- and returns a
 * coarse error code the wizard translates; detail stays server side.
 */
export interface CreateLibraryResult {
  ok: boolean;
  publicId?: string;
  error?: 'invalid' | 'taken' | 'limit' | 'unavailable';
}

export async function createWorkspaceLibraryAction(
  _previous: CreateLibraryResult | null,
  form: FormData,
): Promise<CreateLibraryResult> {
  const session = await requireSession('/dashboard/libraries/new');
  try {
    const sourceType = String(form.get('sourceType') ?? '');
    if (!isPlatformSourceType(sourceType)) return { ok: false, error: 'invalid' };
    const visibility = form.get('visibility') === 'private' ? 'private' : 'public';

    const { publicId } = await createWorkspaceLibrary({
      workspaceId: session.workspace.id,
      title: String(form.get('title') ?? ''),
      visibility,
      sourceType,
      location: String(form.get('location') ?? ''),
      slug: String(form.get('slug') ?? ''),
      description: String(form.get('description') ?? '') || null,
      language: String(form.get('language') ?? '') || null,
    });
    return { ok: true, publicId };
  } catch (error) {
    if (error instanceof AppError && error.code === 'library_limit_exceeded') {
      return { ok: false, error: 'limit' };
    }
    if (error instanceof AppError && error.code === 'invalid_request') {
      return { ok: false, error: error.message.includes('taken') ? 'taken' : 'invalid' };
    }
    console.error(`create library failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}
