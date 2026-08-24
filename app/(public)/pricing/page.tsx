import type { Metadata } from 'next';
import { Button, Card, Chip, SectionHeading } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: '定价',
  description: '只按 API Call 计费，不按 Token 计费。Free 每月 1,000 Calls，Pro $5 / 月。',
};

const PLANS = [
  {
    id: 'free',
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
    kicker: '持续使用',
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
  ['Calls 有效期', '当账期', '当账期', '不过期'],
  ['公开知识库', '全部可用', '全部可用', '沿用 Pro 权限'],
  ['自建知识库', '最多 5 个', '最多 25 个', '沿用 Pro 权限'],
  ['单个知识库容量', '20 MB', '100 MB', '沿用 Pro 权限'],
  ['有效 API Key', '3 个', '20 个', '沿用 Pro 权限'],
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
    a: '新的计费调用会暂停。Pro 用户购买额外调用包后即可继续使用。扣减顺序固定为先套餐额度、后调用包余额。',
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
    a: '不会。已发布版本的上链存证由平台自动完成，不计入 API Call 额度。存证只证明版本内容与时间，不构成对内容正确性的保证。',
  },
  {
    q: '我提交的公开知识库能拿到分成吗？',
    a: '完成认领后可以。按被成功检索的次数从平台收入中分成，初始分成率 20%，按调用量线性分配，不按 Trust Score 加权。私有库和平台自建库不参与。',
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto w-full max-w-[918px] px-5 pt-11 pb-14">
        <SectionHeading eyebrow="PLANS" title="选择适合你的调用额度" as="h1" size="lg" />
        <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.7] text-muted">
          只按 API Call 计费，不按 Token 计费；公开知识库无需逐库购买。所有套餐使用同一套 REST API 与
          MCP。
        </p>

        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`flex flex-col p-6 ${plan.featured ? 'border-brand shadow-[0_10px_30px_rgba(0,187,167,0.10)]' : ''}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold tracking-[0.04em] text-muted">
                  {plan.kicker}
                </p>
                {plan.featured ? <Chip tone="brand">推荐</Chip> : null}
              </div>
              <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.03em] text-ink">
                {plan.name}
              </h3>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[34px] leading-none font-semibold tracking-[-0.04em] text-ink">
                  {plan.price}
                </span>
                <span className="text-[13px] text-muted">{plan.unit}</span>
              </p>
              <p className="mt-3 text-[13px] font-semibold text-brandink">{plan.calls}</p>
              <p className="mt-3 text-[12.5px] leading-[1.7] text-muted">{plan.blurb}</p>
              <ul className="mt-5 flex flex-col gap-2.5 text-[12.5px] text-muted">
                {plan.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                    {p}
                  </li>
                ))}
              </ul>
              <Button
                href={plan.href}
                variant={plan.featured ? 'primary' : 'outline'}
                className="mt-6 w-full"
              >
                {plan.cta}
              </Button>
            </Card>
          ))}
        </div>

        <p className="mt-5 text-[12px] text-faint">
          一次成功受理的 API 或 MCP 查询 = 1 API Call；返回内容长度不会改变价格。
        </p>
      </section>

      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-12 pb-14">
        <SectionHeading eyebrow="COMPARE" title="套餐能力一目了然" />
        <p className="mt-3 text-[13px] text-muted">价格以美元计，按月度账期计算</p>

        <div className="mt-6 overflow-hidden rounded-lg border-2 border-line bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b-2 border-line bg-subtle text-[10px] font-semibold tracking-[0.04em] text-muted">
                  <th className="px-4 py-3 font-semibold">能力</th>
                  <th className="px-4 py-3 font-semibold">FREE</th>
                  <th className="px-4 py-3 font-semibold">PRO</th>
                  <th className="px-4 py-3 font-semibold">ADDITIONAL CALLS</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr
                    key={row[0]}
                    className={i === COMPARE.length - 1 ? '' : 'border-b-2 border-line'}
                  >
                    <td className="px-4 py-3 text-[12.5px] text-muted">{row[0]}</td>
                    <td className="px-4 py-3 text-[12.5px] font-medium text-ink">{row[1]}</td>
                    <td className="px-4 py-3 text-[12.5px] font-medium text-ink">{row[2]}</td>
                    <td className="px-4 py-3 text-[12.5px] text-muted">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-12 pb-16">
        <SectionHeading eyebrow="FAQ" title="关于 API Call 计费" />
        <p className="mt-3 text-[13px] text-muted">
          计费规则不受返回内容长度、Chunk 数量或缓存状态影响。
        </p>
        <dl className="mt-7 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.q} className="border-t-2 border-line pt-4">
              <dt className="text-[13.5px] font-semibold tracking-[-0.02em] text-ink">{item.q}</dt>
              <dd className="mt-2 text-[12.5px] leading-[1.75] text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
