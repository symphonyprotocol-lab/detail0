import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportWizard } from '@/components/dashboard/import-wizard';
import { createWorkspaceLibraryAction } from './actions';
import { Badge, IconTile, PANEL } from '@/components/dashboard/ui';
import { LockIcon, ShieldCheckIcon } from '@/components/ui/icons';
import { dashboardCopy } from '@/lib/dashboard/demo-data';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.newLibrary.metaTitle };
}

export default async function DashboardAddLibraryPage() {
  const t = await getMessages();
  const n = t.dashboard.newLibrary;
  const reviewSteps = dashboardCopy(t).reviewSteps;

  return (
    <div className="flex flex-col gap-4">
      {/* Page header -- design source frame `ISF8H`. */}
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex flex-col gap-[5px]">
          <Link
            href="/dashboard/libraries"
            className="text-[12px] tracking-[-0.023em] text-brandink transition-colors hover:text-brand"
          >
            {n.back}
          </Link>
          <h1 className="mt-1.5 text-[25px] leading-[1.5] font-[650] tracking-[-0.045em] text-ink">
            {n.title}
          </h1>
          <p className="text-[13px] leading-[1.5] tracking-[-0.023em] text-muted">
            {n.description}
          </p>
        </div>
        <Badge tone="neutral">{n.draftSaved}</Badge>
      </header>

      <ImportWizard action={createWorkspaceLibraryAction} />

      {/* Review pipeline -- design source frame `ISF8H`. */}
      <aside className={`${PANEL} flex flex-col gap-4 p-6`}>
        <div className="flex items-center gap-2.5">
          <IconTile>
            <ShieldCheckIcon size={18} />
          </IconTile>
          <div className="flex flex-col gap-[3px]">
            <p className="text-[15px] leading-[1.4] tracking-[-0.025em] text-ink">
              {n.reviewTitle}
            </p>
            <p className="text-[11px] tracking-[-0.023em] text-muted">{n.reviewDescription}</p>
          </div>
        </div>

        <ol className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {reviewSteps.map((entry, index) => (
            <li key={entry.title} className="flex flex-col gap-2">
              <span
                aria-hidden
                className="flex size-6 items-center justify-center rounded-full bg-brandsoft text-[11px] text-brandink"
              >
                {index + 1}
              </span>
              <span className="text-[12px] tracking-[-0.023em] text-ink">{entry.title}</span>
              <span className="text-[10px] leading-[1.5] tracking-[-0.023em] text-muted">
                {entry.note}
              </span>
            </li>
          ))}
        </ol>

        <p className="flex items-center gap-1.5 border-t-2 border-line pt-3.5 text-[11px] tracking-[-0.023em] text-muted">
          <LockIcon size={13} />
          {n.privateSkips}
        </p>
      </aside>
    </div>
  );
}
