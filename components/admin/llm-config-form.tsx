'use client';

import { useActionState } from 'react';
import { ConsoleButton } from '@/components/admin/ui';
import type { LlmConfigActionResult } from '@/app/admin/(console)/llm/actions';
import { useI18n } from '@/lib/i18n/client';

const FIELD =
  'h-9 w-full rounded-[7px] border-2 border-line bg-card px-2.5 text-[12px] tracking-[-0.023em] text-ink placeholder:text-faint focus:border-brand focus:outline-none';

interface Prefill {
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  promptPriceMicro: number;
  completionPriceMicro: number;
  enabled: boolean;
}

/**
 * The playground-model form. Every save mints an immutable new version
 * (manage-llm-config.ts); the form is prefilled from the active one so a
 * save with no edits is a faithful re-mint, not a reset to defaults.
 */
export function LlmConfigForm({
  prefill,
  action,
}: {
  prefill: Prefill;
  action: (previous: LlmConfigActionResult | null, form: FormData) => Promise<LlmConfigActionResult>;
}) {
  const { t } = useI18n();
  const p = t.admin.llm;
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 px-[19px] py-4">
      <Field label={p.baseUrl}>
        <input name="baseUrl" defaultValue={prefill.baseUrl} className={FIELD} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={p.model}>
          <input name="model" defaultValue={prefill.model} className={FIELD} required />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-[12px] tracking-[-0.023em] text-steel">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={prefill.enabled}
            className="size-4 accent-brand"
          />
          {p.enabled}
        </label>
        <Field label={p.maxOutputTokens}>
          <input
            name="maxOutputTokens"
            type="number"
            defaultValue={prefill.maxOutputTokens}
            className={FIELD}
          />
        </Field>
        <Field label={p.timeoutMs}>
          <input name="timeoutMs" type="number" defaultValue={prefill.timeoutMs} className={FIELD} />
        </Field>
        <Field label={p.promptPrice}>
          <input
            name="promptPriceMicro"
            type="number"
            defaultValue={prefill.promptPriceMicro}
            className={FIELD}
          />
        </Field>
        <Field label={p.completionPrice}>
          <input
            name="completionPriceMicro"
            type="number"
            defaultValue={prefill.completionPriceMicro}
            className={FIELD}
          />
        </Field>
      </div>
      <Field label={p.reason}>
        <input name="reason" className={FIELD} required />
      </Field>
      {state && !state.ok ? (
        <p className="text-[12px] tracking-[-0.023em] text-danger">
          {p.errors[state.error ?? 'unavailable']}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="text-[12px] tracking-[-0.023em] text-steel">{p.saved}</p>
      ) : null}
      <div>
        <ConsoleButton type="submit" variant="primary" disabled={pending}>
          {p.save}
        </ConsoleButton>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[-0.023em] text-steel">{label}</span>
      {children}
    </label>
  );
}
