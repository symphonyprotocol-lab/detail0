import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import {
  ConsoleButton,
  ConsoleNotice,
  ConsolePageHeader,
  EmptyRow,
  Fact,
  Metric,
  Panel,
  PanelHead,
  Pill,
  TableScroller,
  TD,
  TH,
} from '@/components/admin/ui';
import { UserReviewControls } from '@/components/admin/user-library-controls';
import { ChevronLeftIcon, LockIcon } from '@/components/ui/icons';
import { getUserLibrary } from '@/lib/application/administration';
import { currentAdminSession, requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { bytes, initialsOf, utcStamp } from '../../list-params';
import { reviewUserLibraryAction } from '../actions';

const loadLibrary = cache(getUserLibrary);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ libraryId: string }>;
}): Promise<Metadata> {
  const [{ libraryId }, t, session] = await Promise.all([params, getMessages(), currentAdminSession()]);
  const d = t.admin.libraries.detail;
  /* Entitlement first: metadata runs alongside the page, not after its guard. */
  if (!session?.capabilities.includes('libraries')) return { title: d.title };
  const record = await loadLibrary(libraryId);
  return { title: record ? fill(d.metaTitle, { title: record.title }) : d.title };
}

const LIFECYCLE_TONE: Record<string, 'warn' | 'ok' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  submitted: 'warn',
  reviewing: 'warn',
  changes_requested: 'danger',
  published: 'ok',
  suspended: 'danger',
  archived: 'neutral',
};

/**
 * One user library, for the reviewer: what it is, where it comes from, what
 * has been built, and what has already been decided about it. requirement.md
 * 7.4 lists what a review checks; architecture.md 17 keeps a private
 * library's content out of the reviewer's sight, so this page shows sources
 * and counts, never chunks.
 */
