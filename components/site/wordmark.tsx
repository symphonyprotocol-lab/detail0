import Link from 'next/link';

import { Recall0Mark } from '@/components/ui/icons';

/**
 * Brand lockup, shared by the marketing header, the dashboard header and the
 * login card.
 *
 * It lives apart from `site/header` on purpose: the dashboard rail is a client
 * component and imports the wordmark, while the marketing header reads the
 * session and is therefore server only. One module for each keeps that import
 * from crossing the boundary.
 */
export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex size-6 items-center justify-center rounded-md bg-brand text-white"
      >
        <Recall0Mark size={24} />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.03em] text-ink">Recall0</span>
    </Link>
  );
}
