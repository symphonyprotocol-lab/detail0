import Link from 'next/link';
import { Button, Card, Chip, SectionHeading } from '@/components/ui/primitives';
import { LibraryTable } from '@/components/site/library-table';
import { CATALOG } from '@/lib/site/demo-data';

const HERO_POINTS = ['公开库免费查询', '每条结果保留引用', 'API 与 MCP 同一套规则'];

const SURFACES = ['Claude', 'Codex', 'Cursor', 'REST API', 'MCP'];

const PROOF = [
  {
    title: '版本存证',
    body: '每个已发布版本的内容摘要按小时聚合，写入 Aptos 主网。版本一旦发布，内容和时间都无法被平台悄悄改写。',
  },
  {
    title: '审计锚定',
    body: '平台管理操作的审计链每日写入链上。即使是数据库管理员，也无法无痕修改历史审计记录。',
  },
  {
    title: '独立验证',
    body: '公开验证工具不调用 recall0 任何接口。任何人都能用链上数据自行校验引用来自哪个版本。',
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="site-wash">
        <div className="mx-auto w-full max-w-[918px] px-5 pt-16 pb-14 text-center sm:pt-[72px]">
          <Chip tone="brand">经过验证、持续更新、可追溯</Chip>
          <h1 className="mx-auto mt-6 max-w-[16ch] text-[38px] leading-[1.06] font-semibold tracking-[-0.05em] text-ink sm:text-[48px]">
            可信知识，
            <br />
            为每一个 AI Agent 而生
          </h1>
          <p className="mx-auto mt-5 max-w-[54ch] text-[15px] leading-[1.7] text-muted sm:text-[17px]">
            搜索公开知识库，把带版本、来源与引用的最新上下文接入 Claude、Codex、Cursor 或你自己的
            Agent。
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <div className="flex h-12 items-center gap-3 rounded-lg bg-inkdeep pr-3 pl-[18px]">
              <code className="font-mono text-[12px] text-[#e4edee]">$ npx recall0 setup</code>
              <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-[#b8d4d5]">
                安装
              </span>
            </div>
            <Link
              href="/login"
              className="inline-flex h-12 items-center rounded-full border-2 border-line bg-card px-5 text-[14px] font-medium text-ink transition-colors hover:bg-subtle"
            >
              获取 API Key
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[11px] text-muted">
            {HERO_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Knowledge directory */}
      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-13 pb-16">
        <SectionHeading
          eyebrow="KNOWLEDGE DIRECTORY"
          title="探索专业知识库，找到刚好够用的上下文"
          action={<Button href="/libraries/claim">提交知识库</Button>}
        />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-lg border-2 border-line bg-card px-4 shadow-[0_4px_10px_rgba(45,45,83,0.06)]">
            <span aria-hidden className="text-muted">
              ⌕
            </span>
            <input
              placeholder="搜索名称、领域或 Library ID…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/70"
            />
            <kbd className="rounded border-2 border-line bg-mutedbg px-1.5 py-0.5 text-[11px] text-muted">
              ⌘ K
            </kbd>
          </label>
          <div className="flex h-[46px] items-center gap-1 rounded-lg border-2 border-line bg-card p-1">
            <span className="rounded-md bg-brandsoft px-3 py-1.5 text-[12px] font-medium text-brandink">
              热门
            </span>
            <span className="rounded-md px-3 py-1.5 text-[12px] font-medium text-muted">
              最近更新
            </span>
          </div>
        </div>

        <div className="mt-4">
          <LibraryTable entries={CATALOG.slice(0, 6)} showAnchor={false} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <p className="text-faint">显示 6 个公开知识库示例</p>
          <Link href="/libraries" className="font-semibold text-brandink hover:underline">
            查看完整目录 →
          </Link>
        </div>
      </section>

      {/* Surfaces */}
      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 py-11">
        <p className="text-center text-[15px] font-medium tracking-[-0.02em] text-ink">
          一次接入，让可信知识在你的工作流中保持一致
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {SURFACES.map((s) => (
            <li
              key={s}
              className="rounded-full border-2 border-line bg-card px-4 py-2 text-[12.5px] text-muted"
            >
              {s}
            </li>
          ))}
        </ul>
      </section>

      {/* On-chain proof */}
      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-13 pb-16">
        <SectionHeading eyebrow="ON-CHAIN PROOF" title="每个版本都能被独立验证，不必先相信平台" />
        <div className="mt-7 grid gap-7 sm:grid-cols-3">
          {PROOF.map((item) => (
            <div key={item.title} className="border-t-2 border-line pt-4">
              <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-ink">{item.title}</h3>
              <p className="mt-2 text-[12.5px] leading-[1.7] text-muted">{item.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-7 text-[11.5px] leading-[1.7] text-faint">
          存证证明的是「某个时刻的内容就是这一份」，不构成对内容正确性的保证。存证不消耗调用额度，Free
          与 Pro 都可使用。
        </p>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-[918px] px-5 pb-16">
        <Card className="flex flex-col items-start justify-between gap-6 bg-gradient-to-r from-card to-brandsoft/40 px-10 py-9 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-ink">
              从一次可追溯的查询开始
            </h2>
            <p className="mt-1.5 text-[13px] text-muted">让 Agent 少一点猜测，多一点依据。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href="/pricing" variant="outline">
              查看定价
            </Button>
            <Button href="/libraries">浏览知识库目录</Button>
          </div>
        </Card>
      </section>
    </>
  );
}