export default async function AdminUserLibraryPage({
  params,
}: {
  params: Promise<{ libraryId: string }>;
}) {
  const [, { libraryId }, t] = await Promise.all([
    requireAdminCapability('libraries'),
    params,
    getMessages(),
  ]);
  const record = await loadLibrary(libraryId);
  if (!record) notFound();

  const l = t.admin.libraries;
  const d = l.detail;
  const p = t.admin.platformLibraries;
  const number = (value: number) => value.toLocaleString('en-US');
  const lifecycle = (status: string) => label(l.lifecycle, status);
  const visibility =
    record.visibility === 'public' ? t.adminDemo.scope.public : t.adminDemo.scope.private;

  const target = {
    id: record.id,
    publicId: record.publicId,
    title: record.title,
    initial: initialsOf(record.title),
    sourceLabel: record.sources[0] ? label(p.sourceTypes, record.sources[0].type) : d.basics.none,
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader
        eyebrow={d.eyebrow}
        title={record.title}
        description={fill(d.subtitle, {
          publicId: record.publicId,
          owner: record.ownerName ?? d.basics.none,
          visibility,
        })}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ConsoleButton href="/admin/libraries">
              <ChevronLeftIcon size={14} />
              {d.back}
            </ConsoleButton>
            <UserReviewControls
              action={reviewUserLibraryAction}
              target={target}
              current={record.lifecycleStatus}
              visibility={record.visibility}
              canApprove={record.hasReadyVersion}
              variant="button"
            />
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={d.metrics.status}
          value={lifecycle(record.lifecycleStatus)}
          note={
            record.currentVersionLabel
              ? fill(d.metrics.statusNote, { label: record.currentVersionLabel })
              : d.metrics.statusNoteNone
          }
        />
        <Metric
          label={d.metrics.documents}
          value={number(record.documents)}
          note={fill(d.metrics.documentsNote, { chunks: number(record.chunks) })}
        />
        <Metric
          label={d.metrics.storage}
          value={bytes(record.storageBytes)}
          note={fill(d.metrics.created, { created: utcStamp(record.createdAt) })}
        />
        <Metric
          label={d.metrics.synced}
          value={record.lastSyncedAt ? utcStamp(record.lastSyncedAt) : d.metrics.syncedNever}
          note={label(l.lifecycleNote, record.lifecycleStatus)}
        />
      </section>

      {record.visibility === 'private' ? (
        <ConsoleNotice icon={<LockIcon size={18} />} title={visibility} body={l.privateNote} />
      ) : null}

      <Panel className="overflow-hidden">
        <PanelHead title={d.basics.title} description={d.basics.description} />
        <dl className="grid grid-cols-1 gap-x-6 px-[19px] py-1.5 sm:grid-cols-2">
          <Fact label={d.basics.publicId} value={record.publicId} />
          <Fact label={d.basics.owner} value={record.ownerName ?? d.basics.none} />
          <Fact label={d.basics.visibility} value={visibility} />
          <Fact label={d.basics.language} value={record.language ?? d.basics.none} />
          <Fact label={d.basics.indexStatus} value={label(p.indexStatus, record.indexStatus)} />
          <Fact label={d.basics.created} value={`${utcStamp(record.createdAt)} UTC`} />
          <Fact label={d.basics.summary} value={record.description ?? d.basics.none} />
        </dl>
      </Panel>

      <Panel>
        <PanelHead title={d.sources.title} description={d.sources.description} />
        <TableScroller>
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr>
                {d.sources.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.sources.length === 0 ? (
                <EmptyRow columns={d.sources.columns.length} message={d.sources.empty} />
              ) : null}
              {record.sources.map((source) => (
                <tr key={source.id} className="border-t-2 border-line">
                  <td className={TD}>
                    <Pill tone="info">{label(p.sourceTypes, source.type)}</Pill>
                  </td>
                  <td className={`${TD} break-all`}>{source.location}</td>
                  <td className={TD}>{source.fileCount === null ? d.basics.none : number(source.fileCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </Panel>

      <Panel>
        <PanelHead title={d.reviews.title} description={d.reviews.description} />
        <TableScroller>
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr>
                {d.reviews.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.reviews.length === 0 ? (
                <EmptyRow columns={d.reviews.columns.length} message={d.reviews.empty} />
              ) : null}
              {record.reviews.map((review) => (
                <tr key={review.id} className="border-t-2 border-line">
                  <td className={`${TD} whitespace-nowrap`}>{utcStamp(review.decidedAt ?? review.createdAt)}</td>
                  <td className={TD}>
                    <Pill
                      tone={
                        review.outcome === 'approve' ? 'ok' : review.outcome === 'reject' ? 'danger' : 'warn'
                      }
                    >
                      {label(d.reviews.outcomes, review.outcome ?? '')}
                    </Pill>
                  </td>
                  <td className={TD}>{review.reviewerEmail ?? d.basics.none}</td>
                  <td className={TD}>{review.feedback.join(' ') || d.basics.none}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </Panel>

      <Panel>
        <PanelHead title={d.versions.title} />
        <TableScroller>
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr>
                {d.versions.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.versions.length === 0 ? (
                <EmptyRow columns={d.versions.columns.length} message={d.versions.empty} />
              ) : null}
              {record.versions.map((version) => (
                <tr key={version.id} className="border-t-2 border-line">
                  <td className={TD}>
                    <span className="flex items-center gap-2">
                      {version.label}
                      {version.isCurrent ? <Pill tone="brand">{d.versions.current}</Pill> : null}
                    </span>
                  </td>
                  <td className={TD}>
                    <Pill tone={version.indexStatus === 'ready' ? 'ok' : 'neutral'}>
                      {label(p.indexStatus, version.indexStatus)}
                    </Pill>
                  </td>
                  <td className={TD}>
                    {number(version.documents)} / {number(version.totalChunks)}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {version.publishedAt ? utcStamp(version.publishedAt) : d.basics.none}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </Panel>

      <Panel>
        <PanelHead title={d.queue.title} />
        <TableScroller>
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr>
                {d.queue.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.operations.length === 0 ? (
                <EmptyRow columns={d.queue.columns.length} message={d.queue.empty} />
              ) : null}
              {record.operations.map((operation) => (
                <tr key={operation.id} className="border-t-2 border-line">
                  <td className={TD}>{operation.operationType}</td>
                  <td className={TD}>
                    <Pill
                      tone={
                        operation.status === 'succeeded'
                          ? 'ok'
                          : operation.status === 'failed'
                            ? 'danger'
                            : LIFECYCLE_TONE[operation.status] ?? 'neutral'
                      }
                    >
                      {operation.status}
                    </Pill>
                  </td>
                  <td className={TD}>{operation.attempts}</td>
                  <td className={TD}>{operation.error ?? d.basics.none}</td>
                  <td className={`${TD} whitespace-nowrap`}>{utcStamp(operation.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </Panel>
    </div>
  );
}

function label(dictionary: Record<string, string>, value: string): string {
  return dictionary[value] ?? value;
}
