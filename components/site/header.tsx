import Link from 'next/link';

import { LocaleSwitcher } from '@/components/site/locale-switcher';
import { Wordmark } from '@/components/site/wordmark';
import { getMessages } from '@/lib/i18n/server';
import { optionalSession } from '@/lib/http/session';

/**
 * Marketing chrome. The one session-aware bit is the action button: a signed-in
 * visitor is offered their dashboard instead of a login they already have.
 */
export async function SiteHeader() {
  const [session, t] = await Promise.all([optionalSession(), getMessages()]);

  const nav = [
    { href: '/docs', label: t.nav.docs },
    { href: '/pricing', label: t.nav.pricing },
    { href: '/playground', label: t.nav.playground },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-[62px] w-full max-w-[918px] items-center justify-between px-5">
        <div className="flex items-center gap-8">
          <Wordmark />
          <nav className="hidden items-center gap-6 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] text-muted transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <LocaleSwitcher />
          <Link
            href={session ? '/dashboard' : '/login'}
            className="inline-flex h-8 items-center rounded-full bg-brand px-4 text-[13px] font-medium text-white transition-colors hover:bg-brand/90"
          >
            {session ? t.nav.dashboard : t.nav.signIn}
          </Link>
        </div>
      </div>
    </header>
  );
}
