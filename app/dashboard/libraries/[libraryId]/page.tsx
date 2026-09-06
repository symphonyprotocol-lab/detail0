import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LiveRefresh } from '@/components/dashboard/live-refresh';
import { RebuildLibraryButton } from '@/components/dashboard/library-rebuild';
import { Badge, IconTile, PANEL, StatusLabel, type StatusTone } from '@/components/dashboard/ui';
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  LockIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from '@/components/ui/icons';
import {
  canManageLibraries,
  documentsPage,
  documentsPageSize,
  DOCUMENTS_PAGE_SIZES,
  listVersionDocuments,
  workspaceLibraryDetail,
} from '@/lib/application/libraries';
import { requireSession } from '@/lib/http/session';
import { fill } from '@/lib/i18n/format';
import { quoteBuild } from '@/lib/application/plans';
import { requiresDomainVerification } from '@/lib/domain/domain-verification';
import { isConnectedSourceType } from '@/lib/domain/library';
import { getMessages, translations } from '@/lib/i18n/server';
import { rebuildLibraryAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.libraryDetail.metaTitle };
}

const PAGER =
  'inline-flex h-[29px] items-center rounded-[6px] border-2 border-line bg-card px-2.5 text-[11px] font-medium text-ink hover:bg-subtle';

function label(dictionary: Record<string, string>, value: string | null): string {
  return (value && dictionary[value]) || value || '—';
}

/**
 * One library, for its owner: whether it can be queried right now, which
 * version is serving, what is queued or failed, and what the reviewer said.
 * The readiness banner is the whole point of the page -- the list can only
 * say "in progress", and this says why and what to do next.
 */
