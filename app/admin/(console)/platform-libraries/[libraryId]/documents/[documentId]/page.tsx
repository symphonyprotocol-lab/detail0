import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentText } from '@/components/document-text';
import { ConsoleButton, ConsolePageHeader, Panel } from '@/components/admin/ui';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { getPlatformLibrary } from '@/lib/application/administration';
import { documentPreview } from '@/lib/application/libraries';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.platformLibraryDetail.documentPreview.metaTitle.replace('{title} · ', '') };
}

/**
 * One indexed document, as its chunks. The library is resolved through the
 * platform loader first, so a document id from a user library is a 404 here
 * even though the query itself would find it.
 */
export default async function PlatformDocumentPreviewPage({
  params,
}: {
  params: Promise<{ libraryId: string; documentId: string }>;
}) {
  const [, { libraryId, documentId }, t] = await Promise.all([
    requireAdminCapability('platformLibraries'),
    params,
    getMessages(),
  ]);
  const library = await getPlatformLibrary(libraryId);
  if (!library) notFound();
  const document = await documentPreview({ libraryId: library.id, documentId });
  if (!document) notFound();
  const d = t.admin.platformLibraryDetail.documentPreview;
  const tokens = document.chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader
        eyebrow={d.eyebrow}
        title={document.title}
        description={fill(d.chunks, { n: document.chunks.length, tokens })}
        action={
          <ConsoleButton href={`/admin/platform-libraries/${library.id}`}>
            <ChevronLeftIcon size={14} />
            {d.back}
          </ConsoleButton>
        }
      />
      <Panel className="px-[19px] py-4">
        <p className="text-[12px] tracking-[-0.023em] text-muted">
          {d.source}:{' '}
          <a href={document.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-brandink hover:text-brand">
            {document.sourceUrl}
          </a>
        </p>
      </Panel>
      <DocumentText chunks={document.chunks} chunkLabel={d.chunk} />
    </div>
  );
}
