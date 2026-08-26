'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '@/components/admin/ui';
import { XIcon } from '@/components/ui/icons';

/**
 * How long a submit may hold the dialog shut.
 *
 * Blocking dismissal during a request is right -- closing mid-submit loses
 * whatever the response was about to say. Blocking it forever is not: an action
 * that never settles would leave the operator sealed inside a modal with the
 * rest of the console inert behind it, and nothing but a reload to escape. So
 * the block is a grace period, not a state.
 */
const BUSY_DISMISS_GRACE_MS = 10_000;

/**
 * Modal dialog for the console -- design source frame `BWeHH`.
 *
 * Built on the native `<dialog>`, which is worth more here than any hand-rolled
 * overlay: `showModal()` gives the focus trap, the Escape handling, the top
 * layer above every stacking context, and inert background content, all of
 * which are easy to get subtly wrong by hand and are exactly what a keyboard or
 * screen-reader user depends on.
 *
 * There is no `open` prop: the caller renders this only while it should be
 * shown, and it opens itself as the element attaches. An earlier version drove
 * `showModal()` from an effect keyed on an `open` prop, which failed the moment
 * React replaced the element -- the prop had not changed, so nothing reopened
 * it, and the dialog sat in the DOM at `display: none` with its content
 * unreachable. Opening on attach cannot drift out of step that way.
 *
 * Clicking the backdrop deliberately does not dismiss: these dialogs hold typed
 * input, and a stray click outside a field should not throw it away. Escape and
 * the visible controls are the ways out.
 */
export function ConsoleDialog({
  onClose,
  title,
  description,
  closeLabel,
  busy = false,
  footer,
  children,
}: {
  onClose: () => void;
  title: string;
  description?: string;
  closeLabel: string;
  busy?: boolean;
  /**
   * Given whether dismissal is currently blocked, so the caller's own controls
   * can agree with the dialog's rather than guessing from `busy` -- which stops
   * being the answer once the grace period lapses.
   */
  footer?: ReactNode | ((dismissBlocked: boolean) => ReactNode);
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();

  /*
   * State, not a ref: the close control has to re-render when the grace period
   * lapses, or it would stay disabled over a dialog that will now dismiss.
   */
  const [dismissBlocked, setDismissBlocked] = useState(false);
  useEffect(() => {
    if (!busy) {
      setDismissBlocked(false);
      return;
    }
    setDismissBlocked(true);
    const timer = setTimeout(() => setDismissBlocked(false), BUSY_DISMISS_GRACE_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  /*
   * Mirrored into refs so the callback ref below can stay stable: giving it the
   * props directly would tear the listeners down and rebuild them on every
   * keystroke in the dialog. Written in an effect rather than during render,
   * because a render React discards still runs the component body, and the refs
   * would then hold values the committed tree never showed.
   */
  const onCloseRef = useRef(onClose);
  const blockedRef = useRef(dismissBlocked);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    blockedRef.current = dismissBlocked;
  });

  /** Where focus was before the dialog took it, so it can be handed back. */
  const opener = useRef<Element | null>(null);

  const attach = useCallback((node: HTMLDialogElement | null) => {
    if (!node) return;

    // Escape and any `method="dialog"` control both arrive as `close`.
    const handleClose = () => onCloseRef.current();
    const handleCancel = (event: Event) => {
      if (blockedRef.current) event.preventDefault();
    };
    node.addEventListener('close', handleClose);
    node.addEventListener('cancel', handleCancel);

    /*
     * `showModal()` does not stop the document scrolling, so without this the
     * console scrolls away behind a dialog it cannot be reached through. The
     * padding replaces the scrollbar's width, so locking does not shift the
     * page sideways underneath the overlay.
     */
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const previousPadding = root.style.paddingRight;
    const scrollbar = window.innerWidth - root.clientWidth;
    root.style.overflow = 'hidden';
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;

    if (!node.open) {
      opener.current = document.activeElement;
      node.showModal();
      /*
       * `showModal()` focuses the first element carrying `autofocus`, and React
       * applies `autoFocus` imperatively rather than as an attribute, so the
       * dialog would otherwise open with the close button focused. The opt-in
       * is explicit, so a dialog with nothing worth focusing keeps the default.
       */
      node.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus();
    }

    return () => {
      node.removeEventListener('close', handleClose);
      node.removeEventListener('cancel', handleCancel);
      root.style.overflow = previousOverflow;
      root.style.paddingRight = previousPadding;
      /*
       * Focus goes back here rather than in the `close` handler, because not
       * every dismissal produces a `close` event: a footer button that calls
       * `onClose` unmounts the dialog directly, and the operator would be left
       * with focus on <body> with nothing to tab from.
       *
       * Deferred by a turn because this cleanup runs while the dialog is still
       * modal, and a modal dialog makes everything outside it inert -- focusing
       * the opener now is simply ignored, and the removal that follows drops
       * focus to <body>.
       */
      const opened = opener.current;
      setTimeout(() => {
        const active = document.activeElement;
        const nothingElseTookFocus = active === null || active === document.body;
        if (opened instanceof HTMLElement && opened.isConnected && nothingElseTookFocus) {
          opened.focus();
        }
      }, 0);
    };
  }, []);

  return (
    <dialog
      ref={attach}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      /*
       * `m-auto` restores the centring the UA stylesheet gives a modal dialog:
       * Tailwind's preflight zeroes every margin, which pins it to the corner.
       */
      className="m-auto w-[calc(100vw-32px)] max-w-[380px] rounded-[12px] border-2 border-line bg-card p-0 text-ink shadow-[0_18px_48px_rgba(29,67,73,0.15)] backdrop:bg-inkdeep/45 open:flex open:flex-col"
    >
      <header className="flex items-start justify-between gap-2.5 px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-[16px] leading-[1.4] tracking-[-0.025em] text-ink">
            {title}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className="text-[11px] leading-[1.55] tracking-[-0.023em] text-muted"
            >
              {description}
            </p>
          ) : null}
        </div>
        {/* Disabled, not merely inert: a control that looks live but does
            nothing is worse than one that says it is unavailable. */}
        <IconButton label={closeLabel} onClick={onClose} disabled={dismissBlocked}>
          <XIcon size={13} />
        </IconButton>
      </header>

      <div className="border-t-2 border-line px-4 py-4">{children}</div>

      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t-2 border-line px-4 py-3">
          {typeof footer === 'function' ? footer(dismissBlocked) : footer}
        </div>
      ) : null}
    </dialog>
  );
}