export default async function DashboardLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ libraryId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ libraryId }, query] = await Promise.all([params, searchParams]);
  const [session, { locale, t }] = await Promise.all([
    requireSession(`/dashboard/libraries/${libraryId}`),
    translations(),
  ]);
  const library = await workspaceLibraryDetail({ workspaceId: session.workspace.id, libraryId });
  if (!library) notFound();
  /* library-build-billing.md 4.1: what a rebuild may cost, beside the button. */
  const quote = await quoteBuild({
    workspaceId: session.workspace.id,
    fetchesPages:
      library.source !== null &&
      isConnectedSourceType(library.source.type) &&
      requiresDomainVerification(library.source.type),
  });
  const currentVersionId = library.versions.find((version) => version.isCurrent)?.id ?? null;
  const docsPage = documentsPage(query.docs);
  const docsSize = documentsPageSize(query.size);
  const documents = currentVersionId
    ? await listVersionDocuments({
        libraryId: library.id,
        versionId: currentVersionId,
        limit: docsSize,
        offset: (docsPage - 1) * docsSize,
      })
    : { documents: [], total: 0 };
  const docsPages = Math.max(1, Math.ceil(documents.total / docsSize));
  const docsHref = (page: number, size: number = docsSize) =>
    `/dashboard/libraries/${library.id}?docs=${page}&size=${size}#documents`;

  const d = t.dashboard.libraryDetail;
  const l = t.dashboard.libraries;
  const number = new Intl.NumberFormat(locale);
  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const when = (value: string | null) => (value ? stamp.format(new Date(value)) : d.stats.never);
  const canEdit = canManageLibraries(session.workspace.role);
  const latestNote = library.reviews.find((review) => review.feedback[0])?.feedback[0] ?? d.basics.none;
  const lastFailure = library.operations.find((operation) => operation.status === 'failed');
  const routable = library.visibility === 'public' && library.queryable;

  /* The banner: one sentence about where the library is, in priority order. */
  const banner = library.queryable
    ? { tone: 'live' as StatusTone, icon: <BadgeCheckIcon size={18} />, title: d.ready.title, body: fill(d.ready.body, { label: library.currentVersion?.label ?? '' }) }
    : library.building
      ? { tone: 'pending' as StatusTone, icon: <RefreshIcon size={18} />, title: d.ready.buildingTitle, body: d.ready.buildingBody }
      : library.lifecycleStatus === 'changes_requested'
        ? { tone: 'blocked' as StatusTone, icon: <ShieldCheckIcon size={18} />, title: d.ready.changesTitle, body: fill(d.ready.changesBody, { note: latestNote }) }
        : library.lifecycleStatus === 'suspended'
          ? { tone: 'blocked' as StatusTone, icon: <LockIcon size={18} />, title: d.ready.suspendedTitle, body: fill(d.ready.suspendedBody, { note: latestNote }) }
          : library.indexStatus === 'failed' && lastFailure
            ? { tone: 'blocked' as StatusTone, icon: <ClockIcon size={18} />, title: d.ready.failedTitle, body: fill(d.ready.failedBody, { error: label(t.admin.ingestionErrors, lastFailure.error) }) }
            : library.lifecycleStatus === 'submitted' || library.lifecycleStatus === 'reviewing'
              ? { tone: 'pending' as StatusTone, icon: <ShieldCheckIcon size={18} />, title: d.ready.reviewTitle, body: d.ready.reviewBody }
              : { tone: 'exempt' as StatusTone, icon: <ClockIcon size={18} />, title: d.ready.idleTitle, body: d.ready.idleBody };

  const statusLabels: Record<StatusTone, string> = {
    live: l.statuses.live,
    pending: l.statuses.pending,
    blocked: l.statuses.blocked,
    exempt: l.statuses.exempt,
  };

  return (
    <div className="flex flex-col gap-4">
      <LiveRefresh active={library.building} />
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 flex-col gap-[5px]">
          <Link
            href="/dashboard/libraries"
            className="text-[12px] tracking-[-0.023em] text-brandink transition-colors hover:text-brand"
          >
            {d.back}
          </Link>
          <h1 className="mt-1.5 truncate text-[25px] leading-[1.5] font-[650] tracking-[-0.045em] text-ink">
            {library.title}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-[13px] leading-[1.5] tracking-[-0.023em] text-muted">
            <span>{library.publicId}</span>
            <Badge tone={library.visibility === 'public' ? 'public' : 'private'}>
              {library.visibility === 'public' ? l.scopePublic : l.scopePrivate}
            </Badge>
            <Badge tone="neutral">{label(d.lifecycle, library.lifecycleStatus)}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {routable ? (
            <Link
              href={`/libraries${library.publicId}`}
              className="inline-flex h-[35px] items-center gap-1.5 rounded-[7px] border-2 border-line bg-card px-3 text-[12px] font-medium text-ink hover:bg-subtle"
            >
              {d.actions.publicPage}
              <ArrowRightIcon size={14} />
            </Link>
          ) : null}
          {library.source?.type === 'pdf' ? (
            <Link
              href={`/dashboard/libraries/${library.id}/files`}
              className="inline-flex h-[35px] items-center gap-1.5 rounded-[7px] border-2 border-line bg-card px-3 text-[12px] font-medium text-ink hover:bg-subtle"
            >
              <FileTextIcon size={14} />
              {d.actions.files}
            </Link>
          ) : null}
          {canEdit ? (
            <div className="flex flex-col items-end gap-1.5">
              <RebuildLibraryButton
                libraryId={library.id}
                action={rebuildLibraryAction}
                disabled={library.lifecycleStatus === 'archived' || !quote.affordable}
              />
              <span className="max-w-[260px] text-right text-[11px] leading-[1.5] tracking-[-0.023em] text-muted">
                {fill(d.actions.rebuildNote, { calls: number.format(quote.maxCalls) })}
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <section
        className={`flex flex-wrap items-center gap-4 rounded-[10px] border-2 px-[19px] py-4 ${
          banner.tone === 'live' ? 'border-publine bg-[#ebf5f5]' : 'border-line bg-card'
        }`}
      >
        <IconTile tone="card">{banner.icon}</IconTile>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <p className="flex items-center gap-2 text-[13px] leading-[1.4] font-bold tracking-[-0.023em] text-ink">
            {banner.title}
            <StatusLabel tone={banner.tone}>{statusLabels[banner.tone]}</StatusLabel>
          </p>
          <p className="text-[11px] leading-[1.5] tracking-[-0.023em] text-muted">{banner.body}</p>
        </div>
      </section>

      {/* Plain 2x2 readout, not four cards: the banner above already carries
          the one thing that matters, and cards would compete with it. */}
      <dl className="grid grid-cols-1 gap-x-10 px-1 sm:grid-cols-2">
        {[
          [d.stats.status, label(d.indexStatus, library.indexStatus), <ShieldCheckIcon key="i" size={16} />],
          [d.stats.version, library.currentVersion?.label ?? d.stats.versionNone, <DatabaseIcon key="i" size={16} />],
          [
            d.stats.chunks,
            `${number.format(library.currentVersion?.documents ?? 0)} / ${number.format(library.currentVersion?.chunks ?? 0)}`,
            <FileTextIcon key="i" size={16} />,
          ],
          [d.stats.lastBuild, when(library.lastSuccessfulRefreshAt), <ClockIcon key="i" size={16} />],
        ].map(([key, value, icon]) => (
          <div
            key={String(key)}
            className="flex items-center gap-3 border-b border-line/70 py-3.5 sm:[&:nth-last-child(-n+2)]:border-b-0"
          >
            <span className="text-brand">{icon}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[11px] tracking-[-0.023em] text-muted">{key}</dt>
              <dd className="truncate text-[15px] font-semibold tracking-[-0.025em] text-ink">{value}</dd>
            </span>
          </div>
        ))}
      </dl>

      <section className={`${PANEL} p-6`}>
        <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-ink">{d.basics.title}</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-[12px] tracking-[-0.023em] sm:grid-cols-2">
          {[
            [d.basics.publicId, library.publicId],
            [d.basics.visibility, library.visibility === 'public' ? l.scopePublic : l.scopePrivate],
            [
              d.basics.source,
              library.source
                ? library.source.fileCount === null
                  ? `${library.source.type} · ${library.source.location}`
                  : `${library.source.type} · ${fill(d.basics.files, { n: String(library.source.fileCount) })}`
                : d.basics.none,
            ],
            [d.basics.language, library.language ?? d.basics.none],
            [d.basics.indexStatus, label(d.indexStatus, library.indexStatus)],
            [d.basics.created, when(library.createdAt)],
            [d.basics.description, library.description ?? d.basics.none],
          ].map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5 border-b border-line/70 py-2 last:border-b-0">
              <dt className="text-[10px] font-semibold tracking-[0.02em] text-muted">{key}</dt>
              <dd className="break-all text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${PANEL} p-0.5`}>
        <div className="px-6 py-4">
          <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-ink">{d.queue.title}</h2>
          <p className="mt-0.5 text-[11px] tracking-[-0.023em] text-muted">{d.queue.description}</p>
        </div>
        <Table
          columns={d.queue.columns}
          empty={d.queue.empty}
          rows={library.operations.map((operation) => [
            label(d.queue.types, operation.operationType),
            <StatusLabel
              key="s"
              tone={
                operation.status === 'succeeded' || operation.status === 'skipped'
                  ? 'live'
                  : operation.status === 'failed'
                    ? 'blocked'
                    : operation.status === 'cancelled'
                      ? 'exempt'
                      : 'pending'
              }
            >
              {label(d.queue.statuses, operation.status)}
            </StatusLabel>,
            String(operation.attempts),
            operation.error ? label(t.admin.ingestionErrors, operation.error) : d.basics.none,
            when(operation.createdAt),
          ])}
        />
      </section>

      <section id="documents" className={`${PANEL} scroll-mt-4 p-0.5`}>
        <div className="px-6 py-4">
          <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-ink">{d.documents.title}</h2>
          <p className="mt-0.5 text-[11px] tracking-[-0.023em] text-muted">{d.documents.description}</p>
        </div>
        <Table
          columns={d.documents.columns}
          empty={d.documents.empty}
          rows={documents.documents.map((document) => [
            <Link
              key="t"
              href={`/dashboard/libraries/${library.id}/documents/${document.id}`}
              className="text-brandink hover:text-brand"
            >
              {document.title}
            </Link>,
            <a
              key="u"
              href={document.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-muted hover:text-ink"
            >
              {document.sourceUrl}
            </a>,
            number.format(document.chunks),
          ])}
        />
        {documents.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-line px-6 py-3">
            <p className="text-[11px] tracking-[-0.023em] text-muted">
              {fill(d.documents.page, { page: docsPage, pages: docsPages })} ·{' '}
              {fill(d.documents.showing, { shown: documents.documents.length, total: documents.total })}
            </p>
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] text-muted">
                {d.documents.pageSize}
                {DOCUMENTS_PAGE_SIZES.map((size) => (
                  <Link
                    key={size}
                    href={docsHref(1, size)}
                    aria-current={size === docsSize ? 'true' : undefined}
                    className={`rounded-[5px] px-1.5 py-0.5 ${
                      size === docsSize ? 'bg-subtle font-semibold text-ink' : 'hover:text-ink'
                    }`}
                  >
                    {size}
                  </Link>
                ))}
              </span>
              {docsPage > 1 ? (
                <Link href={docsHref(docsPage - 1)} className={PAGER}>
                  {d.documents.prev}
                </Link>
              ) : null}
              {docsPage < docsPages ? (
                <Link href={docsHref(docsPage + 1)} className={PAGER}>
                  {d.documents.next}
                </Link>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>

      <section className={`${PANEL} p-0.5`}>
        <div className="px-6 py-4">
          <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-ink">{d.versions.title}</h2>
        </div>
        <Table
          columns={d.versions.columns}
          empty={d.versions.empty}
          rows={library.versions.map((version) => [
            <span key="v" className="flex items-center gap-2">
              {version.label}
              {version.isCurrent ? <Badge tone="brand">{d.versions.current}</Badge> : null}
            </span>,
            label(d.indexStatus, version.indexStatus),
            `${number.format(version.documents)} / ${number.format(version.chunks)}`,
            version.buildCalls === null
              ? d.versions.costFree
              : fill(d.versions.cost, { calls: number.format(version.buildCalls) }),
            when(version.publishedAt),
          ])}
        />
      </section>

      {library.visibility === 'public' || library.reviews.length > 0 ? (
        <section className={`${PANEL} p-0.5`}>
          <div className="px-6 py-4">
            <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-ink">{d.reviews.title}</h2>
          </div>
          <Table
            columns={d.reviews.columns}
            empty={d.reviews.empty}
            rows={library.reviews.map((review) => [
              when(review.decidedAt),
              label(d.reviews.outcomes, review.outcome),
              review.feedback.join(' ') || d.basics.none,
            ])}
          />
        </section>
      ) : null}
    </div>
  );
}

function Table({
  columns,
  rows,
  empty,
}: {
  columns: readonly string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-[12px] tracking-[-0.023em]">
        <thead>
          <tr className="bg-subtle text-[11px] font-semibold text-muted">
            {columns.map((column) => (
              <th key={column} scope="col" className="px-6 py-3">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="border-t-2 border-line">
              <td colSpan={columns.length} className="px-6 py-8 text-center text-[13px] text-muted">
                {empty}
              </td>
            </tr>
          ) : null}
          {rows.map((cells, index) => (
            <tr key={index} className="border-t-2 border-line">
              {cells.map((cell, column) => (
                <td key={column} className="px-6 py-3 align-middle text-ink">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
