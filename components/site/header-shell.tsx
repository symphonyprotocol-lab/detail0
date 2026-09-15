'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * The header capsule: a pill docked over the page, tracking the content column
 * rather than spanning the viewport.
 *
 * It owns the capsule itself rather than leaving it to each header, because the
 * one thing that changes about it -- which plane it is painted on -- is client
 * state, and the two headers should not each carry a copy of that. All they
 * pass is their contents and the column they sit over.
 *
 * The bar is the same in both themes and declares its own plane, so the theme
 * is not this component's business at all (see `.chrome-band` in
 * app/globals.css). All scrolling changes is which of the two planes it is on:
 * the blue resting capsule, or the paper one it takes once the page is moving
 * under it.
 *
 * The listener is passive and only ever sets a boolean, so a scroll does no
 * work beyond the first crossing of the threshold.
 */
export function HeaderShell({
  children,
  /** Width of the column the capsule tracks -- the page's own content width. */
  width,
}: {
  children: ReactNode;
  width: string;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    /* Run once: a reload part-way down the page starts already scrolled. */
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-30 px-5 py-3">
      <div
        className={`chrome-band mx-auto flex h-16 w-full items-center justify-between gap-3 rounded-full px-4 sm:gap-6 sm:px-6 ${width} ${
          scrolled ? 'chrome-scrolled' : ''
        }`}
      >
        {children}
      </div>
    </header>
  );
}
