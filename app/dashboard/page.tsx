import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiQuickstart } from '@/components/dashboard/api-quickstart';
import { CopyButton } from '@/components/dashboard/copy-button';
import { UsageChart, type UsageChartDay } from '@/components/dashboard/usage-chart';
import {
  ActionButton,
  ArrowLink,
  PANEL,
  PageHeader,
  PanelHeading,
} from '@/components/dashboard/ui';
import { PlusIcon, TerminalIcon } from '@/components/ui/icons';
import { listApiKeys } from '@/lib/application/auth';
import { countWorkspaceLibraries } from '@/lib/application/libraries';
import { INSTALL_COMMAND } from '@/lib/dashboard/demo-data';
import { workspaceUsage } from '@/lib/http/dashboard';
import { requireSession } from '@/lib/http/session';
import { getMessages, translations } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.overview.title };
}

const CHART_DAYS = 10;

/**
 * The overview, on the ledger: quota and volume from the rebuilt usage
 * summary (architecture.md 11.1), library and key counts from the rows
 * themselves. The install and quickstart panels stay copy -- they document
 * the product, not this workspace.
 */
export default async function DashboardOverviewPage() {
  const [session, { locale, t }] = await Promise.all([
    requireSession('/dashboard'),
    translations(),
  ]);
  const o = t.dashboard.overview;
  const workspaceId = session.workspace.id;

  const [overview, keys, libraryCount] = await Promise.all([
    workspaceUsage(workspaceId),
    listApiKeys(workspaceId),
    countWorkspaceLibraries(workspaceId),
  ]);

  const number = new Intl.NumberFormat(locale);
  const stats: {
    label: string;
    value: string;
    caption?: string;
    quota?: { used: number; limit: number };
  }[] = [
    {
      label: o.stats.calls,
      value: `${number.format(overview.callsThisPeriod)} / ${number.format(overview.planAllowance)}`,
      quota: { used: overview.callsThisPeriod, limit: Math.max(1, overview.planAllowance) },
    },
    {
      label: o.stats.tokens,
      value: number.format(overview.returnedTokensThisPeriod),
      caption: o.stats.tokensCaption,
    },
    {
      label: o.stats.libraries,
      value: number.format(libraryCount),
      caption: o.stats.librariesCaption,
    },
    {
      label: o.stats.addon,
      value: number.format(overview.addonBalanceRemaining),
      caption: o.stats.addonCaption,
    },
    {
      label: o.stats.buildCalls,
      value: number.format(overview.buildCallsThisPeriod),
      caption: o.stats.buildCallsCaption,
    },
  ];

  const byDate = new Map(overview.buckets.map((bucket) => [bucket.date, bucket.calls]));
  const dayFormat = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const days: UsageChartDay[] = Array.from({ length: CHART_DAYS }, (_, index) => {
    const at = new Date(Date.now() - (CHART_DAYS - 1 - index) * 86_400_000);
    return {
      label: dayFormat.format(at),
      calls: byDate.get(at.toISOString().slice(0, 10)) ?? 0,
    };
  });

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Page header -- design source `MWSfb`. */}
      <PageHeader
        eyebrow={session.workspace.name}
        title={o.title}
        description={o.description}
        action={
          <ActionButton href="/dashboard/libraries/new">
            <PlusIcon size={15} />
            {o.addLibrary}
          </ActionButton>
        }
      />

      {/* Metric strip -- design source `J5PPjZ`. */}
      <section className={`${PANEL} grid grid-cols-2 gap-y-5 p-5 sm:grid-cols-4 sm:gap-y-0`}>
        {stats.map((stat, index) => (
          <article
            key={stat.label}
            /* One divider between columns: every odd cell when wrapped to two, every cell but the first on wide. */
            className={`flex flex-col pr-[18px] ${
              index % 2 === 1 ? 'border-l-2 border-line pl-5' : 'pl-1'
            } ${index === 0 ? 'sm:border-l-0 sm:pl-1' : 'sm:border-l-2 sm:border-line sm:pl-5'}`}
          >
            <p className="text-[11px] tracking-[0.03em] text-muted">{stat.label}</p>
            <p className="mt-1.5 text-[20px] leading-[1.5] font-semibold tracking-[-0.02em] text-ink">
              {stat.value}
            </p>
            {stat.quota ? (
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-mutedbg">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${Math.min(100, (stat.quota.used / stat.quota.limit) * 100)}%` }}
                />
              </div>
            ) : (
              <p className="mt-1 text-[12px] tracking-[-0.023em] text-muted">{stat.caption}</p>
            )}
          </article>
        ))}
      </section>

      {/* Call volume -- design source `C06o6`. */}
      <section className={`${PANEL} flex flex-col gap-3.5 p-[30px]`}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[16px] leading-[1.5] tracking-[-0.025em] text-ink">
              {o.usageTitle}
            </h2>
            <p className="text-[13px] leading-[1.5] tracking-[-0.023em] text-muted">
              {o.usageSubtitle}
            </p>
          </div>
          <span className="inline-flex h-[29px] items-center rounded-[7px] border-2 border-publine px-[11px]">
            <ArrowLink href="/pricing">{o.usageUpgrade}</ArrowLink>
          </span>
        </div>
        <UsageChart days={days} />
      </section>

      {/* API keys -- design source `DQVXY`. */}
      <section className={`${PANEL} flex flex-col gap-[22px] p-[30px]`}>
        <PanelHeading
          title={o.keysTitle}
          description={o.keysDescription}
          action={
            <ActionButton href="/dashboard/api-keys">
              <PlusIcon size={14} />
              {o.createKey}
            </ActionButton>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-line">
                {o.keyColumns.map((head, index) => (
                  <th
                    key={head}
                    scope="col"
                    className={`pb-[9px] text-[11px] font-normal tracking-[-0.023em] text-muted ${
                      index === 0 ? 'w-[29%]' : index === 3 ? 'w-[19%]' : 'w-[26%]'
                    }`}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b-2 border-line">
                  <td className="py-3.5 text-[12px] font-semibold tracking-[-0.023em] text-steel">
                    {key.name}
                  </td>
                  <td className="py-3.5">
                    <code className="inline-flex items-center rounded-[5px] bg-mutedbg px-1.5 py-1 font-mono text-[11px] tracking-[-0.023em] text-steel">
                      {key.masked}
                    </code>
                  </td>
                  <td className="py-3.5 text-[12px] tracking-[-0.023em] text-steel">
                    {date.format(new Date(key.createdAt))}
                  </td>
                  <td className="py-3.5 text-[12px] tracking-[-0.023em] text-steel">
                    {key.lastUsedAt ? dateTime.format(new Date(key.lastUsedAt)) : '—'}
                  </td>
                </tr>
              ))}
              {keys.length === 0 ? (
                <tr>
                  <td
                    colSpan={o.keyColumns.length}
                    className="py-6 text-center text-[12px] text-muted"
                  >
                    {o.keysEmpty}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Install -- design source `QabFh`. */}
      <section className={`${PANEL} flex flex-col gap-[13px] p-[30px]`}>
        <PanelHeading
          title={o.installTitle}
          description={o.installDescription}
        />
        <div className="flex h-[52px] items-center gap-2.5 rounded-lg bg-terminal px-3.5">
          <TerminalIcon size={16} className="text-brand" />
          <code className="flex-1 truncate font-mono text-[13px] tracking-[-0.023em] text-white">
            {INSTALL_COMMAND}
          </code>
          <CopyButton
            value={INSTALL_COMMAND}
            label={o.installCommandLabel}
            className="text-[#aebec0] hover:bg-white/10"
          />
        </div>
        <p className="text-[12px] tracking-[-0.023em] text-muted">
          {o.installManualLead}
          <Link href="/docs" className="text-brandink underline-offset-2 hover:underline">
            {o.installManualLink}
          </Link>
          {o.installManualTail}
        </p>
      </section>

      {/* REST quickstart -- design source `lRoBh`. */}
      <section className={`${PANEL} flex flex-col p-[30px]`}>
        <PanelHeading
          title={o.quickstartTitle}
          description={o.quickstartDescription}
        />
        <ApiQuickstart />
      </section>
    </div>
  );
}
