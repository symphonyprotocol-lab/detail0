import type { Metadata } from 'next';
import {
  ConsoleButton,
  ConsoleNotice,
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
import {
  DownloadIcon,
  EllipsisIcon,
  EyeIcon,
  FilterIcon,
  ScaleIcon,
} from '@/components/ui/icons';
import { adminCopy, CLAIM_TOTAL, type ClaimStatus } from '@/lib/admin/demo-data';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.claims.title };
}

const CLAIM_TONE: Record<ClaimStatus, 'warn' | 'ok' | 'danger' | 'neutral' | 'info'> = {
  pending: 'warn',
  claimed: 'ok',
  disputed: 'danger',
  expired: 'neutral',
  revoked: 'neutral',
};

/** Ownership claims and disputes -- design source frame `z9DJOF`. */
export default async function AdminClaimsPage() {
  await requireAdminCapability('libraries');
  const t = await getMessages();
  const c = t.admin.claims;
  const { claims, claimTabs } = adminCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={c.title} description={c.description} />

      <TabBar tabs={claimTabs} activeId="all" />

      {/*
        requirement.md 7.3 and 5.3: ownership only follows source verification,
        and an arbitration has to record what it decided on.
      */}
      <ConsoleNotice
        icon={<ScaleIcon size={18} />}
        title={c.ruleTitle}
        body={c.rule}
      />

      <Panel>
        <ListToolbar placeholder={c.searchPlaceholder}>
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
          <table className="w-full min-w-[800px] border-collapse text-left">
            <thead>
              <tr>
                {c.columns.map((column) => (
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
              {claims.map((claim) => (
                <tr key={claim.meta} className="border-t-2 border-line">
                  <td className={TD}>
                    <TitleCell title={claim.title} meta={claim.meta} />
                  </td>
                  <td className={TD}>{claim.applicant}</td>
                  <td className={`${TD} whitespace-nowrap`}>{claim.method}</td>
                  <td className={`${TD} whitespace-nowrap`}>{claim.startedAt}</td>
                  <td className={TD}>{claim.owner}</td>
                  <td className={TD}>
                    <Pill tone={CLAIM_TONE[claim.status]}>{claim.statusLabel}</Pill>
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      {claim.status === 'disputed' ? (
                        <ConsoleButton className="h-[30px] border-publine text-brandink">
                          {c.arbitrate}
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
          summary={fill(c.showing, { from: 1, to: claims.length, total: CLAIM_TOTAL })}
          pages={[1, 2]}
          activePage={1}
          labels={t.admin.actions}
        />
      </Panel>
    </div>
  );
}
