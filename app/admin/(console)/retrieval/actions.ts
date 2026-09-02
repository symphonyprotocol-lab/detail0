'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { updateRetrievalConfig } from '@/lib/application/administration';
import { AdminChangeRefused } from '@/lib/domain/admin';
import {
  RETRIEVAL_SETTING_KEYS,
  RetrievalConfigRefused,
  type RetrievalSettingKey,
} from '@/lib/domain/retrieval-config';
import { requireAdminCapability } from '@/lib/http/admin';

/**
 * The one mutation the retrieval screen has. Like every console action it
 * re-resolves the session and re-checks the capability: a server action is a
 * public endpoint with a generated name.
 */
export type RetrievalConfigError = 'out_of_range' | 'inconsistent' | 'reason_required' | 'unavailable';

export interface RetrievalConfigActionResult {
  ok: boolean;
  error?: RetrievalConfigError;
  /** Which knob was refused, for the two errors that name one. */
  field?: RetrievalSettingKey;
}

export async function updateRetrievalConfigAction(
  _previous: RetrievalConfigActionResult | null,
  form: FormData,
): Promise<RetrievalConfigActionResult> {
  const session = await requireAdminCapability('plans');
  try {
    const bag = await headers();
    /* A blank field posts '' and becomes NaN, which the domain refuses by
       name -- never silently a default. */
    const values = Object.fromEntries(
      RETRIEVAL_SETTING_KEYS.map((key) => [key, Number(form.get(key) ?? Number.NaN)]),
    ) as Record<RetrievalSettingKey, number>;

    await updateRetrievalConfig({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: bag.get('x-forwarded-for')?.split(',')[0]?.trim() ?? bag.get('x-real-ip'),
      },
      values,
      reason: String(form.get('reason') ?? ''),
    });
    revalidatePath('/admin/retrieval');
    return { ok: true };
  } catch (error) {
    if (error instanceof RetrievalConfigRefused) {
      return { ok: false, error: error.code, field: error.field };
    }
    if (error instanceof AdminChangeRefused && error.code === 'reason_required') {
      return { ok: false, error: 'reason_required' };
    }
    console.error(`retrieval config failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}
