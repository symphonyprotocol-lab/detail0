import type { Metadata } from 'next';
import {
  CONSOLE_PANEL,
  ConsoleButton,
  ConsoleNotice,
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
  LinkIcon,
  ReceiptIcon,
} from '@/components/ui/icons';
import { adminCopy, INVOICE_TOTAL, type InvoiceStatus } from '@/lib/admin/demo-data';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.billing.title };
}

const INVOICE_TONE: Record<InvoiceStatus, 'warn' | 'ok' | 'neutral'> = {
  due: 'warn',
  paid: 'ok',
  refunded: 'neutral',
};

/**
 * Subscription billing -- design source frame `n7LZMz`.
 *
 * A read-only mirror: recall0 never moves money itself, so every human action
 * here has to go through the payment provider (requirement.md 5.3).
 */
export default async function AdminBillingPage() {
  await requireAdminCapability('billing');
  const t = await getMessages();
  const b = t.admin.billing;
  const { billingStats, invoices } = adminCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={b.title} description={b.description} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {billingStats.map((stat) => (
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

      <ConsoleNotice
        icon={<ReceiptIcon size={18} />}
        title={b.readOnlyTitle}
        body={b.readOnlyNote}
      />

      <Panel>
        <ListToolbar placeholder={b.searchPlaceholder}>
          <ConsoleButton>
            <FilterIcon size={14} />
            {t.admin.actions.filter}
          </ConsoleButton>
          <ConsoleButton>
            <DownloadIcon size={14} />
            {t.admin.actions.export}
          </ConsoleButton>
          <ConsoleButton variant="primary">
            <LinkIcon size={14} />
            {b.createLink}
          </ConsoleButton>
        </ListToolbar>

        <TableScroller>
          <table className="w-full min-w-[840px] border-collapse text-left">
            <thead>
              <tr>
                {b.columns.map((column) => (
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
              {invoices.map((invoice) => (
                <tr key={invoice.number} className="border-t-2 border-line">
                  <td className={TD}>
                    <code className="font-mono text-[11px] tracking-[-0.01em] text-ink">
                      {invoice.number}
                    </code>
                  </td>
                  <td className={TD}>{invoice.customer}</td>
                  <td className={TD}>{invoice.plan}</td>
                  <td className={`${TD} font-semibold text-ink`}>{invoice.amount}</td>
                  <td className={TD}>{invoice.date}</td>
                  <td className={TD}>{invoice.method}</td>
                  <td className={TD}>
                    <Pill tone={INVOICE_TONE[invoice.status]}>{invoice.statusLabel}</Pill>
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
          summary={fill(b.showing, {
            from: 1,
            to: invoices.length,
            total: INVOICE_TOTAL.toLocaleString('en-US'),
          })}
          pages={[1, 2, 3]}
          activePage={1}
          labels={t.admin.actions}
        />
      </Panel>
    </div>
  );
}
