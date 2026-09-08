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
import { BadgeCheckIcon, ChevronDownIcon, ScrollTextIcon } from '@/components/ui/icons';
import { listAuditEntries, type AuditResultFilter } from '@/lib/application/administration';
import { diffAuditValues, type AuditValueChange } from '@/lib/domain/admin';
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

/** A leaf as the diff prints it: JSON, so a string and a number stay apart. */
function leaf(value: unknown): string {
  if (value === undefined) return NONE;
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

/**
 * The before/after snapshots an entry carries, folded shut by default: the
 * table stays one line per action, and the values open in place -- a native
 * `<details>`, so the log needs no client code to be read.
 */
function ValueDiff({
  changes,
  summary,
  none,
}: {
  changes: AuditValueChange[];
  summary: string;
  none: string;
}) {
  return (
    <details className="group mt-1 text-[11px] tracking-[-0.023em]">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon size={12} className="transition-transform group-open:rotate-180" />
        {summary}
      </summary>
      {changes.length === 0 ? (
        <p className="mt-1.5 text-muted">{none}</p>
      ) : (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[6px] bg-subtle px-2.5 py-2">
          {changes.map((change) => (
            <div key={change.path} className="contents">
              <dt className="font-mono text-steel">{change.path}</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono">
                <span className={change.before === undefined ? 'text-faint' : 'text-err line-through'}>
                  {leaf(change.before)}
                </span>
                <span aria-hidden className="text-faint">
                  →
                </span>
                <span className={change.after === undefined ? 'text-faint' : 'text-pubink'}>
                  {leaf(change.after)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  );
}

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
              {rows.map((entry) => {
                const changes =
                  entry.beforeValue !== null || entry.afterValue !== null
                    ? diffAuditValues(entry.beforeValue, entry.afterValue)
                    : null;
                return (
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
                        {changes ? (
                          <ValueDiff
                            changes={changes}
                            summary={fill(a.values.summary, { count: changes.length })}
                            none={a.values.none}
                          />
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
                );
              })}
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
