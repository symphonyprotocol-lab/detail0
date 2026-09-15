'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * The narrow-viewport half of the header nav.
 *
 * `SiteHeader` and `DashboardHeader` draw their links as `hidden md:flex`,
 * which below 768px left Docs, Pricing and Playground with no entry point at
 * all -- the footer does not repeat them, so the documentation was simply
 * unreachable on a phone. This is the same list behind a disclosure button,
 * mounted `md:hidden` so exactly one of the two is ever on screen.
 *
 * It closes the three ways a menu is expected to: a route change, a click
 * outside, and Escape. The route change is the one that matters here, because
 * the header lives in a layout that survives client-side navigation -- without
 * it, following a link would leave the panel hanging open over the new page.
 */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {open ? (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

const TRIGGER = {
  link: 'flex size-8 items-center justify-center rounded-full border border-line/70 text-muted transition-colors hover:text-ink',
  pill: 'flex size-9 items-center justify-center rounded-lg border border-line bg-card text-steel transition-colors hover:bg-subtle',
} as const;

export function MobileNav({
  items,
  label,
  variant = 'link',
}: {
  items: readonly { href: string; label: string }[];
  label: string;
  variant?: 'link' | 'pill';
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

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

  return (
    <div ref={root} className="relative md:hidden">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={TRIGGER[variant]}
      >
        <MenuIcon open={open} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 z-40 mt-2 w-[180px] rounded-lg border border-line bg-card p-1 shadow-md"
        >
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={active ? 'page' : undefined}
                className={`block rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                  active ? 'bg-brandsoft font-medium text-brandink' : 'text-steel hover:bg-subtle'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
