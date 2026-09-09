import type { Metadata } from 'next';
import { FilterSelect } from '@/components/admin/list-controls';
import {
  ConsoleButton,
  ConsoleNotice,
  ConsolePageHeader,
  EmptyRow,
  Fact,
  ListToolbar,
  Metric,
  Pagination,
  Panel,
  PanelHead,
  Pill,
  TableScroller,
  TD,
  TH,
} from '@/components/admin/ui';
import { LinkIcon } from '@/components/ui/icons';
import {
  ANCHOR_SLO_HOURS,
  listAnchorBatches,
  type AnchorStatusFilter,
  type AnchorSubjectFilter,
} from '@/lib/application/administration';
import { anchoringSettings } from '@/lib/application/anchors';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { PAGE_SIZE, oneOf, pageNumber, pageWindow, utcStamp } from '../list-params';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.anchors.title };
}

const SUBJECTS: AnchorSubjectFilter[] = ['all', 'version', 'audit_head', 'earning_statement'];
const STATUSES: AnchorStatusFilter[] = [
  'all',
  'pending',
  'submitted',
  'confirmed',
  'failed',
  'superseded',
];

const NONE = '—';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  confirmed: 'ok',
  pending: 'warn',
  submitted: 'warn',
  failed: 'danger',
  superseded: 'neutral',
};

