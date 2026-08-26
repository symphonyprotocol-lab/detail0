import type { Metadata } from 'next';
import { FilterSelect } from '@/components/admin/list-controls';
import {
  ConsoleButton,
  ConsolePageHeader,
  EmptyRow,
  ExportLink,
  IconButton,
  ListToolbar,
  Monogram,
  Panel,
  Pill,
  TableScroller,
  TD,
  TH,
  TitleCell,
} from '@/components/admin/ui';
import { EllipsisIcon, EyeIcon } from '@/components/ui/icons';
import { listConsoleUsers, type UserStatusFilter } from '@/lib/application/administration';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { initialsOf, oneOf, PAGE_SIZE, searchTerm, utcDate } from '../list-params';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.users.title };
}

const STATUSES: UserStatusFilter[] = ['all', 'active', 'suspended'];

/**
 * Registered users -- design source frame `SRtSN`.
 *
 * Reads the real `user` table. Library and call counts come from the tables
 * that own them, so an account with no activity reads zero; call metering is
 * not live yet (architecture.md 21), which is why that column is all zeroes
 * rather than invented traffic.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, params, t] = await Promise.all([
    requireAdminCapability('users'),
    searchParams,
    getMessages(),
  ]);
  const u = t.admin.users;
  const f = t.admin.filters;
  const query = searchTerm(params.q);
  const status = oneOf(params.status, STATUSES, 'all');

  const { rows, total } = await listConsoleUsers({ query, status, limit: PAGE_SIZE });

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={u.title} description={u.description} />

      <Panel>
        {/* GET, so a filtered list is a URL an operator can keep or share. */}
        <form method="get">
          <ListToolbar placeholder={u.searchPlaceholder} name="q" defaultValue={query}>
            <FilterSelect
              name="status"
              label={f.label}
              value={status}
              options={[
                { id: 'all', label: f.all },
                { id: 'active', label: f.userActive },
                { id: 'suspended', label: f.userSuspended },
              ]}
            />
            <ConsoleButton type="submit">{t.admin.administrators.searchSubmit}</ConsoleButton>
            <ExportLink
              resource="users"
              query={query}
              status={status}
              label={t.admin.actions.export}
            />
          </ListToolbar>
        </form>

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
              {rows.length === 0 ? (
                <EmptyRow columns={u.columns.length + 1} message={u.empty} />
              ) : null}
              {rows.map((user) => (
                <tr key={user.id} className="border-t-2 border-line">
                  <td className={TD}>
                    <TitleCell
                      title={user.displayName}
                      meta={user.email}
                      leading={<Monogram initial={initialsOf(user.displayName)} />}
                    />
                  </td>
                  <td className={TD}>
                    <Pill tone={user.planName === 'Free' ? 'neutral' : 'ok'}>{user.planName}</Pill>
                  </td>
                  <td className={TD}>{user.libraries.toLocaleString('en-US')}</td>
                  <td className={TD}>{user.callsThisMonth.toLocaleString('en-US')}</td>
                  <td className={`${TD} whitespace-nowrap`}>{utcDate(user.joinedAt)}</td>
                  <td className={TD}>
                    <Pill tone={user.status === 'active' ? 'ok' : 'danger'}>
                      {user.status === 'active'
                        ? t.adminDemo.userStatus.active
                        : t.adminDemo.userStatus.suspended}
                    </Pill>
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

        <div className="border-t-2 border-line px-4 py-[11px]">
          <p className="text-[12px] tracking-[-0.023em] text-muted">
            {fill(u.showing, {
              from: rows.length === 0 ? 0 : 1,
              to: rows.length,
              total: total.toLocaleString('en-US'),
            })}
          </p>
        </div>
      </Panel>
    </div>
  );
}
