import type { Metadata } from 'next';
import Link from 'next/link';
import { GrowthChart } from '@/components/admin/growth-chart';
import {
  CONSOLE_PANEL,
  ConsoleButton,
  ConsolePageHeader,
  Meter,
  Panel,
  PanelHead,
} from '@/components/admin/ui';
import {
  ArrowUpRightIcon,
  CalendarIcon,
  ChevronDownIcon,
  CircleDollarSignIcon,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  TrendingUpIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { adminCopy, type ActivityTone } from '@/lib/admin/demo-data';
import type { AdminCapability } from '@/lib/domain/admin';
import { requireAdmin } from '@/lib/http/admin';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.overview.title };
}

const STAT_ICONS = [UsersIcon, DatabaseIcon, ClockIcon, CircleDollarSignIcon];

/**
 * What each tile and panel is about, so a role only sees the parts it may act
 * on. The overview is the one console screen open to every administrator --
 * it is where `requireAdminCapability` sends anyone who lands somewhere they
 * are not entitled to, so it must never be a way around the matrix.
 */
const STAT_NEEDS: AdminCapability[] = [
  'users',
  'libraries',
  'libraries',
  'billing',
];

const ACTIVITY_TONE: Record<ActivityTone, string> = {
  brand: 'bg-brandsoft text-brandink',
  neutral: 'bg-mutedbg text-steel',
  amber: 'bg-ambersoft text-amberink',
  rose: 'bg-rosesoft text-err',
};

export default async function AdminOverviewPage() {
  const [session, t] = await Promise.all([requireAdmin(), getMessages()]);
  const o = t.admin.overview;
  const d = adminCopy(t);
  const can = (capability: AdminCapability) =>
    session.capabilities.includes(capability);
  const stats = d.stats.filter((_, index) => can(STAT_NEEDS[index] ?? 'users'));

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Page header -- design source `oxEhj`. */}
      <ConsolePageHeader
        eyebrow={t.admin.eyebrow}
        title={o.title}
        description={o.description}
        action={
          <ConsoleButton>
            <CalendarIcon size={14} />
            {o.range}
            <ChevronDownIcon size={13} />
          </ConsoleButton>
        }
      />

      {/* Metric strip. */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = STAT_ICONS[d.stats.indexOf(stat)] ?? UsersIcon;
          return (
            <article
              key={stat.label}
              className={`${CONSOLE_PANEL} flex items-center gap-3 p-[18px]`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[9px] bg-brandsoft text-brand">
                <Icon size={18} />
              </span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="text-[11px] leading-[1.35] tracking-[-0.023em] text-muted">
                  {stat.label}
                </span>
                <span className="text-[20px] leading-[1.3] font-semibold tracking-[-0.03em] text-ink">
                  {stat.value}
                </span>
                {stat.delta ? (
                  <span className="flex items-center gap-1 text-[11px] tracking-[-0.023em] text-good">
                    <TrendingUpIcon size={12} />
                    {stat.delta}
                  </span>
                ) : (
                  <span className="text-[11px] tracking-[-0.023em] text-amberink">
                    {stat.caption}
                  </span>
                )}
              </span>
            </article>
          );
        })}
      </section>

      {/* User growth. */}
      {can('users') ? (
        <Panel>
          <PanelHead
            title={o.growthTitle}
            description={o.growthSubtitle}
            action={<ConsoleButton>{o.growthRange}</ConsoleButton>}
          />
          <div className="flex flex-col gap-4 p-[19px]">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[19px] leading-[1.3] font-semibold tracking-[-0.03em] text-ink">
                  {d.growthNewUsers}
                </span>
                <span className="text-[11px] tracking-[-0.023em] text-muted">
                  {o.growthNewUsers}
                </span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[19px] leading-[1.3] font-semibold tracking-[-0.03em] text-ink">
                  {d.growthConversion}
                </span>
                <span className="text-[11px] tracking-[-0.023em] text-muted">
                  {o.growthConversion}
                </span>
              </span>
              <ul className="flex items-center gap-3.5">
                {[
                  { label: o.seriesUsers, dot: 'bg-barstrong' },
                  { label: o.seriesPaid, dot: 'bg-bar' },
                ].map((series) => (
                  <li
                    key={series.label}
                    className="flex items-center gap-1.5 text-[11px] tracking-[-0.023em] text-muted"
                  >
                    <span
                      aria-hidden
                      className={`size-[7px] rounded-full ${series.dot}`}
                    />
                    {series.label}
                  </li>
                ))}
              </ul>
            </div>
            <GrowthChart />
          </div>
        </Panel>
      ) : null}

      {/* Review queue. */}
      {can('libraries') ? (
        <Panel>
          <PanelHead
            title={o.pendingTitle}
            description={o.pendingSubtitle}
            action={
              <Link
                href="/admin/libraries"
                className="inline-flex items-center gap-1.5 text-[12px] tracking-[-0.023em] text-brandink hover:text-brand"
              >
                {o.pendingAll}
                <ArrowUpRightIcon size={13} />
              </Link>
            }
          />
          <ul>
            {d.pendingQueue.map((item, index) => (
              <li
                key={item.title}
                className={`flex flex-wrap items-center gap-3 px-[15px] py-3.5 ${
                  index === 0 ? 'border-b-2 border-line' : ''
                }`}
              >
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[8px] bg-ambersoft text-amberink">
                  <FileTextIcon size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[12px] font-medium tracking-[-0.023em] text-ink">
                    {item.title}
                  </span>
                  <span className="truncate text-[11px] tracking-[-0.023em] text-muted">
                    {item.meta}
                  </span>
                </span>
                <ConsoleButton className="h-[30px] border-publine text-brandink">
                  {t.admin.actions.review}
                </ConsoleButton>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* Live activity -- reachable only with the audit capability, since it is
          a window onto the same events the audit log records. */}
      {can('audit') ? (
        <Panel>
          <PanelHead
            title={o.activityTitle}
            description={o.activitySubtitle}
            action={
              <Link
                href="/admin/audit"
                className="inline-flex items-center gap-1.5 text-[12px] tracking-[-0.023em] text-brandink hover:text-brand"
              >
                {o.activityLink}
                <ArrowUpRightIcon size={13} />
              </Link>
            }
          />
          <ul className="px-[17px]">
            {d.activity.map((entry, index) => (
              <li
                key={entry.title}
                className={`flex items-center gap-2.5 py-3.5 ${
                  index === d.activity.length - 1
                    ? ''
                    : 'border-b-2 border-line'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex size-[29px] shrink-0 items-center justify-center rounded-[7px] ${ACTIVITY_TONE[entry.tone]}`}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-[12px] tracking-[-0.023em] text-ink">
                    {entry.title}
                  </span>
                  <span className="truncate text-[11px] tracking-[-0.023em] text-muted">
                    {entry.meta}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] tracking-[-0.023em] whitespace-nowrap text-muted">
                  {entry.when}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* Platform health. */}
      <Panel>
        <PanelHead
          title={o.healthTitle}
          description={o.healthSubtitle}
          action={
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-[-0.023em] text-pubink">
              <span aria-hidden className="size-1.5 rounded-full bg-good" />
              {o.healthOk}
            </span>
          }
        />
        <ul className="flex flex-col gap-3.5 px-[17px] py-4">
          {d.health.map((row) => (
            <li key={row.label} className="flex flex-col gap-2">
              <span className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold tracking-[-0.023em] text-ink">
                  {row.label}
                </span>
                <span className="text-[11px] tracking-[-0.023em] text-muted">
                  {row.value}
                </span>
              </span>
              <Meter value={row.percent} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
