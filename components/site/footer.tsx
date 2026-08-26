import Link from 'next/link';

import { getMessages } from '@/lib/i18n/server';

export async function SiteFooter() {
  const t = await getMessages();

  const links = [
    { href: '/status', label: t.footer.status },
    { href: '/about', label: t.footer.about },
    { href: '/contact', label: t.footer.contact },
    { href: '/legal', label: t.footer.legal },
  ];

  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto flex w-full max-w-[918px] flex-col items-center justify-between gap-4 px-5 py-7 text-[11px] sm:flex-row">
        <p className="flex items-center gap-[9px] text-muted">
          <span className="font-medium">{t.footer.copyright}</span>
          <span aria-hidden className="text-line">·</span>
          <span>{t.footer.tagline}</span>
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-5 font-medium">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
