import Link from 'next/link';
import { LocaleSwitcher } from '@/components/site/locale-switcher';
import { MobileNav } from '@/components/site/mobile-nav';
import { WorkspaceAvatar } from '@/components/dashboard/workspace-avatar';
import { Wordmark } from '@/components/site/wordmark';
import { LogOutIcon } from '@/components/ui/icons';
import { WORKSPACE_INITIAL } from '@/lib/dashboard/demo-data';
import { getMessages } from '@/lib/i18n/server';

/**
 * Dashboard chrome header -- design source frame `E4GWD`.
 *
 * Same 918px column and marketing nav as `SiteHeader`, but it trades the login
 * button for the workspace pill and sits on an opaque card background rather
 * than the translucent marketing one.
 */
export async function DashboardHeader({
  workspaceName,
  workspaceInitial = WORKSPACE_INITIAL,
}: {
  workspaceName: string;
  workspaceInitial?: string;
}) {
  const t = await getMessages();

  const nav = [
    { href: '/docs', label: t.nav.docs },
    { href: '/pricing', label: t.nav.pricing },
    { href: '/playground', label: t.nav.playground },
  ];

  return (
    <header className="sticky top-0 z-30 border-b-2 border-line bg-card">
      <div className="mx-auto flex h-[78px] w-full max-w-[918px] items-center justify-between gap-6 px-5">
        <div className="flex items-center gap-8">
          <Wordmark />
          <nav className="hidden items-center gap-[18px] md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[14px] font-medium tracking-[-0.023em] text-ink transition-colors hover:text-brandink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <MobileNav items={nav} label={t.nav.menu} variant="pill" />
          <LocaleSwitcher variant="pill" />
          <Link
            href="/dashboard/settings"
            className="inline-flex h-9 items-center gap-2 rounded-[20px] border-2 border-line bg-subtle py-0.5 pr-[18px] pl-[9px] text-[14px] font-medium tracking-[-0.029em] text-ink transition-colors hover:bg-mutedbg"
          >
            <WorkspaceAvatar initial={workspaceInitial} />
            {workspaceName}
          </Link>
          {/* POST so the sign-out carries an Origin to check. architecture.md 15.3 */}
          <form method="post" action="/api/auth/logout">
            <button
              type="submit"
              aria-label={t.dashboard.shell.signOut}
              title={t.dashboard.shell.signOut}
              className="inline-flex size-9 items-center justify-center rounded-lg border-2 border-line bg-card text-steel transition-colors hover:bg-subtle"
            >
              <LogOutIcon size={15} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