/** A hash as a row can hold it: enough of both ends to compare by eye. */
function short(value: string | null): string {
  if (!value) return NONE;
  return value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`;
}

/**
 * Anchoring operations -- requirement.md 6.4, architecture.md 14.
 *
 * An operations view, not a content view. It answers what is queued, what
 * confirmed, whether the SLO in aptos-anchoring-proposal.md 4.8 is being met,
 * and how the signer is wired; it never answers what a batch anchored. The
 * queries behind it stop at the anchor tables and join no subject table
 * (lib/application/administration/list-anchors.ts), so a private library's
 * contents and a publisher's settlement amount cannot reach this screen even
 * by accident -- an administrator is not on the list of people allowed to see
 * either preimage.
 *
 * Until the off-chain half exists -- leaf construction, the batch workflow, the
 * signer -- the tables stay empty and the screen says so. An operations screen
 * that renders zeros without explaining them reads as a broken screen.
 */
export default async function AdminAnchorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, params, t] = await Promise.all([
    requireAdminCapability('audit'),
    searchParams,
    getMessages(),
  ]);
  const a = t.admin.anchors;
  const subject = oneOf(params.subject, SUBJECTS, 'all');
  const status = oneOf(params.status, STATUSES, 'all');
  const page = pageNumber(params.page);

  const settings = anchoringSettings();
  const { rows, total, stats } = await listAnchorBatches({
    subject,
    status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const view = pageWindow({ page, total, rows: rows.length });
  const number = (value: number) => value.toLocaleString('en-US');

  /*
   * Subject and state arrive from the database as strings. A value this build
   * has no label for still has to render -- printing the raw code beats
   * dropping the row from an operations screen.
   */
  const subjectLabels: Record<string, string> = a.subjects;
  const statusLabels: Record<string, string> = a.statuses;

  const link = (target: number) => {
    const next = new URLSearchParams();
    if (subject !== 'all') next.set('subject', subject);
    if (status !== 'all') next.set('status', status);
    if (target > 1) next.set('page', String(target));
    return next.size > 0 ? `/admin/anchors?${next.toString()}` : '/admin/anchors';
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={a.title} description={a.description} />

      {stats.total === 0 ? (
        <ConsoleNotice icon={<LinkIcon size={18} />} title={a.notLiveTitle} body={a.notLiveBody} />
      ) : null}

      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={a.stats.backlog}
          value={number(stats.openLeaves)}
          note={fill(a.stats.backlogCaption, {
            batches: number((stats.byStatus.pending ?? 0) + (stats.byStatus.submitted ?? 0)),
          })}
        />
        <Metric
          label={a.stats.confirmed}
          value={number(stats.confirmed)}
          note={fill(a.stats.confirmedCaption, { total: number(stats.total) })}
        />
        <Metric
          label={a.stats.slo}
          /*
           * No confirmed batch means no rate, not a rate of zero: printing 0%
           * against an empty table would read as a failing SLO rather than an
           * unmeasured one.
           */
          value={
            stats.confirmed === 0
              ? NONE
              : `${Math.round((stats.withinSlo / stats.confirmed) * 100)}%`
          }
          note={fill(a.stats.sloCaption, {
            hours: String(ANCHOR_SLO_HOURS),
            within: number(stats.withinSlo),
            confirmed: number(stats.confirmed),
          })}
        />
        <Metric
          label={a.stats.lastConfirmed}
          value={stats.lastConfirmedAt ? utcStamp(stats.lastConfirmedAt) : NONE}
          note={a.stats.lastConfirmedCaption}
        />
      </section>

      <Panel>
        <PanelHead title={a.config.title} description={a.config.description} />
        <dl className="grid gap-x-8 px-[15px] sm:grid-cols-2">
          <Fact label={a.config.mode} value={a.config.modes[settings.mode]} />
          <Fact label={a.config.network} value={settings.network ?? NONE} />
          <Fact
            label={a.config.objectAddress}
            value={
              settings.objectAddress ? (
                <code className="font-mono text-[11px]">{settings.objectAddress}</code>
              ) : (
                NONE
              )
            }
          />
          <Fact
            label={a.config.signerAddress}
            value={
              settings.signerAddress ? (
                <code className="font-mono text-[11px]">{settings.signerAddress}</code>
              ) : (
                NONE
              )
            }
          />
          {/* Whether a key is there, never the key: proposal 4.6. */}
          <Fact
            label={a.config.signerKey}
            value={
              <Pill tone={settings.signerConfigured ? 'ok' : 'neutral'}>
                {settings.signerConfigured ? a.config.signerKeyPresent : a.config.signerKeyMissing}
              </Pill>
            }
          />
        </dl>
      </Panel>

      <Panel>
        <PanelHead title={a.table.title} description={a.table.description} />
        {/* GET, so a filtered view is a URL an operator can keep or hand over. */}
        <form method="get">
          <ListToolbar placeholder={a.searchPlaceholder}>
            <FilterSelect
              name="subject"
              label={a.filters.subject}
              value={subject}
              options={SUBJECTS.map((id) => ({ id, label: a.subjects[id] }))}
            />
            <FilterSelect
              name="status"
              label={a.filters.status}
              value={status}
              options={STATUSES.map((id) => ({ id, label: a.statuses[id] }))}
            />
            <ConsoleButton type="submit">{t.admin.administrators.searchSubmit}</ConsoleButton>
          </ListToolbar>
        </form>

        <TableScroller>
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr>
                {a.table.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow
                  columns={a.table.columns.length}
                  message={a.table.empty}
                  note={a.table.emptyNote}
                />
              ) : null}
              {rows.map((batch) => (
                <tr key={batch.id} className="border-t-2 border-line">
                  <td className={TD}>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-ink">{subjectLabels[batch.subjectType] ?? batch.subjectType}</span>
                      <span className="text-[11px] text-muted">
                        {fill(a.leafSchema, { version: String(batch.leafSchemaVersion) })}
                      </span>
                    </span>
                  </td>
                  <td className={TD}>
                    <Pill tone={STATUS_TONE[batch.status] ?? 'neutral'}>
                      {statusLabels[batch.status] ?? batch.status}
                    </Pill>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <span className="flex flex-col gap-0.5">
                      <span>{utcStamp(batch.windowEnd)}</span>
                      <span className="text-[11px] text-muted">{utcStamp(batch.windowStart)}</span>
                    </span>
                  </td>
                  <td className={TD}>{number(batch.leafCount)}</td>
                  <td className={TD}>
                    <code className="font-mono text-[11px] text-steel">
                      {short(batch.merkleRoot)}
                    </code>
                  </td>
                  <td className={TD}>{batch.network}</td>
                  <td className={TD}>
                    <code className="font-mono text-[11px] text-steel">{short(batch.txHash)}</code>
                  </td>
                  <td className={TD}>{batch.attempts}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {batch.confirmedAt ? utcStamp(batch.confirmedAt) : NONE}
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
