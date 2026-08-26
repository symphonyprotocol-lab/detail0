import type { Metadata } from 'next';
import { MiniTrend } from '@/components/dashboard/mini-trend';
import { RequestLog } from '@/components/dashboard/request-log';
import { ActionButton, PageHeader, StatTile } from '@/components/dashboard/ui';
import {
  BracesIcon,
  CircleCheckIcon,
  ClockIcon,
  DatabaseIcon,
} from '@/components/ui/icons';
import { dashboardCopy, MONTHLY_CALLS, REQUEST_TREND_MAX } from '@/lib/dashboard/demo-data';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.requests.metaTitle };
}

const STAT_ICONS = [BracesIcon, CircleCheckIcon, ClockIcon, DatabaseIcon];

function DownloadIcon() {
  return (
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
      className="shrink-0"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export default async function DashboardRequestsPage() {
  const t = await getMessages();
  const r = t.dashboard.requests;
  const d = dashboardCopy(t);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={r.eyebrow}
        title={r.title}
        description={r.description}
        action={
          <ActionButton href="/dashboard/requests" variant="outline">
            <DownloadIcon />
            {r.exportCsv}
          </ActionButton>
        }
      />

      <section className="grid grid-cols-2 gap-[9px] sm:grid-cols-4">
        {d.requestStats.map((stat, index) => {
          const Icon = STAT_ICONS[index] ?? BracesIcon;
          return (
            <StatTile key={stat.key} icon={<Icon size={17} />} value={stat.value} label={stat.label} />
          );
        })}
      </section>

      <MiniTrend
        title={r.trendTitle}
        subtitle={r.trendSubtitle}
        legend={fill(r.trendLegend, {
          used: MONTHLY_CALLS.used,
          limit: MONTHLY_CALLS.limit.toLocaleString('en-US'),
        })}
        bars={d.requestTrend}
        max={REQUEST_TREND_MAX}
        format={(value) => fill(r.trendFormat, { value })}
      />

      <RequestLog />
    </div>
  );
}
