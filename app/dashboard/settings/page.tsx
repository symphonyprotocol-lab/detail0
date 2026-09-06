import type { Metadata } from 'next';
import {
  ArrowLink,
  Badge,
  IconTile,
  Meter,
  Notice,
  PANEL,
  PageHeader,
} from '@/components/dashboard/ui';
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CircleCheckIcon,
  CircleDollarSignIcon,
  ClockIcon,
  GitHubIcon,
  KeyIcon,
  LinkIcon,
  MailIcon,
  NotionIcon,
  ShieldCheckIcon,
} from '@/components/ui/icons';
import Link from 'next/link';
import { disconnectGithubAction, disconnectNotionAction } from './actions';
import { githubConnectionFor, notionConnectionFor } from '@/lib/application/auth';
import { dashboardCopy } from '@/lib/dashboard/demo-data';
import { isGithubConnectOutcome } from '@/lib/domain/github';
import { isNotionConnectOutcome } from '@/lib/domain/notion';
import { currentLocale, getMessages } from '@/lib/i18n/server';
import { fill } from '@/lib/i18n/format';
import { isNotionOAuthConfigured } from '@/lib/infrastructure/identity/notion';
import { requireSession } from '@/lib/http/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.settings.metaTitle };
}

/** Card header: icon tile, title and sub-line, with an optional trailing slot. */
function CardHead({
  icon,
  title,
  description,
  aside,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b-2 border-line px-5 py-4">
      <IconTile>{icon}</IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className="text-[14px] leading-[1.5] tracking-[-0.025em] text-ink">{title}</p>
        <p className="truncate text-[11px] tracking-[-0.023em] text-muted">{description}</p>
      </div>
      {aside}
    </div>
  );
}

/**
 * One provider row of the connections card. Connecting posts to the same
 * route the wizard uses, landing back here with `?github=` or `?notion=`;
 * disconnecting is a server action that forgets the sealed token.
 */
function ConnectionRow({
  provider,
  icon,
  name,
  note,
  connectedAs,
  connectedAt,
  unavailable,
  disconnect,
  labels,
  locale,
}: {
  provider: 'github' | 'notion';
  icon: React.ReactNode;
  name: string;
  note: string;
  connectedAs: string | null;
  connectedAt: Date | null;
  unavailable: boolean;
  disconnect: () => Promise<void>;
  labels: {
    connectedAs: string;
    connectedAt: string;
    notConnected: string;
    unavailable: string;
    connect: string;
    reconnect: string;
    disconnect: string;
  };
  locale: string;
}) {
  const connected = connectedAt !== null;
  const status = unavailable
    ? labels.unavailable
    : connected
      ? [
          connectedAs ? fill(labels.connectedAs, { name: connectedAs }) : null,
          fill(labels.connectedAt, { date: connectedAt.toLocaleDateString(locale) }),
        ]
          .filter(Boolean)
          .join(' · ')
      : labels.notConnected;
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-ink text-white">
        {icon}
      </span>
      <span className="flex min-w-[200px] flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-2 text-[13px] tracking-[-0.023em] text-ink">
          {name}
          <Badge tone={connected ? 'brand' : 'neutral'}>{status}</Badge>
        </span>
        <span className="text-[11px] tracking-[-0.023em] text-muted">{note}</span>
      </span>
      <span className="flex items-center gap-2">
        {/* POST, same-origin, behind the session: the connect route refuses anything else. */}
        {unavailable ? null : (
          <form method="post" action={`/api/auth/${provider}/connect`}>
            <input type="hidden" name="returnTo" value="/dashboard/settings" />
            <button
              type="submit"
              className="h-8 rounded-[7px] bg-brand px-3 text-[11px] font-medium text-white transition-colors hover:bg-brand/90"
            >
              {connected ? labels.reconnect : labels.connect}
            </button>
          </form>
        )}
        {connected ? (
          <form action={disconnect}>
            <button
              type="submit"
              className="h-8 rounded-[7px] border-2 border-line bg-card px-3 text-[11px] text-steel transition-colors hover:bg-subtle"
            >
              {labels.disconnect}
            </button>
          </form>
        ) : null}
      </span>
    </li>
  );
}

