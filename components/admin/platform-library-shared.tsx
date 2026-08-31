'use client';

import { startTransition, type ReactNode } from 'react';
import { Monogram } from '@/components/admin/ui';
import { CircleXIcon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n/client';
import type { PlatformLibraryActionResult } from '@/app/admin/(console)/platform-libraries/actions';

/**
 * The parts every platform-library dialog is built from.
 *
 * Six dialogs across three files now confirm a change to a platform library --
 * refresh, publish, suspend, edit, and the two over sources -- and every one of
 * them shows the same three things in the same order: what was refused, which
 * library it is about, and the reason field. Keeping one copy is what stops the
 * sixth dialog from being the one that forgets the reason is required.
 */

export type PlatformAction = (
  previous: PlatformLibraryActionResult | null,
  form: FormData,
) => Promise<PlatformLibraryActionResult>;

export interface PlatformLibraryTarget {
  id: string;
  publicId: string;
  title: string;
  initial: string;
  sourceLabel: string;
}

/**
 * Submits through `onSubmit` rather than `action={submit}`.
 *
 * React resets an uncontrolled form once a function action settles, which
 * would clear the reason on a refusal -- so the operator would read "a reason
 * is required" over the field they had just typed one into, and have to type
 * it again to find out what the real refusal was.
 */
export function submitOn(dispatch: (form: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };
}

export function Refusal({ state }: { state: PlatformLibraryActionResult | null }) {
  const { t } = useI18n();
  if (!state?.error) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-[8px] bg-errsoft p-2.5 text-[11px] leading-[1.5] text-err"
    >
      <CircleXIcon size={15} className="mt-px shrink-0" />
      {t.admin.platformLibraries.errors[state.error]}
    </p>
  );
}

/** Which library this is about, so the confirmation is checkable, not abstract. */
export function TargetCard({ target }: { target: PlatformLibraryTarget }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[8px] border-2 border-line bg-subtle px-2.5 py-2.5">
      <Monogram initial={target.initial} />
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="truncate text-[12px] font-medium tracking-[-0.023em] text-ink">
          {target.title}
        </span>
        <span className="truncate text-[11px] tracking-[-0.023em] text-muted">
          {target.publicId} · {target.sourceLabel}
        </span>
      </span>
    </div>
  );
}

export function ReasonField({
  label,
  placeholder,
  ariaLabel,
  autoFocus = true,
}: {
  label: string;
  placeholder: string;
  ariaLabel: string;
  /** Off when the dialog has a field the operator should reach first. */
  autoFocus?: boolean;
}): ReactNode {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[-0.023em] text-steel">{label}</span>
      <input
        name="reason"
        required
        maxLength={200}
        {...(autoFocus ? { 'data-dialog-autofocus': true } : {})}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={FIELD}
      />
    </label>
  );
}

export const FIELD =
  'h-9 w-full rounded-[7px] border-2 border-line bg-card px-2.5 text-[12px] tracking-[-0.023em] text-ink placeholder:text-faint focus:border-brand focus:outline-none';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[-0.023em] text-steel">{label}</span>
      {children}
      {hint ? (
        <span className="text-[11px] leading-[1.45] tracking-[-0.023em] text-faint">{hint}</span>
      ) : null}
    </label>
  );
}
