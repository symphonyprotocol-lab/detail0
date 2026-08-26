import type { Metadata } from 'next';
import { AdministratorTable, type AdministratorView } from '@/components/admin/administrator-table';
import { InviteAdministrator } from '@/components/admin/invite-administrator';
import {
  ConsoleButton,
  ConsoleNotice,
  ConsolePageHeader,
  ExportLink,
  ListToolbar,
  Panel,
  PanelHead,
  TableScroller,
  TD,
  TH,
} from '@/components/admin/ui';
import { CheckIcon, ShieldCheckIcon } from '@/components/ui/icons';
import { listAdministrators } from '@/lib/application/administration';
import {
  ADMIN_CAPABILITIES,
  ADMIN_INVITE_TTL_MS,
  ADMIN_ROLE_IDS,
  capabilitiesForRoles,
  roleAllows,
  type AdminRoleId,
} from '@/lib/domain/admin';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import {
  changeRoleAction,
  inviteAdministratorAction,
  revokeSessionsAction,
  setStatusAction,
} from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.administrators.title };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    return parts
      .slice(0, 2)
      .map((part) => (Array.from(part)[0] ?? '').toUpperCase())
      .join('');
  }
  return Array.from(name).slice(0, 2).join('').toUpperCase() || 'A';
}

/** `YYYY-MM-DD HH:mm` in UTC, the same shape the audit log prints. */
function timestamp(value: Date | null, fallback: string): string {
  if (!value) return fallback;
  return `${value.toISOString().slice(0, 10)} ${value.toISOString().slice(11, 16)}`;
}

/**
 * Console members and role permissions -- design source frame `RubCg`.
 *
 * Reads the real `administrator` table. The matrix below it is the
 * least-privilege model of requirement.md 3.1 and 5.3 drawn out, rendered from
 * `lib/domain/admin` -- the same module the route guards consult, so the table
 * cannot claim a permission the console does not enforce.
 */
export default async function AdminAdministratorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params, t] = await Promise.all([
    requireAdminCapability('administrators'),
    searchParams,
    getMessages(),
  ]);
  const a = t.admin.administrators;
  const query = typeof params.q === 'string' ? params.q : undefined;

  const roles = ADMIN_ROLE_IDS.map((id) => ({ id, label: t.admin.roles[id] }));

  const administrators: AdministratorView[] = (await listAdministrators(query)).map((row) => {
    const capabilities = capabilitiesForRoles(row.roles);
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      initial: initials(row.username),
      // Every role, so the badge cannot understate what the account reaches.
      roles: row.roles.map((id) => ({ id, label: t.admin.roles[id] })),
      scopeLabel:
        capabilities.length === ADMIN_CAPABILITIES.length
          ? a.scopeAll
          : capabilities
              .map((capability) => t.admin.capabilities[capability])
              .join(a.scopeSeparator) || a.scopeNone,
      status: row.status,
      statusLabel: t.admin.statuses[row.status],
      lastActive: timestamp(row.lastActiveAt, a.neverActive),
      activeSessions: row.activeSessions,
      mfaEnrolled: row.mfaEnrolled,
      isSelf: row.id === session.administratorId,
    };
  });

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={a.title} description={a.description} />

      <ConsoleNotice
        icon={<ShieldCheckIcon size={18} />}
        title={a.noticeTitle}
        body={a.noticeBody}
        action={
          <InviteAdministrator
            action={inviteAdministratorAction}
            inviteTtlDays={Math.round(ADMIN_INVITE_TTL_MS / 86_400_000)}
            roles={roles}
          />
        }
      />

      <Panel>
        {/* GET, so a filtered list is a URL an operator can keep or share. */}
        <form method="get">
          <ListToolbar placeholder={a.searchPlaceholder} name="q" defaultValue={query}>
            <ConsoleButton type="submit">{a.searchSubmit}</ConsoleButton>
            <ExportLink resource="administrators" query={query} label={t.admin.actions.export} />
          </ListToolbar>
        </form>

        <AdministratorTable
          administrators={administrators}
          roles={roles}
          actions={{
            changeRole: changeRoleAction,
            setStatus: setStatusAction,
            revokeSessions: revokeSessionsAction,
          }}
        />
      </Panel>

      <Panel>
        <PanelHead title={a.matrixTitle} description={a.matrixSubtitle} />
        <TableScroller>
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr>
                {a.matrixColumns.map((column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={`${TH} ${index === 0 ? '' : 'text-center'}`}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADMIN_ROLE_IDS.map((role) => (
                <tr key={role} className="border-t-2 border-line">
                  <th scope="row" className={`${TD} font-semibold whitespace-nowrap text-ink`}>
                    {t.admin.roles[role]}
                  </th>
                  {ADMIN_CAPABILITIES.map((capability) => (
                    <td key={capability} className={`${TD} text-center`}>
                      {/* The glyph is decorative; the sentence is what a screen reader gets. */}
                      <span className="sr-only">
                        {fill(roleAllows(role, capability) ? a.matrixAllowed : a.matrixDenied, {
                          role: t.admin.roles[role],
                          capability: t.admin.capabilities[capability],
                        })}
                      </span>
                      {roleAllows(role, capability) ? (
                        <CheckIcon size={15} className="mx-auto text-brand" />
                      ) : (
                        <span aria-hidden className="text-faint">
                          {a.matrixNone}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </Panel>
    </div>
  );
}
