'use server';

import { revalidatePath } from 'next/cache';
import { AppError } from '@/contracts/errors';
import { createApiKey, revokeApiKey } from '@/lib/application/auth';
import { requireSession } from '@/lib/http/session';

/**
 * Key management actions. Each re-resolves the session: a server action is a
 * public endpoint with a generated name, and the page rendering a button says
 * nothing about who can post to it.
 */
export interface CreateKeyResult {
  ok: boolean;
  /** The plaintext, exactly once. It is never retrievable again. */
  key?: string;
  name?: string;
  error?: 'invalid' | 'limit' | 'unavailable';
}

export async function createApiKeyAction(
  _previous: CreateKeyResult | null,
  form: FormData,
): Promise<CreateKeyResult> {
  const session = await requireSession('/dashboard/api-keys');
  try {
    const name = String(form.get('name') ?? '');
    const { key } = await createApiKey({ workspaceId: session.workspace.id, name });
    revalidatePath('/dashboard/api-keys');
    revalidatePath('/dashboard');
    return { ok: true, key, name: name.trim() };
  } catch (error) {
    if (error instanceof AppError && error.code === 'invalid_request') {
      return { ok: false, error: 'invalid' };
    }
    if (error instanceof AppError && error.code === 'api_key_limit_exceeded') {
      return { ok: false, error: 'limit' };
    }
    console.error(`create key failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}

export async function revokeApiKeyAction(form: FormData): Promise<void> {
  const session = await requireSession('/dashboard/api-keys');
  const keyId = String(form.get('keyId') ?? '');
  if (keyId) {
    await revokeApiKey({ workspaceId: session.workspace.id, keyId });
    revalidatePath('/dashboard/api-keys');
    revalidatePath('/dashboard');
  }
}
