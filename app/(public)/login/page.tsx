import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/site/wordmark';
import {
  ArrowRightIcon,
  BookOpenCheckIcon,
  GitHubIcon,
  GoogleIcon,
  KeyIcon,
  LockKeyholeIcon,
  MessagesSquareIcon,
  ShieldCheckIcon,
  CircleXIcon,
} from '@/components/ui/icons';
import { isLoginError, safeReturnTo } from '@/lib/domain/auth';
import { optionalSession } from '@/lib/http/session';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { login } = await getMessages();
  return { title: login.metaTitle, description: login.metaDescription };
}

const PERK_ICONS = [MessagesSquareIcon, KeyIcon, BookOpenCheckIcon];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, t] = await Promise.all([searchParams, getMessages()]);
  const returnTo = safeReturnTo(params.returnTo);
  const l = t.login;

  /** Error copy comes from `lib/domain/auth` codes, which carry no provider detail. */
  const providers = [
    { id: 'github', ...l.providers.github, icon: <GitHubIcon size={18} className="text-ink" /> },
    { id: 'google', ...l.providers.google, icon: <GoogleIcon size={18} /> },
  ];

  // Already signed in: go straight where the visitor was headed.
  const session = await optionalSession();
  if (session) redirect(returnTo);

  const error = isLoginError(params.error) ? params.error : null;

  return (
    <section className="site-wash">
      <div className="mx-auto flex w-full max-w-[918px] flex-col items-center gap-5 px-5 pt-[66px] pb-[86px]">
        <div className="w-full max-w-[430px] rounded-[14px] border-2 border-line bg-card/95 pt-9 shadow-[0_18px_60px_rgba(3,26,30,0.08)]">
          <div className="flex justify-center px-[30px]">
            <Wordmark />
          </div>

          <div className="mt-[23px] flex flex-col gap-[9px] px-[30px]">
            <h1 className="text-center text-[28px] leading-[1.5] font-[650] tracking-[-0.045em] text-ink">
              {l.title}
            </h1>
            <p className="mx-auto max-w-[310px] text-center text-[11px] leading-[1.65] tracking-[-0.03em] text-muted">
              {l.subtitle}
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-4 mx-[30px] flex items-start gap-2 rounded-[7px] bg-warnsoft p-2.5 text-[9px] leading-[1.5] tracking-[-0.03em] text-warn"
            >
              <CircleXIcon size={15} className="mt-px" />
              {l.errors[error]}
            </p>
          ) : null}

          <div className="mt-[27px] flex flex-col gap-[9px] px-[30px]">
            {providers.map((p) => (
              <form key={p.id} method="post" action={`/api/auth/${p.id}/start`}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="flex w-full h-[58px] items-center gap-[11px] rounded-[9px] border-2 border-line bg-card px-[14px] text-left transition-colors hover:bg-subtle"
                >
                  <span
                    aria-hidden
                    className="flex size-[33px] shrink-0 items-center justify-center rounded-lg border-2 border-line bg-subtle"
                  >
                    {p.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-[11px] leading-[1.5] font-[650] tracking-[-0.03em] text-ink">
                      {p.name}
                    </span>
                    <span className="text-[9px] leading-[1.5] tracking-[-0.03em] text-muted">
                      {p.hint}
                    </span>
                  </span>
                  <ArrowRightIcon size={15} className="text-muted" />
                </button>
              </form>
            ))}
          </div>

          <div className="mt-5 px-[30px]">
            <p className="flex items-start gap-2 rounded-[7px] bg-mutedbg p-2.5 text-[9px] leading-[1.5] tracking-[-0.03em] text-muted">
              <ShieldCheckIcon size={15} className="mt-px text-brand" />
              {l.passwordNote}
            </p>
          </div>

          <p className="mt-4 px-[30px] text-center text-[8px] leading-[1.5] tracking-[-0.03em] text-muted">
            {l.termsLead}
            <Link href="/legal" className="mx-0.5 text-brandink hover:underline">
              {l.termsLink}
            </Link>
            {l.termsTail}
          </p>

          <p className="mt-[22px] flex items-center justify-center gap-1.5 border-t-2 border-line pt-[18px] pb-4 text-[9px] leading-[1.5] tracking-[-0.03em] text-muted">
            <LockKeyholeIcon size={13} className="text-brand" />
            {l.autoCreate}
          </p>
        </div>

        <ul className="flex flex-wrap items-center justify-center gap-x-[18px] gap-y-2">
          {l.perks.map((label, index) => {
            const PerkIcon = PERK_ICONS[index] ?? KeyIcon;
            return (
              <li
                key={label}
                className="flex items-center gap-[5px] text-[9px] leading-[1.5] tracking-[-0.03em] text-muted"
              >
                <PerkIcon size={14} className="text-brand" />
                {label}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
