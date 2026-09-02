'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { updateLlmConfig, LlmConfigRefused } from '@/lib/application/administration';
import { priceMicroFromUsd } from '@/lib/domain/generation';
import { AdminChangeRefused } from '@/lib/domain/admin';
import { requireAdminCapability } from '@/lib/http/admin';

/**
 * The one mutation the playground-model screen has -- adding an entry,
 * editing one, switching one off and choosing the default are all the same
 * append, distinguished only by which fields the form posts. Like every console
 * action, it re-resolves the session and re-checks the capability: a server
 * action is a public endpoint with a generated name.
 */
export type LlmConfigError =
  | 'invalid_base_url'
  | 'invalid_model'
  | 'invalid_max_input'
  | 'invalid_max_output'
  | 'invalid_timeout'
  | 'invalid_price'
  | 'invalid_slug'
  | 'invalid_effort'
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
      /* Absent for a new entry; present when appending to an existing one. */
      slug: form.get('slug') ? String(form.get('slug')) : null,
      label: String(form.get('label') ?? ''),
      baseUrl: String(form.get('baseUrl') ?? ''),
      model: String(form.get('model') ?? ''),
      maxInputTokens: Number(form.get('maxInputTokens') ?? Number.NaN),
      maxOutputTokens: Number(form.get('maxOutputTokens') ?? Number.NaN),
      timeoutMs: Number(form.get('timeoutMs') ?? Number.NaN),
      /* Typed in dollars per million tokens, stored in micro-USD. The field
         names carry the unit so the two can never be posted into each other;
         a blank or non-numeric one becomes NaN and is refused below. */
      promptPriceMicro: priceMicroFromUsd(Number(form.get('promptPriceUsd') ?? Number.NaN)),
      completionPriceMicro: priceMicroFromUsd(Number(form.get('completionPriceUsd') ?? Number.NaN)),
      cachePriceMicro: priceMicroFromUsd(Number(form.get('cachePriceUsd') ?? Number.NaN)),
      /* An unchecked checkbox posts nothing: absence is "off". */
      enabled: form.get('enabled') !== null,
      isDefault: form.get('isDefault') !== null,
      supportsTools: form.get('supportsTools') !== null,
      supportsReasoning: form.get('supportsReasoning') !== null,
      supportsVision: form.get('supportsVision') !== null,
      /* The select is disabled for a non-reasoning model, so it posts nothing
         -- and the application refuses the pair anyway. */
      reasoningEffort: form.get('reasoningEffort') ? String(form.get('reasoningEffort')) : null,
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
