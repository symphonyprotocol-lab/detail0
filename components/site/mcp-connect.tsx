'use client';

import { CheckIcon, CopyIcon } from '@/components/ui/icons';
import { useCopied } from '@/components/ui/use-copied';

/**
 * The hero's "connect" control: the MCP endpoint in a terminal-styled box
 * with a copy button that works. Design source frame `hRx0w` drew this box
 * around an install command; the endpoint is what a person actually pastes
 * into Claude, Codex or Cursor today, so the box shows that.
 */
export function McpConnect({
  url,
  copyLabel,
  copiedLabel,
}: {
  url: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const { copied, copy } = useCopied(url);
  return (
    <div className="flex h-12 items-center gap-6 rounded-lg border-2 border-termline bg-inkdeep py-0.5 pr-[11px] pl-[18px] shadow-[0_4px_10px_rgba(45,45,83,0.12),0_1px_1px_rgba(45,45,83,0.12)]">
      <code className="font-mono text-[12px] tracking-[-0.03em] text-[#e4edee]">{url}</code>
      <button
        type="button"
        onClick={copy}
        aria-live="polite"
        className="flex h-7 items-center gap-1.5 border-l-2 border-[#294043] pr-[9px] pl-[11px] text-[#b8d4d5] transition-colors hover:text-white"
      >
        {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
        <span className="text-[11px] tracking-[-0.029em]">{copied ? copiedLabel : copyLabel}</span>
      </button>
    </div>
  );
}
