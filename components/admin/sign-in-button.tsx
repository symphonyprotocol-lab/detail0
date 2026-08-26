'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, SpinnerIcon } from '@/components/ui/icons';

/**
 * Submit button for the console sign-in, with an in-flight state.
 *
 * The form is a plain `method="post"` to a Route Handler, not a React action,
 * so `useFormStatus` has nothing to report -- the pending state is taken from
 * the form's own submit event instead. That event only fires once the
 * browser's own validation has passed, so an empty field still shows the
 * native message rather than a spinner that never resolves.
 *
 * Disabling on submit is also what stops a double POST: the endpoint counts
 * every attempt against the account's lockout, so a double-click would spend
 * two of the five.
 *
 * Labels arrive as props because this sits outside `LocaleProvider` -- the
 * sign-in renders before there is a session to build the console shell around.
 */
export function AdminSignInButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;

    const onSubmit = () => setPending(true);
    /*
     * Coming back to a submitted form through the back/forward cache restores
     * the DOM as it was, which would leave the button disabled and spinning
     * over a page that is no longer waiting for anything.
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
      className="mt-[25px] flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-brand text-[11px] leading-[1.55] font-bold tracking-[-0.023em] text-white transition-colors hover:bg-brand/90 disabled:cursor-progress disabled:bg-brand/70"
    >
      {pending ? (
        <>
          {/* Static ring under reduced motion; the label carries the state there. */}
          <SpinnerIcon size={15} className="motion-safe:animate-spin" />
          {pendingLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowRightIcon size={15} />
        </>
      )}
    </button>
  );
}
