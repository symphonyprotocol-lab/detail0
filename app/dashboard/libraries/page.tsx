import type { Metadata } from 'next';
import { LibraryList } from '@/components/dashboard/library-list';
import {
  ActionButton,
  ArrowLink,
  Meter,
  Notice,
  PANEL,
  PageHeader,
  StatTile,
} from '@/components/dashboard/ui';
import {
  BadgeCheckIcon,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '@/components/ui/icons';
import { dashboardCopy } from '@/lib/dashboard/demo-data';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.libraries.title };
}

const STAT_ICONS = [DatabaseIcon, BadgeCheckIcon, ClockIcon, FileTextIcon];

export default async function DashboardLibrariesPage() {
  const t = await getMessages();
  const l = t.dashboard.libraries;
  const d = dashboardCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        eyebrow={d.workspace.name}
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
        {d.libraryStats.map((stat, index) => {
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

      <LibraryList />

      <section className="grid gap-3 lg:grid-cols-[1fr_234px]">
        <article className={`${PANEL} flex flex-col gap-[7px] p-[22px]`}>
          <div className="flex items-center gap-2.5">
            <ClockIcon size={18} className="text-brand" />
            <span className="flex flex-col gap-[3px]">
              <span className="text-[14px] tracking-[-0.023em] text-ink">
                {d.reviewQueue.title}
              </span>
              <span className="text-[11px] tracking-[-0.023em] text-muted">
                {d.reviewQueue.note}
              </span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] tracking-[-0.023em] text-steel">
            <span>{d.reviewQueue.item}</span>
            <span>{d.reviewQueue.stage}</span>
          </div>
          <Meter value={d.reviewQueue.percent} />
        </article>

        <article className={`${PANEL} flex flex-col px-[22px] pt-8 pb-[26px]`}>
          <p className="text-[11px] font-bold tracking-[-0.023em] text-brand">
            {d.libraryPlan.eyebrow}
          </p>
          <p className="mt-3 text-[15px] leading-[1.4] tracking-[-0.025em] text-ink">
            {d.libraryPlan.usage}
          </p>
          <p className="mt-2 text-[11px] leading-[1.5] tracking-[-0.023em] text-muted">
            {d.libraryPlan.note}
          </p>
          <div className="mt-4">
            <ArrowLink href="/pricing">{l.viewPlans}</ArrowLink>
          </div>
        </article>
      </section>
    </div>
  );
}
