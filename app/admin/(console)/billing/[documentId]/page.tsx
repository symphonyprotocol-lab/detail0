import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { CopyValue } from '@/components/admin/copy-value';
import {
  ConsoleButton,
  ConsoleNotice,
  ConsolePageHeader,
  Fact,
  Metric,
  Panel,
  PanelHead,
  Pill,
} from '@/components/admin/ui';
import { ChevronLeftIcon, ReceiptIcon } from '@/components/ui/icons';
import { isCollected, netMinor, percentFromBps, refundRateBps } from '@/lib/domain/billing';
import { getBillingDocument } from '@/lib/application/billing';
import { currentAdminSession, requireAdminCapability } from '@/lib/http/admin';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { money, utcDate, utcStamp } from '../../list-params';

/**
 * The metadata and the page both need the document, and Next renders them as
 * two calls into this module. `cache` makes that one read per request.
 */
const loadDocument = cache(getBillingDocument);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documentId: string }>;
}): Promise<Metadata> {
  const [{ documentId }, t, session] = await Promise.all([
    params,
    getMessages(),
    currentAdminSession(),
  ]);

  /*
   * Entitlement first, even here. Metadata runs alongside the page rather than
   * after its guard, so without this an unentitled request would still read a
   * billing record out of the database.
   */
  if (!session?.capabilities.includes('billing')) return { title: t.admin.billingDetail.title };

  const record = await loadDocument(documentId);
  return {
    title: record
      ? fill(t.admin.billingDetail.metaTitle, { number: record.number })
      : t.admin.billingDetail.title,
  };
}

/**
 * One billing document in full -- design source frame `订阅账单详情`.
 *
 * Read-only, like the list it came from: requirement.md 5.3 puts refunds,
 * retries and reissues at the Payment Provider, so the only action on this page
 * is copying the provider's own id to go and act there.
 *
 * The panels are ordered by what a billing question needs answering in: what
 * was sold, who it was sold to, and where this record came from. The last one
 * matters more than it looks -- when the console and the provider disagree, the
 * first question is when we last heard from the provider, and this is the only
 * screen that can answer it.
 */
