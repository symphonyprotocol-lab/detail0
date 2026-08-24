import type { ReactNode } from 'react';

/** Light-committed product surface. See app/layout.tsx for why this lives here. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="product-surface min-h-screen">{children}</div>;
}