export default async function DashboardSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string; notion?: string }>;
}) {
  const session = await requireSession('/dashboard/settings');
  const [t, locale, params, github, notion] = await Promise.all([
    getMessages(),
    currentLocale(),
    searchParams,
    githubConnectionFor(session.user.id),
    notionConnectionFor(session.user.id),
  ]);
  const g = t.dashboard.settings;
  const { account, plan, billingPeriod, usageMeters } = dashboardCopy(t);

  const outcome = isGithubConnectOutcome(params.github)
    ? { provider: g.connectionGithub, code: params.github }
    : isNotionConnectOutcome(params.notion)
      ? { provider: g.connectionNotion, code: params.notion }
      : null;
  const connectionLabels = {
    connectedAs: g.connectionConnectedAs,
    connectedAt: g.connectionConnectedAt,
    notConnected: g.connectionNotConnected,
    unavailable: g.connectionUnavailable,
    connect: g.connectionConnect,
    reconnect: g.connectionReconnect,
    disconnect: g.connectionDisconnect,
  };

  const profileRows = [
    { label: g.email, value: account.email, Icon: MailIcon },
    { label: g.provider, value: account.provider, Icon: KeyIcon },
    { label: g.joined, value: account.joined, Icon: ClockIcon },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={g.eyebrow}
        title={g.title}
        description={g.description}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Profile -- design source frame `mwiI4`. */}
        <article className={`${PANEL} flex flex-col overflow-hidden p-0.5`}>
          <CardHead
            icon={<BadgeCheckIcon size={17} />}
            title={g.profileTitle}
            description={g.profileDescription}
          />

          <div className="flex items-center gap-2.5 border-b-2 border-line px-5 py-4">
            <span
              aria-hidden
              className="flex size-[46px] shrink-0 items-center justify-center rounded-xl bg-ink text-[15px] font-medium text-white"
            >
              {account.initials}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-[14px] tracking-[-0.023em] text-ink">{account.name}</span>
              <span className="text-[11px] tracking-[-0.023em] text-muted">{account.kind}</span>
            </span>
            <span className="text-[11px] tracking-[-0.023em] text-brand">{account.verified}</span>
          </div>

          <dl className="flex-1 px-5">
            {profileRows.map((row, index) => (
              <div
                key={row.label}
                className={`flex items-center justify-between gap-3 py-3.5 ${
                  index < profileRows.length - 1 ? 'border-b-2 border-line' : ''
                }`}
              >
                <dt className="flex items-center gap-[7px] text-[11px] tracking-[-0.023em] text-muted">
                  <row.Icon size={14} />
                  {row.label}
                </dt>
                <dd className="truncate text-[11px] font-semibold tracking-[-0.023em] text-steel">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <footer className="flex items-center gap-2 border-t-2 border-line px-5 py-3.5">
            <ShieldCheckIcon size={14} className="text-muted" />
            <p className="text-[11px] tracking-[-0.023em] text-muted">{g.providerManaged}</p>
          </footer>
        </article>

        {/* Subscription -- design source frame `mwiI4`. */}
        <article className={`${PANEL} flex flex-col overflow-hidden p-0.5`}>
          <CardHead
            icon={<CircleDollarSignIcon size={17} />}
            title={g.planTitle}
            description={g.planDescription}
            aside={<Badge tone="brand">{plan.name}</Badge>}
          />

          <div className="flex flex-col gap-1.5 border-b-2 border-line px-5 py-4">
            <p className="flex items-baseline gap-1">
              <span className="text-[26px] leading-[1.2] font-semibold tracking-[-0.03em] text-ink">
                {plan.price}
              </span>
              <span className="text-[13px] tracking-[-0.023em] text-muted">{plan.period}</span>
            </p>
            <p className="text-[11px] tracking-[-0.023em] text-muted">{plan.note}</p>
          </div>

          <ul className="flex flex-1 flex-col gap-3 px-5 py-4">
            {plan.perks.map((perk) => (
              <li
                key={perk}
                className="flex items-center gap-2 text-[12px] tracking-[-0.023em] text-steel"
              >
                <CircleCheckIcon size={14} className="text-brand" />
                {perk}
              </li>
            ))}
          </ul>

          <div className="px-5 pb-5">
            <Link
              href="/pricing"
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-brand text-[12px] font-medium tracking-[-0.023em] text-white transition-colors hover:bg-brand/90"
            >
              {g.upgradeCta}
              <ArrowRightIcon size={14} />
            </Link>
          </div>
        </article>
      </section>

      {/* Connected accounts: the grants the wizard imports with. */}
      <section className={`${PANEL} overflow-hidden p-0.5`}>
        <CardHead
          icon={<LinkIcon size={17} />}
          title={g.connectionsTitle}
          description={g.connectionsDescription}
        />
        {outcome ? (
          <p
            className={`border-b-2 border-line px-5 py-3 text-[11px] tracking-[-0.023em] ${
              outcome.code === 'connected' ? 'text-brandink' : 'text-rose'
            }`}
          >
            {fill(g.connectionOutcome[outcome.code], { provider: outcome.provider })}
          </p>
        ) : null}
        <ul className="divide-y-2 divide-line">
          <ConnectionRow
            provider="github"
            icon={<GitHubIcon size={17} className="text-white" />}
            name={g.connectionGithub}
            note={g.connectionGithubNote}
            connectedAs={github ? `@${github.login}` : null}
            connectedAt={github?.connectedAt ?? null}
            unavailable={false}
            disconnect={disconnectGithubAction}
            labels={connectionLabels}
            locale={locale}
          />
          <ConnectionRow
            provider="notion"
            icon={<NotionIcon size={17} className="text-white" />}
            name={g.connectionNotion}
            note={g.connectionNotionNote}
            connectedAs={notion ? (notion.workspaceName ?? notion.ownerName) : null}
            connectedAt={notion?.connectedAt ?? null}
            unavailable={!isNotionOAuthConfigured()}
            disconnect={disconnectNotionAction}
            labels={connectionLabels}
            locale={locale}
          />
        </ul>
        <footer className="flex items-center gap-2 border-t-2 border-line px-5 py-3.5">
          <ShieldCheckIcon size={14} className="shrink-0 text-muted" />
          <p className="text-[11px] tracking-[-0.023em] text-muted">{g.connectionFootnote}</p>
        </footer>
      </section>

      {/* Current usage -- design source frame `mwiI4`. */}
      <section className={`${PANEL} overflow-hidden p-0.5`}>
        <CardHead
          icon={<ClockIcon size={17} />}
          title={g.usageTitle}
          description={billingPeriod}
          aside={<ArrowLink href="/dashboard/requests">{g.usageLink}</ArrowLink>}
        />
        <div className="grid gap-6 px-5 py-5 sm:grid-cols-3">
          {usageMeters.map((meter) => (
            <div key={meter.label} className="flex flex-col gap-1">
              <p className="text-[12px] tracking-[-0.023em] text-steel">{meter.value}</p>
              <p className="text-[11px] tracking-[-0.023em] text-muted">{meter.label}</p>
              <Meter value={meter.percent} className="mt-2" />
            </div>
          ))}
        </div>
      </section>

      <Notice
        tone="brand"
        icon={<CircleDollarSignIcon size={17} />}
        title={g.billingNoticeTitle}
        body={g.billingNoticeBody}
        action={<ArrowLink href="/contact">{g.billingNoticeLink}</ArrowLink>}
      />
    </div>
  );
}
