'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n/client';
import { fill } from '@/lib/i18n/format';

/** The copy affordance the design puts on every code block. */
export function CopyButton({
  value,
  label,
  className = '',
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard is unavailable (insecure origin, denied permission) -- leave the icon as-is. */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={fill(copied ? t.dashboard.copy.copied : t.dashboard.copy.copyAction, { label })}
      className={`inline-flex size-[30px] items-center justify-center rounded-md transition-colors ${className}`}
    >
      {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
    </button>
  );
}
