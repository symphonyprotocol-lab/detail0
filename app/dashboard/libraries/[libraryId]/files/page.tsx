import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LibraryFiles } from '@/components/dashboard/library-files';
import { canManageLibraries, libraryFiles } from '@/lib/application/libraries';
import { requireSession } from '@/lib/http/session';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { prepareUploadAction } from '../../new/actions';
import { updateLibraryFilesAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.libraryFiles.metaTitle };
}

/**
 * The files of one PDF library. A library this workspace does not own, or one
 * that is not built from uploads, is a 404 -- the same answer as one that
 * does not exist, so nothing is confirmed about anyone else's.
 */
export default async function DashboardLibraryFilesPage({
  params,
}: {
  params: Promise<{ libraryId: string }>;
}) {
  const { libraryId } = await params;
  const [session, t] = await Promise.all([
    requireSession(`/dashboard/libraries/${libraryId}/files`),
    getMessages(),
  ]);
  const view = await libraryFiles({ workspaceId: session.workspace.id, libraryId });
  if (!view) notFound();
  const f = t.dashboard.libraryFiles;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex flex-col gap-[5px]">
          <Link
            href="/dashboard/libraries"
            className="text-[12px] tracking-[-0.023em] text-brandink transition-colors hover:text-brand"
          >
            {f.back}
          </Link>
          <h1 className="mt-1.5 text-[25px] leading-[1.5] font-[650] tracking-[-0.045em] text-ink">
            {f.title}
          </h1>
          <p className="text-[13px] leading-[1.5] tracking-[-0.023em] text-muted">
            {fill(f.description, { title: view.library.title })}
          </p>
          <p className="text-[11px] tracking-[-0.023em] text-muted">{view.library.publicId}</p>
        </div>
      </header>

      <LibraryFiles
        libraryId={view.library.id}
        files={view.files}
        building={view.building}
        canEdit={canManageLibraries(session.workspace.role)}
        action={updateLibraryFilesAction}
        prepare={prepareUploadAction}
      />
    </div>
  );
}
