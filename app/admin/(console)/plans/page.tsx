import type { Metadata } from 'next';
import {
  ConsolePageHeader,
  Panel,
  PanelHead,
  Pill,
  TableScroller,
  TD,
  TH,
} from '@/components/admin/ui';
import { CheckIcon, PencilIcon } from '@/components/ui/icons';
import { adminCopy } from '@/lib/admin/demo-data';
import { requireAdminCapability } from '@/lib/http/admin';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.plans.title };
}

/**
 * Plan configuration -- design source frame `WHlyq`.
 *
 * Three tiers and no more: Free, Pro and the Additional Calls pack, all priced
 * in USD (requirement.md 4.1, 5.3). There is deliberately no Enterprise card
 * to add.
 */
export default async function AdminPlansPage() {
  await requireAdminCapability('plans');
  const t = await getMessages();
  const p = t.admin.plans;
  const { plans, quotaRows } = adminCopy(t);

  return (
    <div className="flex flex-col gap-[18px]">
      <ConsolePageHeader eyebrow={t.admin.eyebrow} title={p.title} description={p.description} />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={`flex flex-col gap-[17px] rounded-[10px] border-2 p-[19px] ${
              plan.dark
                ? 'border-consoledeep bg-consoledeep'
                : plan.featured
                  ? 'border-publine bg-card'
                  : 'border-line bg-card'
            }`}
          >
            <header className="flex items-start justify-between gap-3">
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span
                    className={`text-[14px] leading-[1.3] font-semibold tracking-[-0.025em] ${
                      plan.dark ? 'text-white' : 'text-ink'
                    }`}
                  >
                    {plan.name}
                  </span>
                  {plan.featured ? <Pill tone="brand">{p.recommended}</Pill> : null}
                </span>
                <span
                  className={`text-[11px] tracking-[-0.023em] ${
                    plan.dark ? 'text-consoletext' : 'text-muted'
                  }`}
                >
                  {plan.tagline}
                </span>
              </span>
              <span className="flex items-baseline gap-1">
                <span
                  className={`text-[19px] leading-[1.3] font-semibold tracking-[-0.03em] ${
                    plan.dark ? 'text-white' : 'text-ink'
                  }`}
                >
                  {plan.price}
                </span>
                {plan.period ? (
                  <span
                    className={`text-[11px] tracking-[-0.023em] ${
                      plan.dark ? 'text-consoletext' : 'text-muted'
                    }`}
                  >
                    {plan.period}
                  </span>
                ) : null}
              </span>
            </header>

            <ul className="flex flex-1 flex-col gap-2.5">
              {plan.perks.map((perk) => (
                <li
                  key={perk}
                  className={`flex items-center gap-2 text-[12px] tracking-[-0.023em] ${
                    plan.dark ? 'text-consoletext' : 'text-steel'
                  }`}
                >
                  <CheckIcon size={14} className={plan.dark ? 'text-mint' : 'text-brand'} />
                  {perk}
                </li>
              ))}
            </ul>

            <button
              type="button"
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border-2 text-[12px] font-medium tracking-[-0.023em] transition-colors ${
                plan.dark
                  ? 'border-white/16 bg-white/8 text-white hover:bg-white/14'
                  : 'border-line bg-card text-steel hover:bg-subtle'
              }`}
            >
              <PencilIcon size={13} />
              {p.editPlan}
            </button>
          </article>
        ))}
      </section>

      <Panel>
        <PanelHead
          title={p.quotaTitle}
          description={p.quotaSubtitle}
          action={<Pill tone="ok">{p.saved}</Pill>}
        />

        <TableScroller>
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr>
                {p.quotaColumns.map((column) => (
                  <th key={column} scope="col" className={TH}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotaRows.map((row) => (
                <tr key={row.label} className="border-t-2 border-line">
                  <th scope="row" className={`${TD} font-semibold text-ink`}>
                    {row.label}
                  </th>
                  <td className={TD}>{row.free}</td>
                  <td className={TD}>{row.pro}</td>
                  <td className={TD}>{row.addon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>

        <p className="border-t-2 border-line px-[15px] py-3 text-[11px] leading-[1.6] tracking-[-0.023em] text-muted">
          {p.immutableNote}
        </p>
      </Panel>
    </div>
  );
}
