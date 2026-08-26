import type { Metadata } from 'next';
import {
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
  BadgeCheckIcon,
  DownloadIcon,
  EyeIcon,
  FilterIcon,
  ScrollTextIcon,
} from '@/components/ui/icons';
import { adminCopy, AUDIT_TOTAL } from '@/lib/admin/demo-data';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.audit.title };
}

/**
 * Audit log -- design source frame `Uko79`.
 *
 * Append only, kept 365 days, and chained so the daily head can be anchored
 * (requirement.md 5.3, architecture.md 14). The origin column shows a digest
 * rather than an address: plain IPs must not reach product storage
 * (requirement.md 12), which is why `audit_log` stores `ip_digest`.
 */
export default async function AdminAuditPage() {
  await requireAdminCapability('audit');
  const t = await getMessages();
  const a = t.admin.audit;
  const { auditEntries, anchorDigest } = adminCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={a.title} description={a.description} />

      <ConsoleNotice
        icon={<ScrollTextIcon size={18} />}
        title={a.retentionTitle}
        body={a.retentionBody}
        action={
          <ConsoleButton variant="primary">
            <DownloadIcon size={14} />
            {a.exportLog}
          </ConsoleButton>
        }
      />

      <ConsoleNotice
        icon={<BadgeCheckIcon size={18} />}
        title={a.anchorTitle}
        body={a.anchorBody}
        action={
          <code className="rounded-[6px] bg-card px-2 py-1.5 font-mono text-[11px] text-brandink">
            {anchorDigest}
          </code>
        }
      />

      <Panel>
        <ListToolbar placeholder={a.searchPlaceholder}>
          <ConsoleButton>
            <FilterIcon size={14} />
            {t.admin.actions.filter}
          </ConsoleButton>
          <ConsoleButton>
            <DownloadIcon size={14} />
            {t.admin.actions.export}
          </ConsoleButton>
        </ListToolbar>

        <TableScroller>
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr>
                {a.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
                <th scope="col" className={`${TH} w-[56px]`}>
                  <span className="sr-only">{t.admin.actions.view}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr key={entry.time} className="border-t-2 border-line">
                  <td className={TD}>
                    <code className="font-mono text-[11px] tracking-[-0.01em] whitespace-nowrap text-steel">
                      {entry.time}
                    </code>
                  </td>
                  <td className={TD}>{entry.admin}</td>
                  <td className={`${TD} font-medium text-ink`}>{entry.action}</td>
                  <td className={TD}>{entry.target}</td>
                  <td className={TD}>
                    <code className="font-mono text-[11px] tracking-[-0.01em] text-muted">
                      {entry.originDigest}
                    </code>
                  </td>
                  <td className={TD}>
                    <Pill tone={entry.result === 'success' ? 'ok' : 'danger'}>
                      {entry.resultLabel}
                    </Pill>
                  </td>
                  <td className={TD}>
                    <IconButton label={t.admin.actions.view}>
                      <EyeIcon size={14} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>

        <Pagination
          summary={fill(a.showing, {
            from: 1,
            to: auditEntries.length,
            total: AUDIT_TOTAL.toLocaleString('en-US'),
          })}
          pages={[1, 2, 3]}
          activePage={1}
          labels={t.admin.actions}
        />
      </Panel>
    </div>
  );
}
