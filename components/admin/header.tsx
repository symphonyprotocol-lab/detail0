import { LocaleSwitcher } from '@/components/site/locale-switcher';
import { BellIcon, LogOutIcon, SearchIcon } from '@/components/ui/icons';
import type { AdminRoleId } from '@/lib/domain/admin';
import { getMessages } from '@/lib/i18n/server';

/**
 * Console header -- design source frame `oxEhj`, header.
 *
 * Sits above the work column rather than the rail, so the rail stays a single
 * uninterrupted dark band the way the design draws it. The search field is
 * presentational until the administration search exists (architecture.md 21);
 * the identity beside it is the real signed-in administrator.
 */
export async function AdminHeader({
  username,
  roles,
}: {
  username: string;
  roles: readonly AdminRoleId[];
}) {
  const t = await getMessages();
  const shell = t.admin.shell;
  const roleLabel = roles.length > 0 ? roles.map((role) => t.admin.roles[role]).join(' · ') : shell.noRole;
  const initial = Array.from(username.trim()).slice(0, 2).join('').toUpperCase() || 'A';

  return (
    <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between gap-6 border-b-2 border-line bg-card/95 px-[22px] backdrop-blur">
      <label className="flex h-9 w-full max-w-[390px] items-center gap-2 rounded-[7px] border-2 border-line bg-subtle px-3">
        <SearchIcon size={15} className="text-muted" />
        <input
          type="search"
          placeholder={shell.searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-[12px] tracking-[-0.023em] text-ink placeholder:text-ink/50 focus:outline-none"
        />
        <kbd className="hidden rounded-[4px] border-2 border-line bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted sm:inline-flex">
          {shell.searchShortcut}
        </kbd>
      </label>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className="hidden sm:block">
          <LocaleSwitcher variant="pill" />
        </span>

        <button
          type="button"
          aria-label={shell.notifications}
          title={shell.notifications}
          className="relative inline-flex size-9 items-center justify-center rounded-[7px] border-2 border-line bg-card text-steel transition-colors hover:bg-subtle"
        >
          <BellIcon size={15} />
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 size-[7px] rounded-full border-2 border-card bg-rose"
          />
        </button>

        <span aria-hidden className="hidden h-6 w-px bg-line sm:block" />

        <span className="hidden items-center gap-2 sm:flex">
          <span
            aria-hidden
            className="flex size-[31px] items-center justify-center rounded-[8px] bg-console text-[11px] font-semibold text-white"
          >
            {initial}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[12px] leading-[1.2] font-bold tracking-[-0.023em] text-ink">
              {username}
            </span>
            <span className="text-[10px] leading-[1.2] tracking-[-0.023em] text-muted">
              {roleLabel}
            </span>
          </span>
        </span>

        {/* POST so the sign-out carries an Origin to check. architecture.md 15.3 */}
        {/* Under /admin so the path-scoped session cookie reaches the handler. */}
        <form method="post" action="/admin/sign-out">
          <button
            type="submit"
            aria-label={shell.signOut}
            title={shell.signOut}
            className="inline-flex size-9 items-center justify-center rounded-[7px] border-2 border-line bg-card text-steel transition-colors hover:bg-subtle"
          >
            <LogOutIcon size={15} />
          </button>
        </form>
      </div>
    </header>
  );
}
