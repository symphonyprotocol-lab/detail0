import type { Metadata } from 'next';
import { LibraryList, type LibraryListRow } from '@/components/dashboard/library-list';
import {
  ActionButton,
  ArrowLink,
  Notice,
  PageHeader,
  StatTile,
  type StatusTone,
} from '@/components/dashboard/ui';
import {
  BadgeCheckIcon,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '@/components/ui/icons';
import {
  canDeleteLibraries,
  listWorkspaceLibraries,
  type WorkspaceLibraryRow,
} from '@/lib/application/libraries';
import { requireSession } from '@/lib/http/session';
import { getMessages, translations } from '@/lib/i18n/server';
import { deleteWorkspaceLibraryAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.libraries.title };
}

const STAT_ICONS = [DatabaseIcon, BadgeCheckIcon, ClockIcon, FileTextIcon];

/**
 * Lifecycle plus index state collapse to the design's four-way marker: live
 * (published and queryable), pending (anywhere in review or still indexing),
 * blocked (suspended, rejected or failed), exempt (a private draft that never
 * enters review).
 */
function statusOf(row: WorkspaceLibraryRow): StatusTone {
  if (row.lifecycleStatus === 'suspended' || row.indexStatus === 'failed') return 'blocked';
  if (row.lifecycleStatus === 'published' && row.indexStatus === 'ready') return 'live';
  if (row.lifecycleStatus === 'changes_requested') return 'blocked';
  if (
    row.lifecycleStatus === 'submitted' ||
    row.lifecycleStatus === 'reviewing' ||
    row.indexStatus === 'processing' ||
    row.indexStatus === 'pending'
  ) {
    return 'pending';
  }
  return 'exempt';
}

export default async function DashboardLibrariesPage() {
  const [session, { locale, t }] = await Promise.all([
    requireSession('/dashboard/libraries'),
    translations(),
  ]);
  const l = t.dashboard.libraries;

  const libraries = await listWorkspaceLibraries(session.workspace.id);
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  const published = libraries.filter(
    (row) => row.lifecycleStatus === 'published' && row.indexStatus === 'ready',
  ).length;
  const inReview = libraries.filter(
    (row) => row.lifecycleStatus === 'submitted' || row.lifecycleStatus === 'reviewing',
  ).length;
  const totalChunks = libraries.reduce((sum, row) => sum + row.totalChunks, 0);

  const stats = [
    { key: 'total', value: number.format(libraries.length), label: l.stats.total },
    { key: 'published', value: number.format(published), label: l.stats.published },
    { key: 'review', value: number.format(inReview), label: l.stats.review },
    { key: 'chunks', value: number.format(totalChunks), label: l.stats.chunks },
  ];

  const statusLabels: Record<StatusTone, string> = {
    live: l.statuses.live,
    pending: l.statuses.pending,
    blocked: l.statuses.blocked,
    exempt: l.statuses.exempt,
  };
  const rows: LibraryListRow[] = libraries.map((row) => {
    const status = statusOf(row);
    return {
      id: row.id,
      slug: row.publicId,
      title: row.title,
      version: row.versionLabel,
      scope: row.visibility,
      chunks: row.totalChunks,
      status,
      statusLabel: statusLabels[status],
      updated: row.updatedAt ? date.format(new Date(row.updatedAt)) : '—',
      initial: (row.title.trim()[0] ?? '?').toUpperCase(),
      filesHref: row.hasFiles ? `/dashboard/libraries/${row.id}/files` : null,
    };
  });

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        eyebrow={session.workspace.name}
        title={l.title}
        description={l.description}
        action={
          <ActionButton href="/dashboard/libraries/new">
            <PlusIcon size={15} />
            {l.addLibrary}
          </ActionButton>
        }
      />

      {/* Counters -- design source `fiSE2`. */}
      <section className="grid grid-cols-2 gap-[9px] sm:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = STAT_ICONS[index] ?? DatabaseIcon;
          return (
            <StatTile key={stat.key} icon={<Icon size={17} />} value={stat.value} label={stat.label} />
          );
        })}
      </section>

      <Notice
        tone="brand"
        icon={<ShieldCheckIcon size={18} />}
        title={l.reviewNoticeTitle}
        body={l.reviewNoticeBody}
        action={<ArrowLink href="/docs">{l.reviewNoticeLink}</ArrowLink>}
      />
      <Notice
        icon={<BadgeCheckIcon size={18} />}
        title={l.anchorNoticeTitle}
        body={l.anchorNoticeBody}
        action={<ArrowLink href="/docs">{l.anchorNoticeLink}</ArrowLink>}
      />

      {/* requirement.md 5.2: deletion is for the library's owner side only. */}
      <LibraryList
        rows={rows}
        deleteAction={
          canDeleteLibraries(session.workspace.role) ? deleteWorkspaceLibraryAction : undefined
        }
      />
    </div>
  );
}
