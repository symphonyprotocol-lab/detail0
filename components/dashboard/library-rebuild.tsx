'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { CircleCheckIcon, CircleXIcon, RefreshIcon, SpinnerIcon } from '@/components/ui/icons';
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
        className="inline-flex h-[35px] items-center gap-1.5 rounded-md border border-line bg-card px-3 text-[12px] font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-40"
      >
        {pending ? <SpinnerIcon size={14} /> : <RefreshIcon size={14} />}
        {pending ? a.rebuilding : a.rebuild}
      </button>
      {state ? (
        <span
          role="status"
          className={`max-w-[260px] text-right text-[11px] leading-[1.5] ${
            state.ok ? 'text-brandink' : 'text-rose'
          }`}
        >
          {state.ok ? a.rebuildQueued : state.error === 'quota' ? a.rebuildQuota : a.rebuildFailed}
        </span>
      ) : null}
    </form>
  );
}

export type RebuildLibraryAction = (
  previous: RebuildLibraryActionResult | null,
  form: FormData,
) => Promise<RebuildLibraryActionResult>;

/**
 * The list's per-row refresh: the same action as the detail page's Rebuild
 * button, drawn as an icon beside the row (next to files and delete) with
 * its one-line result shown under the row rather than in a dialog --
 * requirement.md 5.2 asks for a definite result, not a ceremony.
 */
export function RebuildLibraryControl({
  libraryId,
  action,
  disabled = false,
}: {
  libraryId: string;
  action: RebuildLibraryAction;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const m = t.dashboard.libraries.manage;
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const message = state
    ? state.ok
      ? m.refreshQueued
      : state.error === 'quota'
        ? m.refreshQuota
        : m.refreshFailed
    : null;

  return (
    <form action={formAction} className="relative flex items-center">
      <input type="hidden" name="libraryId" value={libraryId} />
      <button
        type="submit"
        aria-label={m.refresh}
        title={m.refresh}
        disabled={disabled || pending}
        className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-md border border-line bg-card text-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
      >
        {pending ? <SpinnerIcon size={14} className="motion-safe:animate-spin" /> : <RefreshIcon size={14} />}
      </button>
      {message ? (
        <span
          role="status"
          className={`absolute top-full right-0 z-10 mt-1 flex w-max max-w-[240px] items-start gap-1.5 rounded-md border border-line bg-card px-2 py-1.5 text-left text-[10.5px] leading-[1.45] shadow-md ${
            state?.ok ? 'text-brandink' : 'text-rose'
          }`}
        >
          {state?.ok ? <CircleCheckIcon size={13} className="mt-px shrink-0" /> : <CircleXIcon size={13} className="mt-px shrink-0" />}
          {message}
        </span>
      ) : null}
    </form>
  );
}
