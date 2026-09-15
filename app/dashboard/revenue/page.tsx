import type { Metadata } from 'next';
import { MiniTrend } from '@/components/dashboard/mini-trend';
import { PANEL, PageHeader, StatTile } from '@/components/dashboard/ui';
import {
  BracesIcon,
  CircleDollarSignIcon,
  ClockIcon,
  DatabaseIcon,
} from '@/components/ui/icons';
import { publisherEarnings } from '@/lib/application/revenue';
import { revenuePeriodId } from '@/lib/domain';
import { requireSession } from '@/lib/http/session';
import { fill } from '@/lib/i18n/format';
import { getMessages, translations } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.revenue.metaTitle };
}

const GRID = 'grid grid-cols-[110px_minmax(0,1fr)_100px_90px] items-center gap-3';

function usd(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

/**
 * The publisher's revenue screen, on the ledger. publisher-revenue-share.md
 * stage 2: every amount is recomputed from earning events and locked period
 * rows -- a settled period shows what closePeriod allocated, an accruing one
 * shows its calls and settles at close, and nothing here is a balance anyone
 * can move.
 */
export default async function DashboardRevenuePage() {
  const [session, { locale, t }] = await Promise.all([
    requireSession('/dashboard/revenue'),
    translations(),
  ]);
  const r = t.dashboard.revenue;

  const earnings = await publisherEarnings(session.workspace.id);
  const number = new Intl.NumberFormat(locale);

  const currentPeriod = revenuePeriodId(new Date());
  const current = earnings.periods.find((period) => period.periodId === currentPeriod);
  const lockedCount = earnings.periods.filter((period) => period.locked).length;

  const stats = [
    { key: 'accrued', value: usd(earnings.accruedMinor), label: r.stats.accrued, Icon: CircleDollarSignIcon },
    {
      key: 'calls',
      value: number.format(current?.attributableCalls ?? 0),
      label: r.stats.currentCalls,
      Icon: BracesIcon,
    },
    { key: 'locked', value: number.format(lockedCount), label: r.stats.lockedPeriods, Icon: ClockIcon },
    {
      key: 'threshold',
      value: usd(earnings.payoutThresholdMinor),
      label: r.stats.threshold,
      Icon: DatabaseIcon,
    },
  ];

  /* Oldest to newest, so the trend reads left to right. */
  const chronological = [...earnings.periods].reverse();
  const bars = chronological.map((period) => ({
    label: period.periodId,
    value: (period.amountMinor ?? 0) / 100,
  }));
  const max = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={r.eyebrow} title={r.title} description={r.description} />

      <section className="grid grid-cols-2 gap-[9px] sm:grid-cols-4">
        {stats.map(({ key, value, label, Icon }) => (
          <StatTile key={key} icon={<Icon size={17} />} value={value} label={label} />
        ))}
      </section>

      {bars.length > 0 ? (
        <MiniTrend
          title={r.trendTitle}
          subtitle={r.trendSubtitle}
          legend={fill(r.holdNote, {
            days: earnings.holdDays,
            threshold: usd(earnings.payoutThresholdMinor),
          })}
          bars={bars}
          max={max}
          format={(value) => `$${value.toFixed(2)}`}
        />
      ) : null}

      {earnings.account === null ? (
        <p className={`${PANEL} px-[18px] py-3.5 text-[12px] leading-[1.7] text-muted`}>
          {r.noAccountNotice}
        </p>
      ) : null}

      {/* Period table: one row per period the workspace earned in. */}
      <section className={`${PANEL} overflow-hidden p-0.5`}>
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className={`${GRID} bg-subtle px-[18px] py-3 text-[11px] text-muted`}>
              {r.periodColumns.map((column) => (
                <span key={column}>{column}</span>
              ))}
            </div>

            {earnings.periods.map((period) => (
              <div
                key={period.periodId}
                className={`${GRID} border-t border-line px-[18px] py-3.5 transition-colors hover:bg-subtle`}
              >
                <span className="font-mono text-[12px] text-steel">
                  {period.periodId}
                </span>
                <span className="text-[12px] text-steel">
                  {number.format(period.attributableCalls)}
                </span>
                <span
                  className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${
                    period.locked ? 'bg-mutedbg text-steel' : 'bg-pubsoft text-pubink'
                  }`}
                >
                  {period.locked ? r.statusLocked : r.statusAccruing}
                </span>
                <span className="text-[12px] font-medium text-ink">
                  {period.amountMinor === null ? r.pendingAmount : usd(period.amountMinor)}
                </span>
              </div>
            ))}

            {earnings.periods.length === 0 ? (
              <p className="border-t border-line px-[18px] py-10 text-center text-[13px] text-muted">
                {r.periodsEmpty}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
