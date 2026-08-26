import type { Metadata } from 'next';
import {
  ConsoleButton,
  ConsoleNotice,
  ConsolePageHeader,
  IconButton,
  ListToolbar,
  Monogram,
  Panel,
  PanelHead,
  Pill,
  TableScroller,
  TD,
  TH,
  TitleCell,
} from '@/components/admin/ui';
import {
  CheckIcon,
  DownloadIcon,
  EllipsisIcon,
  FilterIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '@/components/ui/icons';
import { adminCopy, CAPABILITIES, type AdminAccountStatus } from '@/lib/admin/demo-data';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.administrators.title };
}

const ADMIN_TONE: Record<AdminAccountStatus, 'ok' | 'warn' | 'neutral'> = {
  active: 'ok',
  invited: 'warn',
  disabled: 'neutral',
};

/**
 * Console members and role permissions -- design source frame `RubCg`.
 *
 * The matrix is the least-privilege model in requirement.md 3.1 and 5.3 drawn
 * out: only the super administrator reaches every capability, and each other
 * preset role reaches exactly what its job needs.
 */
export default async function AdminAdministratorsPage() {
  await requireAdminCapability('administrators');
  const t = await getMessages();
  const a = t.admin.administrators;
  const { administrators, roleMatrix, capabilityLabels } = adminCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={a.title} description={a.description} />

      <ConsoleNotice
        icon={<ShieldCheckIcon size={18} />}
        title={a.noticeTitle}
        body={a.noticeBody}
        action={
          <ConsoleButton variant="primary">
            <PlusIcon size={14} />
            {a.invite}
          </ConsoleButton>
        }
      />

      <Panel>
        <ListToolbar placeholder={a.searchPlaceholder}>
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
                {a.columns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
                <th scope="col" className={`${TH} w-[56px]`}>
                  <span className="sr-only">{t.admin.actions.more}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {administrators.map((administrator) => (
                <tr key={administrator.email} className="border-t-2 border-line">
                  <td className={TD}>
                    <TitleCell
                      title={administrator.name}
                      meta={administrator.email}
                      leading={<Monogram initial={administrator.initial} tone="ink" />}
                    />
                  </td>
                  <td className={TD}>
                    <Pill tone={administrator.role === roleMatrix[0]?.role ? 'brand' : 'neutral'}>
                      {administrator.role}
                    </Pill>
                  </td>
                  <td className={TD}>{administrator.scope}</td>
                  <td className={TD}>{administrator.lastActive}</td>
                  <td className={TD}>
                    <Pill tone={ADMIN_TONE[administrator.status]}>
                      {administrator.statusLabel}
                    </Pill>
                  </td>
                  <td className={TD}>
                    <IconButton label={t.admin.actions.more}>
                      <EllipsisIcon size={14} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
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
              {roleMatrix.map((row) => (
                <tr key={row.role} className="border-t-2 border-line">
                  <th scope="row" className={`${TD} font-semibold whitespace-nowrap text-ink`}>
                    {row.role}
                  </th>
                  {CAPABILITIES.map((capability) => (
                    <td key={capability} className={`${TD} text-center`}>
                      {/* The glyph is decorative; the sentence is what a screen reader gets. */}
                      <span className="sr-only">
                        {fill(row.allowed[capability] ? a.matrixAllowed : a.matrixDenied, {
                          role: row.role,
                          capability: capabilityLabels[capability],
                        })}
                      </span>
                      {row.allowed[capability] ? (
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
