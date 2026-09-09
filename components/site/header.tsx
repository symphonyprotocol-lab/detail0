import Link from 'next/link';

import { LocaleSwitcher } from '@/components/site/locale-switcher';
import { MobileNav } from '@/components/site/mobile-nav';
import { Wordmark } from '@/components/site/wordmark';
import { getMessages } from '@/lib/i18n/server';
import { optionalSession } from '@/lib/http/session';

/**
 * Marketing chrome: a capsule that docks centred over the page and tracks the
 * 1080px content column rather than spanning the viewport. The one session-aware
 * bit is the action button: a signed-in visitor is offered their dashboard
 * instead of a login they already have.
 *
 * The nav sits on the right, ahead of the language switcher, so the two
 * destinations a visitor is here for read as one run with the sign-in action.
 */
export async function SiteHeader() {
  const [session, t] = await Promise.all([optionalSession(), getMessages()]);

  const nav = [
    { href: '/pricing', label: t.nav.pricing },
    { href: '/playground', label: t.nav.playground },
  ];

  return (
    <header className="sticky top-0 z-30 px-5 pt-3 pb-3">
      <div className="mx-auto flex h-[54px] w-full max-w-[1080px] items-center justify-between rounded-full border border-line/70 bg-card/85 px-5 shadow-[0_1px_2px_rgba(3,26,30,0.04),0_8px_24px_-12px_rgba(3,26,30,0.16)] backdrop-blur">
        <Wordmark />
        <div className="flex items-center gap-4">
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
          <MobileNav items={nav} label={t.nav.menu} />
          <LocaleSwitcher />
          <Link
            href={session ? '/dashboard' : '/login'}
            className="inline-flex h-8 items-center rounded-full bg-brand px-4 text-[13px] font-medium text-onbrand transition-colors hover:bg-brand/90"
          >
            {session ? t.nav.dashboard : t.nav.signIn}
          </Link>
        </div>
      </div>
    </header>
  );
}
