import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { SectionHeading } from '@/components/ui/primitives';
import {
  ArrowRightIcon,
  CheckIcon,
  CircleHelpIcon,
  GiftIcon,
  PackagePlusIcon,
  SparklesIcon,
} from '@/components/ui/icons';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { pricing } = await getMessages();
  return { title: pricing.metaTitle, description: pricing.metaDescription };
}

/** Identity, price and icon per plan; the words come from the dictionary. */
const PLAN_FACTS = [
  { id: 'free', name: 'Free', price: '$0', icon: <GiftIcon size={18} />, featured: false },
  { id: 'pro', name: 'Pro', price: '$5', icon: <SparklesIcon size={18} />, featured: true },
  {
    id: 'addon',
    name: 'Additional Calls',
    price: '$5',
    icon: <PackagePlusIcon size={18} />,
    featured: false,
  },
] as const;

/** The grey banner that closes a run of sections; teal is left to its accents. */
function CtaBanner({
  eyebrow,
  title,
  cta,
  href,
  className = '',
}: {
  eyebrow: string;
  title: string;
  cta: string;
  href: string;
  /** Spacing above, when the preceding section does not already provide it. */
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1080px] px-5 ${className}`}>
      <section className="flex flex-wrap items-center justify-between gap-7 rounded-[11px] bg-panel px-10 py-[34px] shadow-[0_4px_10px_rgba(45,45,83,0.06)] md:h-[150px] md:flex-nowrap md:py-0">
        <div className="flex flex-col gap-[11px] pt-2">
          <p className="text-[11px] font-bold tracking-[-0.03em] text-brand">{eyebrow}</p>
          <h2 className="text-[25px] leading-[1.5] font-semibold tracking-[-0.04em] text-ink">
            {title}
          </h2>
        </div>
        <Link
          href={href}
          className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-brand px-[18px] text-sm font-medium tracking-[-0.03em] text-onbrand transition-colors hover:bg-brand/90"
        >
          {cta}
          <ArrowRightIcon size={15} />
        </Link>
      </section>
    </div>
  );
}

export default async function PricingPage() {
  const { pricing: p } = await getMessages();
  const plans = PLAN_FACTS.map((facts) => ({ ...facts, ...p.plans[facts.id] }));

  return (
    <>
      {/*
        * Plans and the comparison table share one tinted band. The negative
        * margin pulls it up behind the floating header capsule (54px pill plus
        * its 12px gutters) and the matching padding puts the content back, so
        * the tint starts at the very top of the page rather than under the
        * header.
        */}
      <div className="-mt-[78px] bg-subtle pt-[78px]">
        <section className="mx-auto w-full max-w-[1080px] px-5 pt-[50px] pb-[70px]">
          <SectionHeading
            eyebrow="PLANS"
            title={p.title}
            as="h1"
            action={<p className="text-[11px] tracking-[-0.03em] text-muted">{p.headerNote}</p>}
          />

          <div className="mt-3.5 grid gap-3.5 md:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`flex flex-col rounded-lg border-2 bg-card p-6 ${
                  plan.featured
                    ? 'border-brand/70 shadow-[0_4px_10px_rgba(45,45,83,0.12),0_1px_1px_rgba(45,45,83,0.12)]'
                    : 'border-line shadow-[0_4px_10px_rgba(45,45,83,0.06)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border-2 border-brandline bg-brandsoft text-brand">
                    {plan.icon}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold tracking-[-0.03em] whitespace-nowrap ${
                      plan.featured ? 'bg-brand text-onbrand' : 'bg-brandsoft text-brandink'
                    }`}
                  >
                    {plan.kicker}
                  </span>
                </div>

                <h3 className="mt-[23px] text-[18px] leading-[1.5] font-semibold tracking-[-0.03em] text-ink">
                  {plan.name}
                </h3>

                <p className="mt-[9px] flex items-end gap-[7px]">
                  <span className="text-[48px] leading-none font-semibold tracking-[-0.055em] text-ink">
                    {plan.price}
                  </span>
                  <span className="pb-1.5 text-[11px] tracking-[-0.03em] text-muted">{plan.unit}</span>
                </p>

                <p className="mt-3.5 self-start rounded-md bg-mutedbg px-[9px] py-1.5 text-[16px] leading-[1.5] tracking-[-0.02em] text-steel">
                  {plan.calls}
                </p>

                <p className="mt-3.5 min-h-10 text-[12px] leading-[1.65] tracking-[-0.03em] text-muted">
                  {plan.blurb}
                </p>

                <ul className="mt-[17px] flex flex-col gap-[11px] border-t-2 border-line pt-[19px] text-[11px] leading-[1.5] tracking-[-0.03em] text-steel">
                  {plan.points.map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <CheckIcon size={14} className="text-brand" />
                      {point}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-[22px]">
                  <Link
                    href="/login"
                    className={`flex h-10 items-center justify-center gap-2 rounded-full text-sm font-medium tracking-[-0.03em] transition-colors ${
                      plan.featured
                        ? 'bg-brand text-onbrand hover:bg-brand/90'
                        : 'border-2 border-line bg-surface text-ink hover:bg-subtle'
                    }`}
                  >
                    {plan.cta}
                    <ArrowRightIcon size={14} />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-3.5 flex items-center justify-center gap-2 rounded-lg border-2 border-line bg-brandsoft/60 px-[17px] py-[15px] text-center text-[11px] leading-[1.5] tracking-[-0.03em] text-steel">
            <span aria-hidden className="font-semibold text-brand">
              $
            </span>
            {p.callNote}
          </p>
        </section>

        <div className="mx-auto w-full max-w-[1080px] px-5 pt-16 pb-18">
          <SectionHeading
            eyebrow="COMPARE"
            title={p.compareTitle}
            action={<p className="text-[11px] tracking-[-0.03em] text-muted">{p.compareNote}</p>}
          />

          <div className="mt-[25px] overflow-hidden rounded-[9px] border-2 border-line bg-card p-0.5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed text-left">
                <colgroup>
                  <col className="w-[32.2%]" />
                  <col className="w-[22.2%]" />
                  <col className="w-[22.2%]" />
                  <col className="w-[23.4%]" />
                </colgroup>
                <thead>
                  <tr className="h-[42px] border-b-2 border-line bg-mutedbg text-[10px] tracking-[-0.03em] text-muted">
                    <th className="px-[17px] font-normal">{p.compareHeadCapability}</th>
                    <th className="px-[17px] font-bold">FREE</th>
                    <th className="px-[17px] font-semibold text-brandink">PRO</th>
                    <th className="px-[17px] font-bold">ADDITIONAL CALLS</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] tracking-[-0.03em]">
                  {p.compare.map((row, i) => (
                    <tr
                      key={row[0]}
                      className={`h-[54px] ${i === p.compare.length - 1 ? '' : 'border-b-2 border-line'}`}
                    >
                      <td className="px-[17px] font-semibold text-ink">{row[0]}</td>
                      <td className="px-[17px] text-steel">{row[1]}</td>
                      <td className="px-[17px] font-semibold text-brandink">{row[2]}</td>
                      <td className="px-[17px] text-steel">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/*
        * The compare band ends in a hard rule, so this banner needs the breathing
        * room the FAQ's bottom padding gives the one below it.
        */}
      <CtaBanner
        eyebrow={p.shareBanner.eyebrow}
        title={p.shareBanner.title}
        cta={p.shareBanner.cta}
        href="/docs/claiming"
        className="mt-[68px]"
      />

      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-10 px-5 py-[68px] md:flex-row md:gap-[72px]">
        <div className="md:w-[300px] md:shrink-0">
          <CircleHelpIcon size={20} className="text-brand" />
          <p className="mt-[13px] text-[10px] font-extrabold tracking-[0.1em] text-brand">FAQ</p>
          <h2 className="mt-[7px] text-[28px] leading-[1.5] font-semibold tracking-[-0.04em] text-ink">
            {p.faqTitle}
          </h2>
          <p className="mt-2.5 text-[12px] leading-[1.65] tracking-[-0.03em] text-muted">
            {p.faqNote}
          </p>
        </div>

        <dl className="min-w-0 flex-1 border-t-2 border-line pt-0.5">
          {p.faq.map((item) => (
            <div key={item.q} className="flex flex-col gap-[7px] border-b-2 border-line pt-[18px] pb-5">
              <dt className="text-[13px] leading-[1.5] font-semibold tracking-[-0.03em] text-ink">
                {item.q}
              </dt>
              <dd className="text-[11px] leading-[1.65] tracking-[-0.03em] text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <CtaBanner
        eyebrow={p.freeBanner.eyebrow}
        title={p.freeBanner.title}
        cta={p.freeBanner.cta}
        href="/libraries"
      />

      <div aria-hidden className="h-[62px]" />
    </>
  );
}
