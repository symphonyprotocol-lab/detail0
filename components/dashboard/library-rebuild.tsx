'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { RefreshIcon, SpinnerIcon } from '@/components/ui/icons';
import type { RebuildLibraryActionResult } from '@/app/dashboard/libraries/[libraryId]/actions';
import { useI18n } from '@/lib/i18n/client';

/** The Rebuild button and the one line it answers with. */
export function RebuildLibraryButton({
  libraryId,
  action,
  disabled = false,
}: {
  libraryId: string;
  action: (
    previous: RebuildLibraryActionResult | null,
    form: FormData,
  ) => Promise<RebuildLibraryActionResult>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const a = t.dashboard.libraryDetail.actions;
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  /* The run starts after the response; pull the page again so the banner
     and the queue show it running rather than the state before the click. */
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="libraryId" value={libraryId} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="inline-flex h-[35px] items-center gap-1.5 rounded-[7px] border-2 border-line bg-card px-3 text-[12px] font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-40"
      >
        {pending ? <SpinnerIcon size={14} /> : <RefreshIcon size={14} />}
        {pending ? a.rebuilding : a.rebuild}
      </button>
      {state ? (
        <span
          role="status"
          className={`max-w-[260px] text-right text-[11px] leading-[1.5] tracking-[-0.023em] ${
            state.ok ? 'text-brandink' : 'text-rose'
          }`}
        >
          {state.ok ? a.rebuildQueued : state.error === 'quota' ? a.rebuildQuota : a.rebuildFailed}
        </span>
      ) : null}
    </form>
  );
}
