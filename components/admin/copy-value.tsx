'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon } from '@/components/ui/icons';

/**
 * A console control that copies one identifier -- design source `DiUMB`.
 *
 * It exists because of what the billing screen cannot do. Every action on a
 * billing document happens at the Payment Provider (requirement.md 5.3), and
 * the way an operator gets there is by pasting the provider's own id into the
 * provider's own console. recall0 stores that id and nothing more -- no deep
 * link, because a link would mean storing which provider console a document
 * belongs to and keeping that guess correct.
 *
 * Silent on failure by design: an insecure origin or a denied permission leaves
 * the label alone rather than raising an error about a convenience.
 */
export function CopyValue({
  value,
  label,
  copiedLabel,
}: {
  value: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard unavailable; the id is still selectable on the page itself. */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-[37px] shrink-0 items-center justify-center gap-1.5 rounded-[7px] border-2 border-line bg-card px-3 text-[12px] font-medium tracking-[-0.023em] text-steel transition-colors hover:bg-subtle"
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? copiedLabel : label}
    </button>
  );
}
