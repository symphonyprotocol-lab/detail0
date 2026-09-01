'use client';

import { useEffect, useRef, useState } from 'react';

/** How long a copy control shows its "copied" state before settling back. */
const COPIED_RESET_MS = 1600;

/**
 * The clipboard-write behind every copy control: write the value, flip
 * `copied` for a moment, and clear the reset timer on unmount so a control
 * dismissed mid-flash does not set state on a dead component.
 *
 * Silent on failure by design: an insecure origin or a denied permission
 * leaves the control as-is rather than raising an error about a convenience.
 */
export function useCopied(value: string): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      /* Clipboard unavailable -- the value is still selectable on the page. */
    }
  }

  return { copied, copy };
}
