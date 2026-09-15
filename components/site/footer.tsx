import Link from 'next/link';

import { getMessages } from '@/lib/i18n/server';

/**
 * The closing band.
 *
 * A tinted zone like any other section rather than an inverted one -- this
 * system has no dark plane to end on, and the change of ground is the whole of
 * the separation.
 */
export async function SiteFooter() {
  const t = await getMessages();

  const links = [
    { href: '/status', label: t.footer.status },
    { href: '/about', label: t.footer.about },
    { href: '/contact', label: t.footer.contact },
    { href: '/legal', label: t.footer.legal },
  ];

  return (
    <footer className="wash-band relative z-10">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-4 px-5 py-12 text-caption sm:flex-row">
        <p className="flex items-center gap-2 text-muted">
          <span>{t.footer.copyright}</span>
          <span aria-hidden className="text-faint">·</span>
          <span>{t.footer.tagline}</span>
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
