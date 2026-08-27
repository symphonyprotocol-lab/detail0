'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRightIcon, SpinnerIcon } from '@/components/ui/icons';

/**
 * One OAuth provider choice on the sign-in card. The trailing arrow turns into
 * a spinner while the browser is on its way to the provider.
 *
 * The form is a plain `method="post"` to a Route Handler rather than a React
 * action, so `useFormStatus` has nothing to report -- the pending state comes
 * from the form's own submit event instead, the same approach as
 * `admin/sign-in-button`. Taking it from the event rather than from the click
 * also means `disabled` is only applied once the browser has committed to the
 * submission, so the POST still goes out.
 */
export function ProviderSignInButton({
  icon,
  name,
  hint,
}: {
  icon: ReactNode;
  name: string;
  hint: string;
}) {
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;

    const onSubmit = () => setPending(true);
    /*
     * Coming back through the back/forward cache restores the DOM as it was,
     * which would leave a button spinning over a page that is no longer
     * waiting for anything.
     */
    const onPageShow = () => setPending(false);

    form.addEventListener('submit', onSubmit);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      form.removeEventListener('submit', onSubmit);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  return (
    <button
      ref={ref}
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex h-[58px] w-full items-center gap-[11px] rounded-[9px] border-2 border-line bg-card px-[14px] text-left transition-colors hover:bg-subtle disabled:cursor-progress disabled:bg-subtle"
    >
      <span
        aria-hidden
        className="flex size-[33px] shrink-0 items-center justify-center rounded-lg border-2 border-line bg-subtle"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[11px] leading-[1.5] font-[650] tracking-[-0.03em] text-ink">
          {name}
        </span>
        <span className="text-[9px] leading-[1.5] tracking-[-0.03em] text-muted">{hint}</span>
      </span>
      {pending ? (
        /* Static ring under reduced motion; the cursor still reads as busy. */
        <SpinnerIcon size={15} className="text-muted motion-safe:animate-spin" />
      ) : (
        <ArrowRightIcon size={15} className="text-muted" />
      )}
    </button>
  );
}
