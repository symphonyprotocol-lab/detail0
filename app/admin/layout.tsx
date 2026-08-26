import type { ReactNode } from 'react';

/**
 * Outermost admin surface.
 *
 * Only the light-committed background lives here, because the console's
 * sign-in and the console itself share nothing else: the shell -- rail, header
 * and the authorization check behind them -- belongs to the `(console)` group,
 * so `/admin/login` can render without one.
 *
 * Light-committed product surface. See app/layout.tsx for why this lives here.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="product-surface min-h-screen">{children}</div>;
}
