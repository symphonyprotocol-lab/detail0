import { WORKSPACE_INITIAL } from '@/lib/dashboard/demo-data';

/**
 * Monogram tile used by both the header pill and the sidebar workspace row.
 *
 * It lives apart from `dashboard/header` for the same reason the wordmark lives
 * apart from `site/header`: the workspace rail is a client component and needs
 * this tile, while the header reads the request's locale and is therefore
 * server only. One module each keeps that import from crossing the boundary.
 */
export function WorkspaceAvatar({
  size = 'sm',
  initial = WORKSPACE_INITIAL,
}: {
  size?: 'sm' | 'md';
  initial?: string;
}) {
  const box = size === 'md' ? 'size-[34px] rounded-lg text-[13px]' : 'size-[23px] rounded-md text-[11px]';
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center bg-ink font-medium text-white ${box}`}
    >
      {initial}
    </span>
  );
}
