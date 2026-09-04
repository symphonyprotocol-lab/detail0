import type { Metadata } from 'next';
import { MiniTrend } from '@/components/dashboard/mini-trend';
import { RequestLog, type RequestLogView } from '@/components/dashboard/request-log';
import { PageHeader, StatTile } from '@/components/dashboard/ui';
import {
  BracesIcon,
  CircleCheckIcon,
  ClockIcon,
  DatabaseIcon,
} from '@/components/ui/icons';
import { listRequests } from '@/lib/application/plans';
import { workspaceUsage } from '@/lib/http/dashboard';
import { requireSession } from '@/lib/http/session';
import { fill } from '@/lib/i18n/format';
import { getMessages, translations } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.requests.metaTitle };
}

const TREND_DAYS = 12;

/**
 * The requests screen, on the ledger. architecture.md 6.3 and 11.1: the
 * trend is the rebuilt usage summary, the stats are the events' figures for
 * the current period, and the log lists real requests -- outcome, library,
 * latency, never the query text.
 */
export default async function DashboardRequestsPage() {
  const [session, { locale, t }] = await Promise.all([
    requireSession('/dashboard/requests'),
    translations(),
  ]);
  const r = t.dashboard.requests;

  const [overview, requests] = await Promise.all([
    workspaceUsage(session.workspace.id),
    listRequests(session.workspace.id),
  ]);

  const served = requests.filter((row) => row.statusCode < 400);
  const latencies = served
    .map((row) => row.latencyMs)
    .filter((value): value is number => value !== null);
  const averageLatency =
    latencies.length === 0
      ? null
      : Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);
  const number = new Intl.NumberFormat(locale);
  const stats = [
    { key: 'calls', value: number.format(overview.callsThisPeriod), label: r.stats.calls },
    {
      key: 'success',
      value:
        requests.length === 0 ? '—' : `${((served.length / requests.length) * 100).toFixed(1)}%`,
      label: r.stats.success,
    },
    {
      key: 'latency',
      value: averageLatency === null ? '—' : `${number.format(averageLatency)} ms`,
      label: r.stats.latency,
    },
    {
      key: 'tokens',
      value: number.format(overview.returnedTokensThisPeriod),
      label: r.stats.tokens,
    },
  ];

  /* The last N days, zero-filled: an empty day is a bar of height zero. */
  const byDate = new Map(overview.buckets.map((bucket) => [bucket.date, bucket.calls]));
  const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const bars = Array.from({ length: TREND_DAYS }, (_, index) => {
    const at = new Date(Date.now() - (TREND_DAYS - 1 - index) * 86_400_000);
    const date = at.toISOString().slice(0, 10);
    return { label: day.format(at), value: byDate.get(date) ?? 0 };
  });
  const max = Math.max(1, ...bars.map((bar) => bar.value));

  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const entries: RequestLogView[] = requests.map((row) => ({
    id: row.requestId.slice(0, 14),
    time: time.format(new Date(row.createdAt)),
    operation: row.operation,
    surface: row.entrypoint === 'rest' ? 'REST API' : row.entrypoint === 'web' ? 'Web' : '—',
    library: row.libraryPublicId ?? '—',
    key: '—',
    status: row.statusCode,
    latency: row.latencyMs === null ? '—' : `${row.latencyMs} ms`,
  }));

  const STAT_ICONS = [BracesIcon, CircleCheckIcon, ClockIcon, DatabaseIcon];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={r.eyebrow} title={r.title} description={r.description} />

      <section className="grid grid-cols-2 gap-[9px] sm:grid-cols-4">
        {stats.map((stat, index) => {
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
          used: number.format(overview.callsThisPeriod),
          limit: number.format(overview.planAllowance),
        })}
        bars={bars}
        max={max}
        format={(value) => fill(r.trendFormat, { value })}
      />

      <RequestLog entries={entries} />
    </div>
  );
}
