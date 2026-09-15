'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/ui/icons';

/** Where the reader's choice is kept, and what the pre-paint script reads. */
export const THEME_KEY = 're0-theme';

/**
 * Light/dark toggle.
 *
 * The site follows the reader's system until they touch this, which is why the
 * button has no third "system" state to click into: there is nothing to return
 * to until a choice has been made, and the choice is the exception rather than
 * the normal way in. Storage stays empty until the first click, so a reader who
 * never presses it keeps following their system for good, including when they
 * change it later.
 *
 * The switch itself is one attribute on <html>. Everything the theme touches is
 * a `light-dark()` pair resolved against `color-scheme`, so writing `data-theme`
 * repaints the whole site at once -- see app/globals.css.
 *
 * `mounted` is what keeps the two renders honest: the server cannot know the
 * reader's system preference or their stored choice, so until the effect runs
 * the button draws its neutral state rather than guessing an icon and hydrating
 * into a different one.
 */
export function ThemeToggle({ label }: { label: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    setDark(
      stored === 'dark' ||
        (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches),
    );
    setMounted(true);
  }, []);

  /*
   * With no stored choice the page is still following the system, so a change
   * to the system preference has to keep moving the icon with it. Once a choice
   * exists this is silent, which is the point of making it.
   */
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (!localStorage.getItem(THEME_KEY)) setDark(event.matches);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={mounted ? dark : undefined}
      className="flex size-8 items-center justify-center rounded-full border border-line/70 text-muted transition-colors hover:text-ink"
    >
      {mounted && dark ? <SunIcon size={15} /> : <MoonIcon size={15} />}
    </button>
  );
}
