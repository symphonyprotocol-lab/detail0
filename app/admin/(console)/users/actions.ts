'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { setUserAccountStatus } from '@/lib/application/administration';
import {
  AdminChangeRefused,
  isUserAccountStatus,
  type AdminChangeError,
} from '@/lib/domain/admin';
import { requireAdminCapability } from '@/lib/http/admin';
import { clientAddress } from '@/lib/http/client-address';

/**
 * The one mutation behind the registered-user screens.
 *
 * It re-resolves the session and re-checks the capability, like every other
 * console action: a server action is a public endpoint with a generated name,
 * not a private function call, so that the page only renders the control for
 * entitled operators says nothing about who can post to it.
 */
export interface UserActionResult {
  ok: boolean;
  error?: Extract<AdminChangeError, 'not_found' | 'invalid_input' | 'reason_required'>;
  /** Web sessions ended, so the screen can report what the change did. */
  sessionsRevoked?: number;
}

export async function setUserStatusAction(
  _previous: UserActionResult | null,
  form: FormData,
): Promise<UserActionResult> {
  const session = await requireAdminCapability('users');
  const status = String(form.get('status') ?? '');
  if (!isUserAccountStatus(status)) return { ok: false, error: 'invalid_input' };

  const userId = String(form.get('userId') ?? '');
  const bag = await headers();

  try {
    const { sessionsRevoked } = await setUserAccountStatus({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress:
          clientAddress(bag),
      },
      userId,
      status,
      reason: String(form.get('reason') ?? ''),
    });

    // Both the list and the account's own screen show the status.
    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${userId}`);
    return { ok: true, sessionsRevoked };
  } catch (error) {
    if (error instanceof AdminChangeRefused) {
      return {
        ok: false,
        error:
          error.code === 'not_found' || error.code === 'reason_required'
            ? error.code
            : 'invalid_input',
      };
    }
    console.error(
      `user status change failed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
    return { ok: false, error: 'invalid_input' };
  }
}