export default async function AdminBillingDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const [, { documentId }, t] = await Promise.all([
    requireAdminCapability('billing'),
    params,
    getMessages(),
  ]);

  const record = await loadDocument(documentId);
  if (!record) notFound();

  const b = t.admin.billing;
  const d = t.admin.billingDetail;
  const cash = (minor: number) => money(minor, record.currency);
  const stamp = (value: Date | null) => (value ? `${utcStamp(value)} UTC` : d.metrics.paidAtNone);

  const net = netMinor(record);
  const collected = isCollected(record.status);
  const refundShare = refundRateBps({
    collectedMinor: record.amountMinor,
    refundedMinor: record.refundedMinor,
  });

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader
        eyebrow={d.eyebrow}
        title={record.number}
        description={fill(d.subtitle, {
          customer: record.workspaceName,
          kind: b.kinds[record.kind],
          issued: utcDate(record.issuedAt),
        })}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ConsoleButton href="/admin/billing">
              <ChevronLeftIcon size={14} />
              {d.back}
            </ConsoleButton>
            <CopyValue value={record.externalId} label={d.copyId} copiedLabel={d.copied} />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={d.metrics.amount}
          value={cash(record.amountMinor)}
          note={fill(d.metrics.amountNote, { currency: record.currency })}
        />
        <Metric
          label={d.metrics.refunded}
          value={cash(record.refundedMinor)}
          note={
            record.refundedMinor === 0
              ? d.metrics.refundedNone
              : fill(d.metrics.refundedNote, { percent: percentFromBps(refundShare) })
          }
        />
        <Metric
          label={d.metrics.net}
          value={cash(net)}
          /*
           * An uncollected document has a net on paper and none in the bank.
           * Saying which month it counts towards would be the screen agreeing
           * with a revenue figure that never included it.
           */
          note={
            collected && record.paidAt
              ? fill(d.metrics.netNote, { period: record.paidAt.toISOString().slice(0, 7) })
              : d.metrics.netPending
          }
        />
        <Metric
          label={d.metrics.paidAt}
          value={record.paidAt ? utcDate(record.paidAt) : '—'}
          note={fill(d.metrics.methodNote, { method: methodLabel(record.method, b) })}
        />
      </div>

      <ConsoleNotice icon={<ReceiptIcon size={18} />} title={b.readOnlyTitle} body={b.readOnlyNote} />

      <Panel>
        <PanelHead
          title={d.order.title}
          description={d.order.description}
          action={<Pill tone={collected ? 'ok' : 'warn'}>{b.statuses[record.status]}</Pill>}
        />
        <dl className="grid gap-x-6 px-[19px] py-2 sm:grid-cols-2">
          <Fact label={d.order.kind} value={b.kinds[record.kind]} />
          <Fact
            label={d.order.planVersion}
            value={
              record.planVersionId
                ? `${planLabel(record.planId, t.admin.plans.names)} · ${shortId(record.planVersionId)}${
                    record.planPriceMinor === null
                      ? ''
                      : ` · ${money(record.planPriceMinor, record.currency)}`
                  }`
                : d.order.noPlanVersion
            }
          />
          <Fact
            label={d.order.period}
            value={
              record.periodStart && record.periodEnd
                ? `${utcDate(record.periodStart)} — ${utcDate(record.periodEnd)}`
                : d.order.noPeriod
            }
          />
          <Fact label={d.order.issuedAt} value={`${utcStamp(record.issuedAt)} UTC`} />
          <Fact label={d.order.paidAt} value={stamp(record.paidAt)} />
          <Fact label={d.order.method} value={methodLabel(record.method, b)} />
          {/*
            * Only a pack has a balance to show, and showing it is the point:
            * requirement.md 4.3 makes that balance non-expiring and carried
            * across periods, so "what did this order actually deliver" is a
            * question about calls rather than about a period.
            */}
          {record.kind === 'pack' ? (
            <Fact
              label={d.order.packCalls}
              value={
                record.addonCallsGranted === null
                  ? d.order.noGrant
                  : fill(d.order.packCallsValue, {
                      granted: record.addonCallsGranted.toLocaleString('en-US'),
                      consumed: (record.addonCallsConsumed ?? 0).toLocaleString('en-US'),
                    })
              }
            />
          ) : null}
        </dl>
        {record.kind === 'pack' ? (
          <p className="border-t-2 border-line px-[19px] py-3 text-[11px] leading-[1.6] tracking-[-0.023em] text-muted">
            {d.order.packNote}
          </p>
        ) : null}
      </Panel>

      <Panel>
        <PanelHead title={d.customer.title} description={d.customer.description} />
        <dl className="grid gap-x-6 px-[19px] py-2 sm:grid-cols-2">
          <Fact label={d.customer.workspace} value={record.workspaceName} />
          <Fact label={d.customer.owner} value={record.customerEmail ?? d.customer.noOwner} />
          <Fact
            label={d.customer.subscriptionStatus}
            value={record.subscriptionStatus ?? d.customer.noSubscription}
          />
          <Fact
            label={d.customer.subscriptionId}
            value={record.subscriptionId ?? d.customer.noSubscription}
          />
        </dl>
      </Panel>

      <Panel>
        <PanelHead title={d.sync.title} description={d.sync.description} />
        <dl className="grid gap-x-6 px-[19px] py-2 sm:grid-cols-2">
          <Fact label={d.sync.provider} value={record.provider} />
          <Fact label={d.sync.externalId} value={record.externalId} />
          <Fact label={d.sync.number} value={record.number} />
          <Fact
            label={d.sync.lastEvent}
            value={record.lastEventExternalId ?? d.sync.lastEventNone}
          />
          <Fact label={d.sync.observedAt} value={`${utcStamp(record.observedAt)} UTC`} />
        </dl>
        <p className="border-t-2 border-line px-[19px] py-3 text-[11px] leading-[1.6] tracking-[-0.023em] text-muted">
          {d.sync.note}
        </p>
      </Panel>
    </div>
  );
}

/** The tier's own name when the order is linked to a version, or its raw id. */
function planLabel(planId: string | null, names: Dictionary['admin']['plans']['names']): string {
  const known: Record<string, string> = names;
  return (planId ? (known[planId] ?? planId) : null) ?? '—';
}

/** A version id short enough to sit in a sentence; the full UUID is a join key. */
function shortId(id: string): string {
  return `#${id.replace(/-/g, '').slice(0, 8)}`;
}

/** A method type the dictionary knows, or the provider's own code. */
function methodLabel(method: string | null, b: Dictionary['admin']['billing']): string {
  if (!method) return b.methodUnknown;
  const known: Record<string, string> = b.methods;
  return known[method] ?? method;
}
