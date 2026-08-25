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

export const metadata: Metadata = {
  title: '定价',
  description: '只按 API Call 计费，不按 Token 计费。Free 每月 1,000 Calls，Pro $5 / 月。',
};

const PLANS: {
  id: string;
  icon: ReactNode;
  kicker: string;
  name: string;
  price: string;
  unit: string;
  calls: string;
  blurb: string;
  points: string[];
  cta: string;
  href: string;
  featured: boolean;
}[] = [
  {
    id: 'free',
    icon: <GiftIcon size={18} />,
    kicker: '轻量体验',
    name: 'Free',
    price: '$0',
    unit: '永久免费',
    calls: '每月 1,000 API Calls',
    blurb: '适合验证想法和个人轻量项目，可从免费额度开始构建知识库。',
    points: ['最多自建 5 个知识库', '每个知识库最大 20 MB', '查询全部公开知识库'],
    cta: '免费开始',
    href: '/login',
    featured: false,
  },
  {
    id: 'pro',
    icon: <SparklesIcon size={18} />,
    kicker: '推荐',
    name: 'Pro',
    price: '$5',
    unit: '/ 月',
    calls: '每月 5,000 API Calls',
    blurb: '适合持续使用，并需要更多知识库和更大内容容量的用户。',
    points: ['最多自建 25 个知识库', '每个知识库最大 100 MB', '包含 Free 全部能力'],
    cta: '升级 Pro',
    href: '/login',
    featured: true,
  },
  {
    id: 'addon',
    icon: <PackagePlusIcon size={18} />,
    kicker: '仅 Pro 可用',
    name: 'Additional Calls',
    price: '$5',
    unit: '/ 包',
    calls: '+5,000 API Calls',
    blurb: '当前账期额度不足时按需加购，不改变已有 Pro 套餐。',
    points: ['每包增加 5,000 Calls', '购买后立即加入可用额度', '余额不过期，用完为止'],
    cta: '购买调用包',
    href: '/login',
    featured: false,
  },
];

const COMPARE: [string, string, string, string][] = [
  ['月度价格', '$0', '$5', '$5 / 包'],
  ['包含 API Calls', '1,000 / 月', '5,000 / 月', '+5,000'],
  ['公开知识库', '全部可用', '全部可用', '沿用 Pro 权限'],
  ['自建知识库', '最多 5 个', '最多 25 个', '沿用 Pro 权限'],
  ['单个知识库容量', '20 MB', '100 MB', '沿用 Pro 权限'],
  ['版本存证', '全部包含', '全部包含', '沿用 Pro 权限'],
  ['额外调用包', '—', '可购买', '本身即调用包'],
  ['Token 费用', '$0', '$0', '$0'],
];

const FAQ = [
  {
    q: '一次 API Call 如何计算？',
    a: '一次成功受理的 API 或 MCP 查询计为 1 Call，与返回多少 Chunk 或 Token 无关。',
  },
  {
    q: '公开知识库需要单独购买吗？',
    a: '不需要。所有公开知识库都可查询，只会消耗当前套餐中的 API Call 额度。',
  },
  {
    q: 'Calls 用完后会发生什么？',
    a: '新的计费调用会暂停。Pro 用户购买额外调用包后即可继续使用。',
  },
  {
    q: '额外调用包会自动续费吗？',
    a: '不会。每个调用包一次性增加 5,000 Calls，余额不过期，也不改变现有套餐。',
  },
  {
    q: '自建知识库有哪些限制？',
    a: 'Free 最多自建 5 个知识库，每个不超过 20 MB；Pro 最多自建 25 个知识库，每个不超过 100 MB。',
  },
  {
    q: '版本存证会消耗 Call 吗？',
    a: '不会。已发布版本的上链存证由平台自动完成，不计入 API Call 额度，Free 与 Pro 都可使用。存证只证明版本内容与时间，不构成对内容正确性的保证。',
  },
  {
    q: '我提交的公开知识库能拿到分成吗？',
    a: '可以。通过审核发布的公开知识库，按被成功检索的次数从平台收入中分成，初始分成率 20%，按调用量线性分配，不按 Trust Score 加权。私有库和平台自建库不参与。分成不改变你作为调用方的价格。',
  },
];

