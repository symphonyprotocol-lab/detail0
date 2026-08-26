import type { Metadata } from 'next';
import { FilterSelect } from '@/components/admin/list-controls';
import {
  ConsoleButton,
  ConsoleNotice,
  ConsolePageHeader,
  EmptyRow,
  ExportLink,
  IconButton,
  ListToolbar,
  Panel,
  Pill,
  TabBar,
  TableScroller,
  TD,
  TH,
  TitleCell,
} from '@/components/admin/ui';
import { EllipsisIcon, EyeIcon, ScaleIcon } from '@/components/ui/icons';
import { listClaims, type ClaimFilter } from '@/lib/application/administration';
import { requireAdminCapability } from '@/lib/http/admin';
import { fill } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { oneOf, PAGE_SIZE, searchTerm, utcStamp } from '../list-params';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.claims.title };
}

const FILTERS: ClaimFilter[] = ['all', 'pending', 'claimed', 'revoked', 'disputed', 'expired'];

const CLAIM_TONE: Record<string, 'warn' | 'ok' | 'danger' | 'neutral'> = {
  pending: 'warn',
  verified: 'ok',
  failed: 'danger',
  expired: 'neutral',
  revoked: 'neutral',
};

/**
 * Ownership claims and disputes -- design source frame `z9DJOF`.
 *
 * `claim_status` has no `disputed` value, and should not: requirement.md 7.3
 * defines a dispute as a claim opened on a library that already has an owner,
 * which is a fact about the pair rather than a state of the claim. The tab
 * derives it.
 */
export default async function AdminClaimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, params, t] = await Promise.all([
    requireAdminCapability('libraries'),
    searchParams,
    getMessages(),
  ]);
  const c = t.admin.claims;
  const f = t.admin.filters;
  const query = searchTerm(params.q);
  const status = oneOf(params.status, FILTERS, 'all');

  const { rows, total, counts } = await listClaims({ query, status, limit: PAGE_SIZE });

  const href = (next: ClaimFilter) => {
    const search = new URLSearchParams();
    if (query) search.set('q', query);
    if (next !== 'all') search.set('status', next);
    return `/admin/claims${search.size > 0 ? `?${search.toString()}` : ''}`;
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={c.title} description={c.description} />

      <TabBar
        activeId={status}
        tabs={[
          { id: 'all', label: c.tabs.all, count: counts.all, href: href('all') },
          { id: 'pending', label: c.tabs.pending, count: counts.pending, href: href('pending') },
          { id: 'claimed', label: c.tabs.claimed, count: counts.claimed, href: href('claimed') },
          { id: 'revoked', label: c.tabs.revoked, count: counts.revoked, href: href('revoked') },
          { id: 'disputed', label: c.tabs.disputed, count: counts.disputed, href: href('disputed') },
        ]}
      />

      {/*
        requirement.md 7.3 and 5.3: ownership only follows source verification,
        and an arbitration has to record what it decided on.
      */}
      <ConsoleNotice icon={<ScaleIcon size={18} />} title={c.ruleTitle} body={c.rule} />

      <Panel>
        <form method="get">
          <ListToolbar placeholder={c.searchPlaceholder} name="q" defaultValue={query}>
            <FilterSelect
              name="status"
              label={f.label}
              value={status}
              options={[
                { id: 'all', label: f.all },
                { id: 'pending', label: f.claimPending },
                { id: 'claimed', label: f.claimClaimed },
                { id: 'revoked', label: f.claimRevoked },
                { id: 'disputed', label: f.claimDisputed },
                { id: 'expired', label: f.claimExpired },
              ]}
            />
            <ConsoleButton type="submit">{t.admin.administrators.searchSubmit}</ConsoleButton>
            <ExportLink resource="claims" query={query} status={status} label={t.admin.actions.export} />
          </ListToolbar>
        </form>

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
              {rows.length === 0 ? (
                <EmptyRow
                  columns={c.columns.length + 1}
                  message={c.empty}
                  note={counts.all === 0 ? t.admin.notReady.claims : undefined}
                />
              ) : null}
              {rows.map((claim) => (
                <tr key={claim.id} className="border-t-2 border-line">
                  <td className={TD}>
                    <TitleCell title={claim.libraryTitle} meta={claim.libraryPublicId} />
                  </td>
                  <td className={TD}>{claim.claimantName || '—'}</td>
                  <td className={`${TD} whitespace-nowrap`}>{claim.method}</td>
                  <td className={`${TD} whitespace-nowrap`}>{utcStamp(claim.openedAt)}</td>
                  <td className={TD}>{claim.currentOwner ?? t.adminDemo.unclaimed}</td>
                  <td className={TD}>
                    <Pill tone={CLAIM_TONE[claim.status] ?? 'neutral'}>{claim.status}</Pill>
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
            {fill(c.showing, { from: rows.length === 0 ? 0 : 1, to: rows.length, total })}
          </p>
        </div>
      </Panel>
    </div>
  );
}
