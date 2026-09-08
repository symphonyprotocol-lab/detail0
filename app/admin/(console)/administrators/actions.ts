'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  changeAdministratorRole,
  inviteAdministrator,
  resetAdministratorMfa,
  revokeAdministratorSessions,
  setAdministratorStatus,
} from '@/lib/application/administration';
import { AdminChangeRefused, type AdminChangeError } from '@/lib/domain/admin';
import { requireAdminCapability } from '@/lib/http/admin';
import { clientAddress } from '@/lib/http/client-address';

/**
 * Mutations behind the administrators screen.
 *
 * Every one re-resolves the session and re-checks the capability. A server
 * action is a public endpoint with a generated name, not a private function
 * call: that the page only renders the form for entitled operators says nothing
 * about who can post to it.
 */
export interface ActionResult {
  ok: boolean;
  error?: Exclude<AdminChangeError, 'period_invalid'>;
  /** Set by invite and MFA reset: the one-time enrolment path, shown once and never stored. */
  enrolmentPath?: string;
}

async function actorAddress(): Promise<string | null> {
  const bag = await headers();
  return clientAddress(bag);
}

function refused(error: unknown): ActionResult {
  if (error instanceof AdminChangeRefused && error.code !== 'period_invalid') {
    return { ok: false, error: error.code };
  }
  console.error(
    `administrator change failed: ${error instanceof Error ? error.message : 'unknown'}`,
  );
  return { ok: false, error: 'invalid_input' };
}

export async function inviteAdministratorAction(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireAdminCapability('administrators');
  try {
    const { enrolmentPath } = await inviteAdministrator({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: await actorAddress(),
      },
      email: String(form.get('email') ?? ''),
      username: String(form.get('username') ?? ''),
      role: String(form.get('role') ?? ''),
    });
    revalidatePath('/admin/administrators');
    return { ok: true, enrolmentPath };
  } catch (error) {
    return refused(error);
  }
}

export async function changeRoleAction(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireAdminCapability('administrators');
  try {
    await changeAdministratorRole({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: await actorAddress(),
      },
      administratorId: String(form.get('administratorId') ?? ''),
      role: String(form.get('role') ?? ''),
      reason: String(form.get('reason') ?? ''),
    });
    revalidatePath('/admin/administrators');
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function setStatusAction(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireAdminCapability('administrators');
  const status = String(form.get('status') ?? '');
  if (status !== 'active' && status !== 'disabled') return { ok: false, error: 'invalid_input' };
  try {
    await setAdministratorStatus({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: await actorAddress(),
      },
      administratorId: String(form.get('administratorId') ?? ''),
      status,
      reason: String(form.get('reason') ?? ''),
    });
    revalidatePath('/admin/administrators');
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function revokeSessionsAction(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireAdminCapability('administrators');
  try {
    await revokeAdministratorSessions({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: await actorAddress(),
      },
      administratorId: String(form.get('administratorId') ?? ''),
      reason: String(form.get('reason') ?? ''),
    });
    revalidatePath('/admin/administrators');
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

export async function resetMfaAction(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const session = await requireAdminCapability('administrators');
  try {
    const { enrolmentPath } = await resetAdministratorMfa({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: await actorAddress(),
      },
      administratorId: String(form.get('administratorId') ?? ''),
      reason: String(form.get('reason') ?? ''),
    });
    revalidatePath('/admin/administrators');
    return { ok: true, enrolmentPath };
  } catch (error) {
    return refused(error);
  }
}
