import type { Metadata } from 'next';
import {
  ActionButton,
  ArrowLink,
  Badge,
  IconTile,
  ListHeader,
  Notice,
  PANEL,
  PageHeader,
  StatTile,
  StatusLabel,
} from '@/components/dashboard/ui';
import {
  BracesIcon,
  ClockIcon,
  KeyIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '@/components/ui/icons';
import { dashboardCopy } from '@/lib/dashboard/demo-data';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.apiKeys.metaTitle };
}

const STAT_ICONS = [KeyIcon, BracesIcon, ClockIcon, ShieldCheckIcon];
const GRID = 'grid grid-cols-[minmax(0,1fr)_124px_126px_84px_26px] items-center gap-2.5';

function RevokeButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex size-[26px] items-center justify-center rounded-md text-muted transition-colors hover:bg-mutedbg hover:text-rose"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width={15}
        height={15}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    </button>
  );
}

export default async function DashboardApiKeysPage() {
  const t = await getMessages();
  const k = t.dashboard.apiKeys;
  const d = dashboardCopy(t);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={k.eyebrow}
        title={k.title}
        description={k.description}
        action={
          <ActionButton href="/dashboard/api-keys">
            <PlusIcon size={15} />
            {k.createKey}
          </ActionButton>
        }
      />

      <section className="grid grid-cols-2 gap-[9px] sm:grid-cols-4">
        {d.apiKeyStats.map((stat, index) => {
          const Icon = STAT_ICONS[index] ?? KeyIcon;
          return (
            <StatTile key={stat.key} icon={<Icon size={17} />} value={stat.value} label={stat.label} />
          );
        })}
      </section>

      <Notice
        tone="brand"
        icon={<ShieldCheckIcon size={18} />}
        title={k.noticeTitle}
        body={k.noticeBody}
        action={<ArrowLink href="/docs">{k.noticeLink}</ArrowLink>}
      />

      {/* Key table -- design source frame `jLwpR`. */}
      <section className={`${PANEL} overflow-hidden p-0.5`}>
        <ListHeader
          title={k.listTitle}
          description={k.listDescription}
          aside={<Badge tone="brand">{d.apiKeyQuota.label}</Badge>}
        />

        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div
              className={`${GRID} border-t-2 border-line bg-subtle px-5 py-[11px] text-[11px] font-semibold tracking-[-0.023em] text-muted`}
            >
              {k.columns.map((column) => (
                <span key={column}>{column}</span>
              ))}
              <span />
            </div>

            {d.apiKeyDetails.map((key) => (
              <div key={key.masked} className={`${GRID} border-t-2 border-line px-5 py-5`}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <IconTile>
                    <KeyIcon size={15} />
                  </IconTile>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[13px] tracking-[-0.023em] text-ink">
                      {key.name}
                    </span>
                    <span className="truncate text-[10px] tracking-[-0.023em] text-muted">
                      {key.environment} · {fill(k.createdAt, { date: key.createdAt })}
                    </span>
                  </span>
                </span>

                <code className="inline-flex w-fit items-center rounded-[5px] bg-mutedbg px-[7px] py-[5px] font-mono text-[11px] tracking-[-0.023em] text-steel">
                  {key.masked}
                </code>

                <span className="flex flex-wrap gap-1">
                  {key.scopes.map((scope) => (
                    <Badge key={scope} tone="public">
                      {scope}
                    </Badge>
                  ))}
                </span>

                <StatusLabel tone="live">{key.lastUsed}</StatusLabel>

                <RevokeButton label={fill(k.revoke, { name: key.name })} />
              </div>
            ))}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t-2 border-line px-5 py-3.5">
          <ShieldCheckIcon size={14} className="text-muted" />
          <p className="flex-1 text-[11px] tracking-[-0.023em] text-muted">{d.apiKeyQuota.note}</p>
          <ArrowLink href="/pricing">{k.upgrade}</ArrowLink>
        </footer>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_217px]">
        <article className={`${PANEL} overflow-hidden p-0.5`}>
          <ListHeader
            title={k.activityTitle}
            description={k.activityDescription}
            aside={<ArrowLink href="/dashboard/requests">{k.activityLink}</ArrowLink>}
          />
          <ul className="px-5 pb-4">
            {d.apiKeyActivity.map((entry) => (
              <li
                key={entry.name}
                className="flex items-center gap-4 border-t-2 border-line py-2.5"
              >
                <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-brand" />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-[12px] font-bold tracking-[-0.023em] text-ink">
                    {entry.name}
                  </span>
                  <span className="truncate text-[10px] tracking-[-0.023em] text-muted">
                    {entry.detail}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] tracking-[-0.023em] text-muted">
                  {entry.when}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className={`${PANEL} flex flex-col p-[22px]`}>
          <IconTile>
            <ShieldCheckIcon size={17} />
          </IconTile>
          <p className="mt-3 text-[15px] leading-[1.4] tracking-[-0.025em] text-ink">
            {k.leastPrivilegeTitle}
          </p>
          <p className="mt-1.5 text-[11px] leading-[1.6] tracking-[-0.023em] text-muted">
            {k.leastPrivilegeBody}
          </p>
          <div className="mt-3.5">
            <ArrowLink href="/docs">{k.leastPrivilegeLink}</ArrowLink>
          </div>
        </article>
      </section>
    </div>
  );
}
