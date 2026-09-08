'use server';

import { revalidatePath } from 'next/cache';
import { AppError } from '@/contracts/errors';
import { createApiKey, revokeApiKey, rotateApiKey } from '@/lib/application/auth';
import { parseScopes } from '@/lib/domain/api-key';
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
  error?: 'invalid' | 'scopes' | 'limit' | 'denied' | 'unavailable';
}

export async function createApiKeyAction(
  _previous: CreateKeyResult | null,
  form: FormData,
): Promise<CreateKeyResult> {
  const session = await requireSession('/dashboard/api-keys');
  try {
    const name = String(form.get('name') ?? '');
    const scopes = form.getAll('scopes').map(String);
    /* Named before the use case refuses it, so the form can say which field. */
    if (!parseScopes(scopes)) return { ok: false, error: 'scopes' };
    const { key } = await createApiKey({
      workspaceId: session.workspace.id,
      role: session.workspace.role,
      name,
      environment: String(form.get('environment') ?? 'live'),
      scopes,
    });
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
    /* Not "try again shortly": a developer or admin retrying will be refused
       every time. Keys are the owner's (requirement.md 3.3), and saying so is
       the only answer that lets the reader act on it. */
    if (error instanceof AppError && error.code === 'access_denied') {
      return { ok: false, error: 'denied' };
    }
    console.error(`create key failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}

/**
 * The page renders this button only for an owner (requirement.md 3.3), but a
 * server action is a public endpoint with a generated name, so the use case
 * refuses on its own. Caught rather than allowed to escape: an uncaught throw
 * here reaches the reader as a raw Next.js error digest, which says nothing
 * about what happened. Refused means the list is unchanged, and re-rendering
 * it says exactly that.
 */
export async function revokeApiKeyAction(form: FormData): Promise<void> {
  const session = await requireSession('/dashboard/api-keys');
  const keyId = String(form.get('keyId') ?? '');
  if (!keyId) return;
  try {
    await revokeApiKey({
      workspaceId: session.workspace.id,
      role: session.workspace.role,
      keyId,
    });
  } catch (error) {
    console.error(`revoke key failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return;
  }
  revalidatePath('/dashboard/api-keys');
  revalidatePath('/dashboard');
}

export interface RotateKeyResult {
  ok: boolean;
  /** The replacement's plaintext, exactly once. */
  key?: string;
  name?: string;
  masked?: string;
}

/**
 * Deliberately no `revalidatePath`: the row that holds the "copy it now"
 * panel is the old key's, and refreshing the list would unmount it with the
 * plaintext unread. The panel refreshes the page when the user dismisses it.
 */
export async function rotateApiKeyAction(
  _previous: RotateKeyResult | null,
  form: FormData,
): Promise<RotateKeyResult> {
  const session = await requireSession('/dashboard/api-keys');
  const keyId = String(form.get('keyId') ?? '');
  try {
    const rotated = keyId
      ? await rotateApiKey({
          workspaceId: session.workspace.id,
          role: session.workspace.role,
          keyId,
        })
      : null;
    if (!rotated) return { ok: false };
    return { ok: true, key: rotated.key, name: rotated.view.name, masked: rotated.view.masked };
  } catch (error) {
    console.error(`rotate key failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false };
  }
}
