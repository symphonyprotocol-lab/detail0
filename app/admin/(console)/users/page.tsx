import type { Metadata } from 'next';
import {
  ConsoleButton,
  ConsolePageHeader,
  IconButton,
  ListToolbar,
  Monogram,
  Pagination,
  Panel,
  Pill,
  TableScroller,
  TD,
  TH,
  TitleCell,
} from '@/components/admin/ui';
import { DownloadIcon, EllipsisIcon, EyeIcon, FilterIcon } from '@/components/ui/icons';
import { adminCopy, USER_TOTAL } from '@/lib/admin/demo-data';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.users.title };
}

/** Registered users -- design source frame `SRtSN`. */
export default async function AdminUsersPage() {
  await requireAdminCapability('users');
  const t = await getMessages();
  const u = t.admin.users;
  const { users } = adminCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={u.title} description={u.description} />

      <Panel>
        <ListToolbar placeholder={u.searchPlaceholder}>
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
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr>
                {u.columns.map((column) => (
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
              {users.map((user) => (
                <tr key={user.email} className="border-t-2 border-line">
                  <td className={TD}>
                    <TitleCell
                      title={user.name}
                      meta={user.email}
                      leading={<Monogram initial={user.initial} />}
                    />
                  </td>
                  <td className={TD}>
                    <Pill tone={user.plan === 'Pro' ? 'ok' : 'neutral'}>{user.plan}</Pill>
                  </td>
                  <td className={TD}>{user.libraries.toLocaleString('en-US')}</td>
                  <td className={TD}>{user.calls.toLocaleString('en-US')}</td>
                  <td className={TD}>{user.joinedAt}</td>
                  <td className={TD}>
                    <Pill tone={user.status === 'active' ? 'ok' : 'danger'}>{user.statusLabel}</Pill>
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      <IconButton label={t.admin.actions.view}>
                        <EyeIcon size={14} />
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
          summary={fill(u.showing, {
            from: 1,
            to: users.length,
            total: USER_TOTAL.toLocaleString('en-US'),
          })}
          pages={[1, 2, 3]}
          activePage={1}
          labels={t.admin.actions}
        />
      </Panel>
    </div>
  );
}
