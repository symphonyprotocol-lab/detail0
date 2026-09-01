'use client';

import { useActionState } from 'react';
import { submitOn } from '@/components/admin/platform-library-shared';
import { CopyButton } from '@/components/dashboard/copy-button';
import { PANEL } from '@/components/dashboard/ui';
import type { CreateKeyResult } from '@/app/dashboard/api-keys/actions';
import { useI18n } from '@/lib/i18n/client';

/**
 * Key creation, and the one moment the plaintext exists. architecture.md 5.1:
 * the server stores a hash, so this panel is the only place the full key is
 * ever shown -- copy it now or mint another.
 */
export function ApiKeyCreate({
  action,
}: {
  action: (previous: CreateKeyResult | null, form: FormData) => Promise<CreateKeyResult>;
}) {
  const { t } = useI18n();
  const k = t.dashboard.apiKeys;
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <section className={`${PANEL} flex flex-col gap-3 p-[22px]`}>
      <p className="text-[14px] tracking-[-0.023em] text-ink">{k.create.title}</p>
      {/* `onSubmit` via submitOn, not `action=`: React resets an uncontrolled
          form when a function action settles, which would clear the typed name
          on a refused create. */}
      <form onSubmit={submitOn(formAction)} className="flex flex-wrap items-center gap-2">
        <input
          name="name"
          required
          maxLength={80}
          placeholder={k.create.namePlaceholder}
          className="h-9 min-w-[220px] flex-1 rounded-[7px] border-2 border-line bg-card px-2.5 text-[12px] tracking-[-0.023em] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 shrink-0 rounded-[7px] bg-brand px-4 text-[12px] font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-60"
        >
          {k.create.submit}
        </button>
      </form>

      {state && !state.ok ? (
        <p className="text-[12px] tracking-[-0.023em] text-rose">
          {state.error === 'limit'
            ? k.create.errorLimit
            : state.error === 'invalid'
              ? k.create.errorInvalid
              : k.create.errorUnavailable}
        </p>
      ) : null}

      {state?.ok && state.key ? (
        <div className="flex flex-col gap-2 rounded-lg border-2 border-publine bg-pubsoft/40 p-3">
          <p className="text-[12px] font-semibold tracking-[-0.023em] text-ink">
            {k.create.once}
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[5px] bg-card px-2 py-1.5 font-mono text-[11.5px] text-steel">
              {state.key}
            </code>
            <CopyButton value={state.key} label={k.create.copy} className="text-steel hover:bg-mutedbg" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
