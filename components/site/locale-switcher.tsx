'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useI18n } from '@/lib/i18n/client';
import {
  HTML_LANG,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABEL,
  LOCALES,
  type Locale,
} from '@/lib/i18n/locale';

/**
 * Language menu -- design source frames `hRx0w` (marketing) and `E4GWD`
 * (dashboard).
 *
 * Every page is rendered server side from the request's locale, so choosing one
 * is: write the preference, then ask the server for this same URL again.
 * `router.refresh()` re-renders the whole tree, including the layout that owns
 * `<html lang>`, which is why no route changes and no URL carries a locale.
 *
 * Options are always labelled in their own language -- a reader stranded in a
 * language they cannot read still has to be able to find their way out.
 *
 * The cookie is deliberately script-readable: it holds a display preference,
 * never a credential.
 */
function remember(locale: Locale): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  document.documentElement.lang = HTML_LANG[locale];
}

function GlobeIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-brand"
    >
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 3-4" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={13}
      height={13}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const TRIGGER = {
  link: 'flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-ink disabled:opacity-60',
  pill: 'flex h-[34px] items-center gap-[7px] rounded-lg border-2 border-line bg-card px-3 text-[12px] font-semibold tracking-[-0.023em] text-steel transition-colors hover:bg-subtle disabled:opacity-60',
} as const;

export function LocaleSwitcher({ variant = 'link' }: { variant?: 'link' | 'pill' }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  /* A menu that only closes on its own items is a trap; close on the two ways
     out every menu is expected to have. */
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function choose(next: Locale) {
    setOpen(false);
    trigger.current?.focus();
    if (next === locale) return;
    remember(next);
    startTransition(() => router.refresh());
  }

  return (
    <div ref={root} className="relative hidden sm:block">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={pending}
        lang={HTML_LANG[locale]}
        aria-label={t.nav.language}
        aria-haspopup="menu"
        aria-expanded={open}
        className={TRIGGER[variant]}
      >
        {variant === 'pill' ? <GlobeIcon /> : null}
        {LOCALE_LABEL[locale]}
        <ChevronDownIcon open={open} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t.nav.language}
          className="absolute right-0 z-40 mt-2 w-[136px] rounded-lg border-2 border-line bg-card p-1 shadow-[0_18px_60px_rgba(3,26,30,0.12)]"
        >
          {LOCALES.map((option) => {
            const active = option === locale;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                lang={HTML_LANG[option]}
                onClick={() => choose(option)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[13px] tracking-[-0.023em] transition-colors ${
                  active ? 'bg-brandsoft font-medium text-brandink' : 'text-steel hover:bg-subtle'
                }`}
              >
                {LOCALE_LABEL[option]}
                {active ? <CheckIcon /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
