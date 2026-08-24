import type { Metadata } from 'next';
import { Button, SectionHeading } from '@/components/ui/primitives';
import { LibraryTable } from '@/components/site/library-table';
import { CATALOG, CATALOG_TOTAL } from '@/lib/site/demo-data';

export const metadata: Metadata = {
  title: '公开知识库目录',
  description: '全部公开知识库均已通过平台审核，可被任意用户免费查询。',
};

const FILTERS = [
  '领域：全部',
  '语言：全部',
  '来源：全部',
  'Trust ≥ 80',
  '更新于 30 天内',
  '仅看已存证',
];

export default function CatalogPage() {
  return (
    <section className="mx-auto w-full max-w-[918px] px-5 pt-11 pb-16">
      <SectionHeading
        eyebrow="KNOWLEDGE DIRECTORY"
        title="公开知识库目录"
        action={
          <div className="flex flex-wrap gap-2.5">
            <Button href="/libraries/claim" variant="outline">
              认领知识库
            </Button>
            <Button href="/libraries/claim">提交知识库</Button>
          </div>
        }
      />

      <p className="mt-4 max-w-[80ch] text-[13px] leading-[1.7] text-muted">
        全部公开知识库均已通过平台审核，可被任意用户免费查询；每个已发布版本都会生成链上内容存证，引用可脱离
        recall0 独立验证。
      </p>

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

      <div className="mt-3 flex flex-wrap gap-2.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="flex h-[34px] items-center gap-2 rounded-lg border-2 border-line bg-card px-3 text-[12px] font-medium text-muted transition-colors hover:bg-subtle"
          >
            {f}
            <span aria-hidden className="text-[10px] text-faint">
              ▾
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <p className="text-muted">
          共 {CATALOG_TOTAL.toLocaleString('en-US')} 个公开知识库 · 按 Trust Score 排序
        </p>
        <p className="text-faint">公开库查询免费，仅消耗你的 API Call 额度</p>
      </div>

      <div className="mt-3">
        <LibraryTable entries={CATALOG} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted">
          显示 1–{CATALOG.length}，共 {CATALOG_TOTAL.toLocaleString('en-US')} 个知识库
        </p>
        <nav className="flex items-center gap-1.5">
          {['上一页', '1', '2', '3', '…', '1554', '下一页'].map((p) => (
            <span
              key={p}
              className={`inline-flex h-[30px] items-center rounded-md px-2.5 text-[12px] font-medium ${
                p === '1'
                  ? 'bg-brand text-white'
                  : 'border-2 border-line bg-card text-muted'
              }`}
            >
              {p}
            </span>
          ))}
        </nav>
      </div>
    </section>
  );
}
