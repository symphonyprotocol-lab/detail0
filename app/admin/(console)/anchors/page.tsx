import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { AnchorReleaseControl } from '@/components/admin/anchor-controls';
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
import { anchorAlerts, anchorHealth, anchoringSettings } from '@/lib/application/anchors';
import { releaseAnchorBatchAction } from './actions';
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

/**
 * The chain answers are cached briefly. They cost two network round trips, and
 * an operations screen that is refreshed while an incident is being worked
 * would otherwise make a request to the node and the indexer per render -- from
 * the very credentials whose rate limits matter most at that moment.
 */
const HEALTH_SECONDS = 60;

const cachedHealth = unstable_cache(() => anchorHealth(), ['admin-anchor-health'], {
  revalidate: HEALTH_SECONDS,
});

const cachedAlerts = unstable_cache(() => anchorAlerts(), ['admin-anchor-alerts'], {
  revalidate: HEALTH_SECONDS,
});

/** Octas to APT, at the precision an operator reads a balance in. */
function apt(octas: number): string {
  return (octas / 100_000_000).toFixed(4);
}

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
  const [health, alerts] = await Promise.all([cachedHealth(), cachedAlerts()]);
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
  /* An alert this build has no wording for still shows -- as its code. */
  const alertMessages: Record<string, string> = a.alerts.codes;
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

      {/*
        * The evaluated conditions, ahead of the numbers they were read from.
        * An operator opening this screen during an incident is asking what is
        * wrong, not what the balance is -- and proposal 4.9's alerts are the
        * answer, in the same words the log lines carry.
        */}
      <Panel>
        <PanelHead
          title={a.alerts.title}
          description={fill(a.alerts.checked, {
            at: utcStamp(new Date(health.monitor.checkedAt)),
          })}
        />
        <div className="flex flex-col gap-2 px-[15px] py-3.5">
          {alerts.length === 0 ? (
            <p className="text-[12px] tracking-[-0.023em] text-muted">{a.alerts.none}</p>
          ) : null}
          {alerts.map((alert) => (
            <div key={alert.code} className="flex items-start gap-2.5">
              <Pill tone={alert.severity === 'critical' ? 'danger' : 'warn'}>
                {a.alerts.severities[alert.severity]}
              </Pill>
              <p className="text-[12px] leading-[1.6] tracking-[-0.023em] text-steel">
                {fill(alertMessages[alert.code] ?? alert.code, alert.detail)}
              </p>
            </div>
          ))}
        </div>
      </Panel>

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
        <PanelHead title={a.health.title} description={a.health.description} />
        <dl className="grid gap-x-8 px-[15px] sm:grid-cols-2">
          <Fact
            label={a.health.balance}
            value={
              <span className="flex flex-wrap items-center gap-2">
                {health.balanceOctas === null
                  ? a.health.balanceUnknown
                  : `${apt(health.balanceOctas)} APT`}
                {health.balanceLow ? <Pill tone="danger">{a.health.balanceLow}</Pill> : null}
                <span className="text-faint">
                  {fill(a.health.balanceFloor, { min: apt(health.minBalanceOctas) })}
                </span>
              </span>
            }
          />
          {/*
            * Numbers, not verdicts. An operator who knows how many upgrades
            * were announced, and how much this platform sent, reads these at a
            * glance; encoding either expectation in configuration would only
            * give it something new to disagree with.
            */}
          <Fact label={a.health.publishes} value={number(health.monitor.publishes)} />
          <Fact
            label={a.health.signerActivity}
            value={
              <span className="flex flex-wrap items-center gap-2">
                {number(health.monitor.recentSignerTransactions)}
                <span className="text-faint">
                  {fill(a.health.signerKnown, {
                    known: number(health.monitor.knownBatchTransactions),
                  })}
                </span>
              </span>
            }
          />
          {/* The heartbeat proposal 4.9 asks for: silence has to be datable. */}
          <Fact
            label={a.health.heartbeat}
            value={utcStamp(new Date(health.monitor.checkedAt))}
          />
        </dl>
      </Panel>

      <Panel>
        <PanelHead title={a.config.title} description={a.config.description} />
        <dl className="grid gap-x-8 px-[15px] sm:grid-cols-2">
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
                  <td className={TD}>
                    {/* Only a batch that never landed: proposal 4.5.1's re-anchor
                        of a confirmed one is a schema bump, not a button. */}
                    {batch.status === 'failed' ? (
                      <AnchorReleaseControl action={releaseAnchorBatchAction} batchId={batch.id} />
                    ) : null}
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
