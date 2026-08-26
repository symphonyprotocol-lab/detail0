import type { Metadata } from 'next';
import { FilterSelect } from '@/components/admin/list-controls';
import {
  ConsoleButton,
  ConsoleNotice,
  ConsolePageHeader,
  EmptyRow,
  ExportLink,
  ListToolbar,
  Pagination,
  Panel,
  Pill,
  TableScroller,
  TD,
  TH,
} from '@/components/admin/ui';
import { BadgeCheckIcon, ScrollTextIcon } from '@/components/ui/icons';
import { listAuditEntries, type AuditResultFilter } from '@/lib/application/administration';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { oneOf, PAGE_SIZE, pageNumber, pageWindow, searchTerm, utcInstant } from '../list-params';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.audit.title };
}

const RESULTS: AuditResultFilter[] = ['all', 'success', 'failure'];

/** Nothing recorded, e.g. an action with no target or a request with no origin. */
const NONE = '—';

/**
 * Audit log -- design source frame `Uko79`.
 *
 * Reads the real `audit_log`: append only, kept 365 days, and chained so the
 * daily head can be anchored (requirement.md 5.3, architecture.md 14). The
 * anchor card shows that head rather than an anchoring transaction, because
 * anchoring itself is not live yet (architecture.md 21) and a transaction hash
 * that nothing wrote would be the one lie a tamper-evident log cannot afford.
 *
 * The origin column is a digest, not the address the design frame draws: plain
 * IPs must not reach product storage (requirement.md 12), which is why
 * `audit_log` stores `ip_digest` and there is nothing else to show.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, params, t] = await Promise.all([
    requireAdminCapability('audit'),
    searchParams,
    getMessages(),
  ]);
  const a = t.admin.audit;
  const f = t.admin.filters;
  const query = searchTerm(params.q);
  const result = oneOf(params.result, RESULTS, 'all');
  const page = pageNumber(params.page);

  const { rows, total, chainHead } = await listAuditEntries({
    query,
    result,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const view = pageWindow({ page, total, rows: rows.length });

  /*
   * `action` is a machine code, so an action this build has no label for still
   * has to appear -- printing the code beats hiding the row.
   */
  const actionLabels: Record<string, string> = a.actions;

  const link = (target: number) => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (result !== 'all') next.set('result', result);
    if (target > 1) next.set('page', String(target));
    return next.size > 0 ? `/admin/audit?${next.toString()}` : '/admin/audit';
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={a.title} description={a.description} />

      <ConsoleNotice
        icon={<ScrollTextIcon size={18} />}
        title={a.retentionTitle}
        body={a.retentionBody}
        action={
          <ExportLink resource="audit" query={query} status={result} label={a.exportLog} />
        }
      />

      <ConsoleNotice
        icon={<BadgeCheckIcon size={18} />}
        title={a.anchorTitle}
        body={a.anchorBody}
        action={
          <span className="flex flex-col gap-1">
            <span className="text-[11px] tracking-[-0.023em] text-muted">{a.chainHead}</span>
            <code className="rounded-[6px] bg-card px-2 py-1.5 font-mono text-[11px] text-brandink">
              {chainHead ? `${chainHead.slice(0, 8)}…${chainHead.slice(-4)}` : a.chainHeadNone}
            </code>
          </span>
        }
      />

      <Panel>
        {/* GET, so a filtered page of the log is a URL an operator can keep. */}
        <form method="get">
          <ListToolbar placeholder={a.searchPlaceholder} name="q" defaultValue={query}>
            <FilterSelect
              name="result"
              label={a.resultFilter}
              value={result}
              options={[
                { id: 'all', label: f.all },
                { id: 'success', label: f.auditSuccess },
                { id: 'failure', label: f.auditFailure },
              ]}
            />
            <ConsoleButton type="submit">{t.admin.administrators.searchSubmit}</ConsoleButton>
            <ExportLink
              resource="audit"
              query={query}
              status={result}
              label={t.admin.actions.export}
            />
          </ListToolbar>
        </form>

        <TableScroller>
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr>
                {a.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow columns={a.columns.length} message={a.empty} />
              ) : null}
              {rows.map((entry) => (
                <tr key={entry.id} className="border-t-2 border-line">
                  <td className={TD}>
                    <code className="font-mono text-[11px] tracking-[-0.01em] whitespace-nowrap text-steel">
                      {utcInstant(entry.createdAt)}
                    </code>
                  </td>
                  <td className={TD}>{entry.administratorName ?? a.unknownAdmin}</td>
                  <td className={TD}>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-ink">
                        {actionLabels[entry.action] ?? entry.action}
                      </span>
                      {/* requirement.md 5.3 records a reason; it belongs beside the action. */}
                      {entry.reason ? (
                        <span className="text-[11px] text-muted">{entry.reason}</span>
                      ) : null}
                    </span>
                  </td>
                  <td className={TD}>{entry.targetId ?? NONE}</td>
                  <td className={TD}>
                    <code className="font-mono text-[11px] tracking-[-0.01em] text-muted">
                      {entry.originDigest ?? NONE}
                    </code>
                  </td>
                  <td className={TD}>
                    <Pill tone={entry.result === 'success' ? 'ok' : 'danger'}>
                      {entry.result === 'success' ? f.auditSuccess : f.auditFailure}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>

        <Pagination
          summary={fill(a.showing, {
            from: view.from,
            to: view.to,
            total: total.toLocaleString('en-US'),
          })}
          pages={view.pages}
          activePage={page}
          pageCount={view.pageCount}
          href={link}
          labels={t.admin.actions}
        />
      </Panel>
    </div>
  );
}
