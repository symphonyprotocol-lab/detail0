'use client';

import { useEffect, useRef } from 'react';
import { SearchIcon } from '@/components/ui/icons';

/**
 * The home page's directory search: a plain GET form to `/libraries?q=`, so
 * the query lands on the directory's own server-side resolve (the same
 * content-based routing an agent gets) and the URL is shareable. ⌘K / Ctrl+K
 * focuses the box from anywhere on the page; that shortcut is the only
 * reason this is a client component.
 */
export function DirectorySearch({
  placeholder,
  submitLabel,
}: {
  placeholder: string;
  submitLabel: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <form
      action="/libraries"
      method="get"
      role="search"
      className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-line bg-field px-4 focus-within:shadow-focus"
    >
      <SearchIcon size={18} className="text-muted" />
      <input
        ref={input}
        name="q"
        type="search"
        maxLength={200}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-faint"
      />
      <kbd
        aria-hidden
        className="flex h-8 shrink-0 items-center rounded-md border border-line bg-subtle px-2.5 text-caption text-muted"
      >
        ⌘ K
      </kbd>
      <button type="submit" className="sr-only">
        {submitLabel}
      </button>
    </form>
  );
}
