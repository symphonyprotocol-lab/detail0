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
      className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-lg border-2 border-line bg-card/60 px-[15px] py-0.5 shadow-[0_4px_10px_rgba(45,45,83,0.06)] focus-within:border-brand"
    >
      <SearchIcon size={18} className="text-muted" />
      <input
        ref={input}
        name="q"
        type="search"
        maxLength={200}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] tracking-[-0.025em] text-ink outline-none placeholder:text-muted/70"
      />
      <kbd
        aria-hidden
        className="flex h-[34px] shrink-0 items-center rounded-[5px] border-2 border-line bg-mutedbg px-1.5 text-[16px] text-muted"
      >
        ⌘ K
      </kbd>
      <button type="submit" className="sr-only">
        {submitLabel}
      </button>
    </form>
  );
}
