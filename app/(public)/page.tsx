import Link from 'next/link';
import { Button, SectionHeading } from '@/components/ui/primitives';
import { ClaudeIcon, CodexIcon, CursorIcon, McpIcon } from '@/components/ui/brand-icons';
import { LibraryTable } from '@/components/site/library-table';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BracesIcon,
  CircleCheckIcon,
  ClockIcon,
  CopyIcon,
  KeyIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@/components/ui/icons';
import { CATALOG } from '@/lib/site/demo-data';

const HERO_POINTS = ['公开库免费查询', '每条结果保留引用', 'API 与 MCP 同一套规则'];

/** Vendor logomarks where the surface has one; the design source's glyph otherwise. */
const SURFACES = [
  { label: 'Claude', Icon: ClaudeIcon },
  { label: 'Codex', Icon: CodexIcon },
  { label: 'Cursor', Icon: CursorIcon },
  { label: 'REST API', Icon: BracesIcon },
  { label: 'MCP', Icon: McpIcon },
];

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
    body: '公开验证工具不调用 Recall0 任何接口。任何人都能用链上数据自行校验引用来自哪个版本。',
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero -- geometry, type and icons follow the design source frame `hRx0w`. */}
      <section className="site-wash">
        <div className="mx-auto flex w-full max-w-[918px] flex-col items-center px-5 pt-[72px] pb-[62px]">
          <p className="flex w-full items-center gap-[7px] text-[12px] leading-[1.5] font-[650] text-brandink">
            <ShieldCheckIcon size={15} />
            经过验证、持续更新、可追溯
          </p>

          <h1 className="mt-4 text-[38px] leading-[1.04] font-[650] tracking-[-0.052em] text-ink sm:text-[48px]">
            可信知识，
            <br />
            为每一个 AI Agent 而生
          </h1>

          <p className="mt-[18px] w-[680px] max-w-full text-[17px] leading-[1.7] tracking-[-0.025em] text-muted">
            搜索公开知识库，把带版本、来源与引用的最新上下文接入 Claude、Codex、Cursor 或你自己的
            Agent。
          </p>

          <div className="mt-6 flex w-full flex-wrap items-center gap-2.5">
            <div className="flex h-12 items-center gap-[92px] rounded-lg border-2 border-[#10292c] bg-inkdeep py-0.5 pr-[11px] pl-[18px] shadow-[0_4px_10px_rgba(45,45,83,0.12),0_1px_1px_rgba(45,45,83,0.12)]">
              <code className="font-mono text-[12px] tracking-[-0.03em] text-[#e4edee]">
                $ npx recall0 setup
              </code>
              <span className="flex h-7 items-center gap-1.5 border-l-2 border-[#294043] pr-[9px] pl-[11px] text-[#b8d4d5]">
                <CopyIcon size={15} />
                <span className="text-[11px] tracking-[-0.029em]">安装</span>
              </span>
            </div>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border-2 border-line bg-card px-5 text-[14px] font-medium tracking-[-0.029em] text-ink transition-colors hover:bg-subtle"
            >
              <KeyIcon />
              获取 API Key
            </Link>
          </div>

          <ul className="mt-5 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-[11px] tracking-[-0.029em] text-muted">
            {HERO_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <CircleCheckIcon size={14} className="text-brand" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Knowledge directory -- design source frame `EG2Gu`. */}
      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-13 pb-[70px]">
        <SectionHeading
          eyebrow="KNOWLEDGE DIRECTORY"
          title="探索专业知识库，找到刚好够用的上下文"
          action={
            <Button href="/libraries/claim">
              <PlusIcon size={15} />
              提交知识库
            </Button>
          }
        />

        <div className="mt-6">
          <div className="flex flex-wrap items-start gap-3 pb-[18px]">
            <label className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-lg border-2 border-line bg-card px-[15px] py-0.5 shadow-[0_4px_10px_rgba(45,45,83,0.06)]">
              <SearchIcon size={18} className="text-muted" />
              <input
                placeholder="搜索名称、领域或 Library ID…"
                className="min-w-0 flex-1 bg-transparent text-[13px] tracking-[-0.025em] text-ink outline-none placeholder:text-muted/70"
              />
              <kbd className="flex h-[34px] shrink-0 items-center rounded-[5px] border-2 border-line bg-mutedbg px-1.5 text-[16px] text-muted">
                ⌘ K
              </kbd>
            </label>
            <div className="flex h-[46px] shrink-0 items-center rounded-lg border-2 border-line bg-card p-[5px]">
              <span className="flex h-9 items-center gap-1.5 rounded-md bg-brandsoft px-3 text-[12px] font-[550] tracking-[-0.027em] text-brandink">
                <SparklesIcon size={15} />
                热门
              </span>
              <span className="flex h-9 items-center gap-1.5 rounded-md px-3 text-[12px] font-[550] tracking-[-0.027em] text-muted">
                <ClockIcon size={15} />
                最近更新
              </span>
            </div>
          </div>

          <LibraryTable entries={CATALOG.slice(0, 6)} showAnchor={false} />

          <div className="flex flex-wrap items-center justify-between gap-3 px-0.5 pt-3.5 text-[11px] tracking-[-0.029em]">
            <p className="text-muted">显示 6 个公开知识库示例</p>
            <Link
              href="/libraries"
              className="flex items-center gap-[5px] font-semibold text-brandink hover:underline"
            >
              查看完整目录
              <ArrowUpRightIcon size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Surfaces -- design source frame `jByip`. */}
      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-11 pb-[54px]">
        <p className="text-center text-[11px] tracking-[-0.029em] text-muted">
          一次接入，让可信知识在你的工作流中保持一致
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 sm:justify-between sm:px-[47px]">
          {SURFACES.map(({ label, Icon }) => (
            <li
              key={label}
              className="flex items-center gap-2 text-[13px] font-[650] tracking-[-0.025em] text-steel/78"
            >
              <Icon size={20} />
              {label}
            </li>
          ))}
        </ul>
      </section>

      {/* On-chain proof -- design source frame `oKG2g`. */}
      <section className="mx-auto w-full max-w-[918px] border-t-2 border-line px-5 pt-13 pb-[70px]">
        <SectionHeading eyebrow="ON-CHAIN PROOF" title="每个版本都能被独立验证，不必先相信平台" />
        <div className="mt-7 grid gap-[18px] sm:grid-cols-3">
          {PROOF.map((item) => (
            <div key={item.title} className="border-t-2 border-line pt-[18px]">
              <h3 className="text-[14px] leading-[1.4] font-[650] tracking-[-0.029em] text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-[11px] leading-[1.6] tracking-[-0.029em] text-muted">
                {item.body}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-7 text-[10px] leading-[1.5] tracking-[-0.032em] text-muted">
          存证证明的是「某个时刻的内容就是这一份」，不构成对内容正确性的保证。存证不消耗调用额度，Free
          与 Pro 都可使用。
        </p>
      </section>

      {/* CTA -- design source frame `B1XJrb`. */}
      <section className="mx-auto w-full max-w-[918px] px-5 pt-16 pb-16">
        <div className="flex flex-col items-start justify-between gap-[30px] rounded-xl border-2 border-[#aadad7] bg-card bg-[linear-gradient(120deg,rgba(228,242,242,0.75)_0%,rgba(228,242,242,0)_65%)] px-10 py-9 shadow-[0_4px_10px_rgba(45,45,83,0.06)] sm:flex-row sm:items-center">
          <div className="flex flex-col gap-[11px] pt-2">
            <span className="text-[11px] font-bold tracking-[-0.029em] text-brand">
              从一次可追溯的查询开始
            </span>
            <h2 className="text-[26px] leading-[1.5] font-[650] tracking-[-0.04em] text-ink">
              让 Agent 少一点猜测，多一点依据。
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button href="/pricing" variant="outline" size="md" className="bg-surface">
              查看定价
            </Button>
            <Button href="/libraries" size="md">
              浏览知识库目录
              <ArrowRightIcon size={15} />
            </Button>
          </div>
        </div>
      </section>

    </>
  );
}
