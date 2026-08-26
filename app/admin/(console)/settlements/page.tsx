import type { Metadata } from 'next';
import {
  CONSOLE_PANEL,
  ConsoleButton,
  ConsolePageHeader,
  IconButton,
  ListToolbar,
  Pagination,
  Panel,
  Pill,
  TableScroller,
  TD,
  TH,
} from '@/components/admin/ui';
import {
  DownloadIcon,
  EllipsisIcon,
  EyeIcon,
  FilterIcon,
  PackagePlusIcon,
} from '@/components/ui/icons';
import { adminCopy, STATEMENT_TOTAL, type StatementStatus } from '@/lib/admin/demo-data';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.settlements.title };
}

const STATEMENT_TONE: Record<StatementStatus, 'warn' | 'ok' | 'danger'> = {
  held: 'warn',
  paid: 'ok',
  clawback: 'danger',
};

/**
 * Publisher settlements -- design source frame `buNhV`.
 *
 * Allocation is linear in shareable calls and is never weighted by Trust Score
 * (publisher-revenue-share.md), so the table shows the call count the money is
 * derived from rather than any score.
 */
export default async function AdminSettlementsPage() {
  await requireAdminCapability('billing');
  const t = await getMessages();
  const s = t.admin.settlements;
  const { settlementStats, statements } = adminCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={s.title} description={s.description} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {settlementStats.map((stat) => (
          <article
            key={stat.label}
            className={`${CONSOLE_PANEL} flex flex-col gap-1.5 rounded-[9px] p-4`}
          >
            <span className="text-[11px] tracking-[-0.023em] text-muted">{stat.label}</span>
            <span className="text-[20px] leading-[1.3] font-semibold tracking-[-0.03em] text-ink">
              {stat.value}
            </span>
            <span className="text-[11px] leading-[1.5] tracking-[-0.023em] text-muted">
              {stat.caption}
            </span>
          </article>
        ))}
      </section>

      <Panel>
        <ListToolbar placeholder={s.searchPlaceholder}>
          <ConsoleButton>
            <FilterIcon size={14} />
            {t.admin.actions.filter}
          </ConsoleButton>
          <ConsoleButton>
            <DownloadIcon size={14} />
            {t.admin.actions.export}
          </ConsoleButton>
          <ConsoleButton variant="primary">
            <PackagePlusIcon size={14} />
            {s.generate}
          </ConsoleButton>
        </ListToolbar>

        <TableScroller>
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr>
                {s.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
                <th scope="col" className={`${TH} w-[86px]`}>
                  <span className="sr-only">{t.admin.actions.more}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {statements.map((statement) => (
                <tr key={statement.number} className="border-t-2 border-line">
                  <td className={TD}>
                    <code className="font-mono text-[11px] tracking-[-0.01em] text-ink">
                      {statement.number}
                    </code>
                  </td>
                  <td className={TD}>{statement.publisher}</td>
                  <td className={TD}>
                    <code className="font-mono text-[11px] tracking-[-0.01em] text-steel">
                      {statement.library}
                    </code>
                  </td>
                  <td className={TD}>{statement.calls}</td>
                  <td className={TD}>{statement.period}</td>
                  <td
                    className={`${TD} font-semibold ${
                      statement.status === 'clawback' ? 'text-err' : 'text-ink'
                    }`}
                  >
                    {statement.amount}
                  </td>
                  <td className={TD}>
                    <Pill tone={STATEMENT_TONE[statement.status]}>{statement.statusLabel}</Pill>
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      <IconButton label={t.admin.actions.view}>
                        <EyeIcon size={14} />
                      </IconButton>
                      <IconButton label={t.admin.actions.more}>
                        <EllipsisIcon size={14} />
                      </IconButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>

        <Pagination
          summary={fill(s.showing, { from: 1, to: statements.length, total: STATEMENT_TOTAL })}
          pages={[1]}
          activePage={1}
          labels={t.admin.actions}
        />
      </Panel>
    </div>
  );
}
