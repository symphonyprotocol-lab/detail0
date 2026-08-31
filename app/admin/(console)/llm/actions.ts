'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { updateLlmConfig, LlmConfigRefused } from '@/lib/application/administration';
import { AdminChangeRefused } from '@/lib/domain/admin';
import { requireAdminCapability } from '@/lib/http/admin';

/**
 * The one mutation the playground-model screen has. Like every console
 * action, it re-resolves the session and re-checks the capability: a server
 * action is a public endpoint with a generated name.
 */
export type LlmConfigError =
  | 'invalid_base_url'
  | 'invalid_model'
  | 'invalid_number'
  | 'reason_required'
  | 'unavailable';

export interface LlmConfigActionResult {
  ok: boolean;
  error?: LlmConfigError;
}

export async function updateLlmConfigAction(
  _previous: LlmConfigActionResult | null,
  form: FormData,
): Promise<LlmConfigActionResult> {
  const session = await requireAdminCapability('plans');
  try {
    const bag = await headers();
    await updateLlmConfig({
      actor: {
        administratorId: session.administratorId,
        email: session.email,
        clientAddress: bag.get('x-forwarded-for')?.split(',')[0]?.trim() ?? bag.get('x-real-ip'),
      },
      baseUrl: String(form.get('baseUrl') ?? ''),
      model: String(form.get('model') ?? ''),
      maxOutputTokens: Number(form.get('maxOutputTokens') ?? Number.NaN),
      timeoutMs: Number(form.get('timeoutMs') ?? Number.NaN),
      promptPriceMicro: Number(form.get('promptPriceMicro') ?? Number.NaN),
      completionPriceMicro: Number(form.get('completionPriceMicro') ?? Number.NaN),
      /* An unchecked checkbox posts nothing: absence is "off". */
      enabled: form.get('enabled') !== null,
      reason: String(form.get('reason') ?? ''),
    });
    revalidatePath('/admin/llm');
    return { ok: true };
  } catch (error) {
    if (error instanceof LlmConfigRefused) return { ok: false, error: error.code };
    if (error instanceof AdminChangeRefused && error.code === 'reason_required') {
      return { ok: false, error: 'reason_required' };
    }
    console.error(`llm config failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { ok: false, error: 'unavailable' };
  }
}
