'use server';

import { revalidatePath } from 'next/cache';
import { disconnectGithub, disconnectNotion } from '@/lib/application/auth';
import { requireSession } from '@/lib/http/session';

/**
 * The settings page's connection mutations: forget a provider grant.
 *
 * Connecting is not here -- it is the POST to `/api/auth/{provider}/connect`
 * that starts the consent, because it has to set the handshake cookie and
 * redirect to the provider. Disconnecting is a plain delete of the sealed
 * token under the current session's account; the provider-side grant stays
 * until the person revokes it there, which the page says.
 */
export async function disconnectGithubAction(): Promise<void> {
  const session = await requireSession('/dashboard/settings');
  await disconnectGithub(session.user.id);
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/libraries/new');
}

export async function disconnectNotionAction(): Promise<void> {
  const session = await requireSession('/dashboard/settings');
  await disconnectNotion(session.user.id);
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/libraries/new');
}
