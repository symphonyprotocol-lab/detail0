import type { Metadata } from 'next';
import {
  ConsoleButton,
  ConsolePageHeader,
  IconButton,
  ListToolbar,
  Pagination,
  Panel,
  Pill,
  TabBar,
  TableScroller,
  TD,
  TH,
  TitleCell,
} from '@/components/admin/ui';
import { DownloadIcon, EllipsisIcon, EyeIcon, FilterIcon } from '@/components/ui/icons';
import { adminCopy, LIBRARY_TOTAL, type LibraryReviewStatus } from '@/lib/admin/demo-data';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.libraries.title };
}

const REVIEW_TONE: Record<LibraryReviewStatus, 'warn' | 'ok' | 'danger' | 'neutral'> = {
  pending: 'warn',
  approved: 'ok',
  rejected: 'danger',
  exempt: 'neutral',
};

/** User libraries and the public review queue -- design source frame `zcHnx`. */
export default async function AdminLibrariesPage() {
  await requireAdminCapability('libraries');
  const t = await getMessages();
  const l = t.admin.libraries;
  const { libraries, libraryTabs } = adminCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={l.title} description={l.description} />

      <TabBar tabs={libraryTabs} activeId="all" />

      <Panel>
        <ListToolbar placeholder={l.searchPlaceholder}>
          <ConsoleButton>
            <FilterIcon size={14} />
            {t.admin.actions.filter}
          </ConsoleButton>
          <ConsoleButton>
            <DownloadIcon size={14} />
            {t.admin.actions.export}
          </ConsoleButton>
        </ListToolbar>

        <TableScroller>
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr>
                {l.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
                <th scope="col" className={`${TH} w-[96px]`}>
                  <span className="sr-only">{t.admin.actions.more}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {libraries.map((library) => (
                <tr key={library.meta} className="border-t-2 border-line">
                  <td className={TD}>
                    <TitleCell title={library.title} meta={library.meta} />
                  </td>
                  <td className={TD}>{library.owner}</td>
                  <td className={TD}>{library.source}</td>
                  <td className={TD}>{library.size}</td>
                  <td className={TD}>
                    <Pill tone={library.scope === 'public' ? 'brand' : 'info'}>
                      {library.scopeLabel}
                    </Pill>
                  </td>
                  <td className={TD}>
                    <Pill tone={REVIEW_TONE[library.status]}>{library.statusLabel}</Pill>
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      {library.status === 'pending' ? (
                        <ConsoleButton className="h-[30px] border-publine text-brandink">
                          {t.admin.actions.review}
                        </ConsoleButton>
                      ) : (
                        <IconButton label={t.admin.actions.view}>
                          <EyeIcon size={14} />
                        </IconButton>
                      )}
                      <IconButton label={t.admin.actions.more}>
                        <EllipsisIcon size={14} />
                      </IconButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>

        <Pagination
          summary={fill(l.showing, { from: 1, to: libraries.length, total: LIBRARY_TOTAL })}
          pages={[1]}
          activePage={1}
          labels={t.admin.actions}
        />
      </Panel>
    </div>
  );
}
