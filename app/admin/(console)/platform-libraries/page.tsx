import type { Metadata } from 'next';
import {
  CONSOLE_PANEL,
  ConsoleButton,
  ConsolePageHeader,
  IconButton,
  ListToolbar,
  Pagination,
  Panel,
  Pill,
  TableScroller,
  TD,
  TH,
  TitleCell,
} from '@/components/admin/ui';
import {
  DownloadIcon,
  EllipsisIcon,
  FilterIcon,
  GlobeIcon,
  PencilIcon,
  PlusIcon,
} from '@/components/ui/icons';
import { adminCopy, PLATFORM_TOTAL, type PlatformStatus } from '@/lib/admin/demo-data';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.platformLibraries.title };
}

const PLATFORM_TONE: Record<PlatformStatus, 'ok' | 'warn' | 'neutral'> = {
  published: 'ok',
  syncing: 'warn',
  draft: 'neutral',
};

/** Libraries recall0 publishes itself -- design source frame `d5LpW4`. */
export default async function AdminPlatformLibrariesPage() {
  await requireAdminCapability('libraries');
  const t = await getMessages();
  const p = t.admin.platformLibraries;
  const { platformStats, platformLibraries } = adminCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={p.title} description={p.description} />

      <section className="flex flex-col gap-2.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {platformStats.map((stat) => (
            <article
              key={stat.label}
              className={`${CONSOLE_PANEL} flex items-center gap-2.5 rounded-[9px] p-4`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-brandsoft text-brand">
                <GlobeIcon size={16} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[18px] leading-[1.3] font-semibold tracking-[-0.03em] text-ink">
                  {stat.value}
                </span>
                <span className="truncate text-[11px] tracking-[-0.023em] text-muted">
                  {stat.label}
                </span>
              </span>
            </article>
          ))}
        </div>

        <ConsoleButton variant="primary" className="h-10 w-full">
          <PlusIcon size={15} />
          {p.create}
        </ConsoleButton>
      </section>

      <Panel>
        <ListToolbar placeholder={p.searchPlaceholder}>
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
                {p.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
                <th scope="col" className={`${TH} w-[86px]`}>
                  <span className="sr-only">{t.admin.actions.more}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {platformLibraries.map((library) => (
                <tr key={library.meta} className="border-t-2 border-line">
                  <td className={TD}>
                    <TitleCell title={library.title} meta={library.meta} />
                  </td>
                  <td className={TD}>{library.source}</td>
                  <td className={TD}>{library.documents}</td>
                  <td className={TD}>{library.size}</td>
                  <td className={TD}>{library.syncedAt}</td>
                  <td className={TD}>
                    <Pill tone={PLATFORM_TONE[library.status]}>{library.statusLabel}</Pill>
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      <IconButton label={t.admin.actions.edit}>
                        <PencilIcon size={14} />
                      </IconButton>
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
          summary={fill(p.showing, {
            from: 1,
            to: platformLibraries.length,
            total: PLATFORM_TOTAL,
          })}
          pages={[1, 2, 3]}
          activePage={1}
          labels={t.admin.actions}
        />
      </Panel>
    </div>
  );
}
