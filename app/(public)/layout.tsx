import type { ReactNode } from 'react';
import { SiteHeader, AnnouncementBar } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <AnnouncementBar />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
