'use client';

import { CheckIcon, CopyIcon } from '@/components/ui/icons';
import { useCopied } from '@/components/ui/use-copied';
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
  const { copied, copy } = useCopied(value);

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