/** The teal-washed banner the design source uses to close a run of sections. */
function CtaBanner({
  eyebrow,
  title,
  cta,
  href,
}: {
  eyebrow: string;
  title: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[918px] px-5">
      <section className="flex flex-wrap items-center justify-between gap-7 rounded-[11px] border-2 border-[#a6d9d5] bg-card bg-[linear-gradient(120deg,rgba(228,242,242,0.78)_0%,rgba(228,242,242,0)_65%)] px-10 py-[34px] shadow-[0_4px_10px_rgba(45,45,83,0.06)] md:h-[150px] md:flex-nowrap md:py-0">
        <div className="flex flex-col gap-[11px] pt-2">
          <p className="text-[11px] font-bold tracking-[-0.03em] text-brand">{eyebrow}</p>
          <h2 className="text-[25px] leading-[1.5] font-semibold tracking-[-0.04em] text-ink">
            {title}
          </h2>
        </div>
        <Link
          href={href}
          className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-brand px-[18px] text-sm font-medium tracking-[-0.03em] text-white transition-colors hover:bg-brand/90"
        >
          {cta}
          <ArrowRightIcon size={15} />
        </Link>
      </section>
    </div>
  );
}

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto w-full max-w-[918px] px-5 pt-[50px] pb-[70px]">
        <SectionHeading
          eyebrow="PLANS"
          title="选择适合你的调用额度"
          as="h1"
          action={
            <p className="text-[11px] tracking-[-0.03em] text-muted">
              所有套餐使用同一套 REST API 与 MCP
            </p>
          }
        />

        <div className="mt-3.5 grid gap-3.5 md:grid-cols-3">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`flex flex-col rounded-lg border-2 bg-card p-6 ${
                plan.featured
                  ? 'border-[#46c8bb] shadow-[0_4px_10px_rgba(45,45,83,0.12),0_1px_1px_rgba(45,45,83,0.12)]'
                  : 'border-line shadow-[0_4px_10px_rgba(45,45,83,0.06)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border-2 border-[#a3d9d5] bg-brandsoft text-brand">
                  {plan.icon}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold tracking-[-0.03em] whitespace-nowrap ${
                    plan.featured ? 'bg-brand text-white' : 'bg-brandsoft text-brandink'
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
                  href={plan.href}
                  className={`flex h-10 items-center justify-center gap-2 rounded-full text-sm font-medium tracking-[-0.03em] transition-colors ${
                    plan.featured
                      ? 'bg-brand text-white hover:bg-brand/90'
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
          一次成功受理的 API 或 MCP 查询 = 1 API Call；返回内容长度不会改变价格。
        </p>
      </section>

      <div className="border-y-2 border-line bg-[#f6fafc]">
        <div className="mx-auto w-full max-w-[918px] px-5 pt-16 pb-18">
          <SectionHeading
            eyebrow="COMPARE"
            title="套餐能力一目了然"
            action={
              <p className="text-[11px] tracking-[-0.03em] text-muted">
                价格以美元计，按月度账期计算
              </p>
            }
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
                    <th className="px-[17px] font-normal">能力</th>
                    <th className="px-[17px] font-bold">FREE</th>
                    <th className="px-[17px] font-semibold text-brandink">PRO</th>
                    <th className="px-[17px] font-bold">ADDITIONAL CALLS</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] tracking-[-0.03em]">
                  {COMPARE.map((row, i) => (
                    <tr
                      key={row[0]}
                      className={`h-[54px] ${i === COMPARE.length - 1 ? '' : 'border-b-2 border-line'}`}
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

      <CtaBanner
        eyebrow="发布者分成"
        title="让维护知识库这件事有回报。"
        cta="了解分成规则"
        href="/docs/claiming"
      />

      <section className="mx-auto flex w-full max-w-[918px] flex-col gap-10 px-5 py-[68px] md:flex-row md:gap-[72px]">
        <div className="md:w-[300px] md:shrink-0">
          <CircleHelpIcon size={20} className="text-brand" />
          <p className="mt-[13px] text-[10px] font-extrabold tracking-[0.1em] text-brand">FAQ</p>
          <h2 className="mt-[7px] text-[28px] leading-[1.5] font-semibold tracking-[-0.04em] text-ink">
            关于 API Call 计费
          </h2>
          <p className="mt-2.5 text-[12px] leading-[1.65] tracking-[-0.03em] text-muted">
            计费规则不受返回内容长度、Chunk 数量或缓存状态影响。
          </p>
        </div>

        <dl className="min-w-0 flex-1 border-t-2 border-line pt-0.5">
          {FAQ.map((item) => (
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
        eyebrow="从免费额度开始"
        title="先验证价值，再决定是否升级。"
        cta="免费查询公开知识库"
        href="/libraries"
      />

      <div aria-hidden className="h-[62px]" />
    </>
  );
}
