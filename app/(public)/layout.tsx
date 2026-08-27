import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { LocaleProvider } from '@/lib/i18n/client';
import { translations } from '@/lib/i18n/server';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await translations();

  return (
    <LocaleProvider locale={locale} messages={t}>
      <div className="product-surface site-surface flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
      </div>
    </LocaleProvider>
  );
}
