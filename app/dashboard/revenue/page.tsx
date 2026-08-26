import type { Metadata } from 'next';
import { MiniTrend } from '@/components/dashboard/mini-trend';
import {
  ActionButton,
  PANEL,
  PageHeader,
  SearchField,
  StatTile,
} from '@/components/dashboard/ui';
import {
  BracesIcon,
  CircleDollarSignIcon,
  ClockIcon,
  DatabaseIcon,
} from '@/components/ui/icons';
import {
  dashboardCopy,
  REVENUE_LIBRARY_TOTAL,
  REVENUE_TREND_MAX,
  type SettlementStatus,
} from '@/lib/dashboard/demo-data';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.revenue.metaTitle };
}

const STAT_ICONS = [CircleDollarSignIcon, BracesIcon, ClockIcon, DatabaseIcon];
const GRID = 'grid grid-cols-[minmax(0,1fr)_100px_58px_76px_72px_68px] items-center gap-3';

const SETTLEMENT_TONE: Record<SettlementStatus, string> = {
  accrued: 'bg-pubsoft text-pubink',
  held: 'bg-warnsoft text-warn',
  paid: 'bg-mutedbg text-steel',
};

function ExportIcon() {
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

export default async function DashboardRevenuePage() {
  const t = await getMessages();
  const r = t.dashboard.revenue;
  const d = dashboardCopy(t);

  const filters = [
    { label: r.filterPeriod, options: ['2026-08', '2026-07', '2026-06'] },
    { label: r.filterStatus, options: r.statusOptions },
    { label: r.filterLibrary, options: r.libraryOptions },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={r.eyebrow}
        title={r.title}
        description={r.description}
        action={
          <ActionButton href="/dashboard/revenue" variant="outline">
            <ExportIcon />
            {r.exportStatement}
          </ActionButton>
        }
      />

      <section className="grid grid-cols-2 gap-[9px] sm:grid-cols-4">
        {d.revenueStats.map((stat, index) => {
          const Icon = STAT_ICONS[index] ?? CircleDollarSignIcon;
          return (
            <StatTile key={stat.key} icon={<Icon size={17} />} value={stat.value} label={stat.label} />
          );
        })}
      </section>

      <MiniTrend
        title={r.trendTitle}
        subtitle={r.trendSubtitle}
        legend={r.trendLegend}
        bars={d.revenueTrend}
        max={REVENUE_TREND_MAX}
        format={(value) => `$${value.toFixed(2)}`}
      />

      {/* Settlement table -- design source frame `L4Z2w`. */}
      <section className={`${PANEL} overflow-hidden p-0.5`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line px-[18px] pt-3.5 pb-4">
          <div className="flex min-w-[240px] flex-1 items-center">
            <SearchField placeholder={r.searchPlaceholder} />
          </div>
          <div className="flex gap-1.5">
            {filters.map((filter) => (
              <label key={filter.label} className="flex w-24 flex-col gap-0.5">
                <span className="text-[9px] tracking-[-0.023em] text-muted">{filter.label}</span>
                <select
                  defaultValue={filter.options[0]}
                  className="h-[26px] rounded-md border-2 border-line bg-card px-1.5 text-[10px] tracking-[-0.023em] text-steel focus:outline-none"
                >
                  {filter.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div className={`${GRID} bg-subtle px-[18px] py-3 text-[11px] tracking-[-0.023em] text-muted`}>
              {r.columns.map((column) => (
                <span key={column}>{column}</span>
              ))}
            </div>

            {d.revenueRows.map((row) => (
              <div
                key={row.libraryId}
                className={`${GRID} border-t-2 border-line px-[18px] py-3.5 transition-colors hover:bg-subtle`}
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-[12px] tracking-[-0.023em] text-steel">
                    {row.title}
                  </span>
                  <span className="truncate font-mono text-[10px] text-muted">{row.libraryId}</span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[11px] tracking-[-0.023em] text-steel">{row.calls}</span>
                  <span className="text-[10px] tracking-[-0.023em] text-muted">{row.share}</span>
                </span>
                <span className="text-[12px] tracking-[-0.023em] text-steel">{row.rate}</span>
                <span className="text-[12px] tracking-[-0.023em] text-steel">{row.period}</span>
                <span
                  className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${SETTLEMENT_TONE[row.status]}`}
                >
                  {row.statusLabel}
                </span>
                <span className="text-[12px] font-semibold tracking-[-0.023em] text-ink">
                  {row.amount}
                </span>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-line px-[18px] py-3">
          <p className="text-[11px] tracking-[-0.023em] text-muted">
            {fill(r.countLine, {
              shown: d.revenueRows.length,
              total: REVENUE_LIBRARY_TOTAL,
            })}
          </p>
          <div className="flex gap-1.5">
            {[r.previous, '1', '2', '3', r.next].map((page) => (
              <button
                key={page}
                type="button"
                className={`h-[26px] rounded-[5px] border-2 px-[7px] text-[11px] transition-colors ${
                  page === '1'
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-card text-steel hover:bg-subtle'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        </footer>
      </section>
    </div>
  );
}
