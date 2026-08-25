import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { CATALOG, findLibrary, type CatalogEntry } from '@/lib/site/demo-data';

type Params = { params: Promise<{ libraryId: string[] }> };

export function generateStaticParams() {
  return CATALOG.map((entry) => ({ libraryId: entry.libraryId.slice(1).split('/') }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { libraryId } = await params;
  const entry = findLibrary(`/${libraryId.join('/')}`);
  if (!entry) return { title: '知识库' };
  return { title: entry.title, description: entry.description };
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="flex flex-col gap-1 px-3.5 py-3">
      <span className="text-[9.5px] font-semibold tracking-[0.04em] text-muted">{label}</span>
      <span className="text-[21px] leading-tight font-bold tracking-[-0.03em] text-ink">{value}</span>
      <span className="text-[10.5px] text-faint">{note}</span>
    </Card>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[12px] text-muted">{k}</span>
      <span className={`text-right text-[12px] text-ink ${mono ? 'font-mono text-[11px]' : 'font-medium'}`}>
        {v}
      </span>
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b-2 border-line px-4 py-3">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {right ? <span className="text-[11.5px] text-faint">{right}</span> : null}
      </div>
      <div className="flex flex-col gap-2.5 p-4">{children}</div>
    </Card>
  );
}

export default async function LibraryDetailPage({ params }: Params) {
  const { libraryId } = await params;
  const entry: CatalogEntry | undefined = findLibrary(`/${libraryId.join('/')}`);
  if (!entry) notFound();

  return (
    <section className="mx-auto w-full max-w-[918px] px-5 pt-7 pb-14">
      <nav className="flex items-center gap-2 text-[12px] text-muted">
        <Link href="/libraries" className="hover:text-ink">
          知识库目录
        </Link>
        <span aria-hidden className="text-line">/</span>
        <span>{entry.domain}</span>
        <span aria-hidden className="text-line">/</span>
        <span className="font-semibold text-ink">{entry.title}</span>
      </nav>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.04em] text-ink">
              {entry.title}
            </h1>
            <Chip tone="brand">公开</Chip>
            {entry.claimedBy ? <Chip tone="good">已认领</Chip> : <Chip tone="warn">待认领</Chip>}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <code className="rounded-md border-2 border-line bg-subtle px-2.5 py-1 font-mono text-[12px] text-[#2d4e54]">
              {entry.libraryId}
            </code>
            <span className="text-[12px] text-faint">
              指定版本：{entry.libraryId}/{entry.version}
            </span>
          </div>

          <p className="mt-3 max-w-[70ch] text-[13.5px] leading-[1.7] text-muted">
            {entry.description}
          </p>

          <div className="mt-3.5 flex flex-wrap gap-2">
            <Chip>{entry.domain}</Chip>
            <Chip>{entry.language}</Chip>
            <Chip>{entry.license}</Chip>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button href="/playground">在 Playground 试用</Button>
          <Button href="/docs" variant="outline">
            查看接入示例
          </Button>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="TRUST SCORE" value={String(entry.trustScore)} note="来源可信度" />
        <Stat label="BENCHMARK" value={String(entry.benchmarkScore)} note="检索质量评分" />
        <Stat label="CHUNKS" value={entry.chunks} note={`${entry.documents} 篇文档`} />
        <Stat label="TOKENS" value={entry.tokens} note="全量索引" />
        <Stat label="容量" value={`${entry.sizeMb} MB`} note="上限 100 MB" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_312px]">
        <div className="flex flex-col gap-4">
          <Panel title="版本" right="当前发布版本">
            <div className="rounded-lg border-2 border-line bg-subtle p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[14px] font-bold text-ink">{entry.version}</span>
                  <Chip tone="brand">当前版本</Chip>
                  <Chip tone="good">Ready</Chip>
                </div>
                <span className="text-[11.5px] text-faint">发布于 {entry.updated}</span>
              </div>
              <div className="mt-2.5 flex flex-col">
                <Row k="Parser / Chunker" v="parser v3.1 · chunker v2.0" />
                <Row k="Embedding Model" v="text-embedding-3-large" />
              </div>
            </div>
            <p className="text-[11.5px] leading-[1.7] text-faint">
              版本不可变。查询在请求开始时固定 Version，因此刷新期间不会混用新旧 Chunk；刷新失败时旧版本继续可用。
            </p>
          </Panel>

          <Panel title="接入示例" right="REST / MCP / SDK 使用同一份检索结果">
            <div className="rounded-lg border-2 border-line bg-subtle p-3.5">
              <pre className="overflow-x-auto font-mono text-[11px] leading-[1.75] text-[#278f5c]">
{`query-docs
  libraryId: "${entry.libraryId}"
  query:     "how do I get started"
  maxTokens: 4000`}
              </pre>
            </div>
            <p className="text-[11.5px] leading-[1.7] text-faint">
              每次成功受理的查询计为 1 API Call，与返回的 Chunk 数或 Token 数无关。
            </p>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="来源">
            <div className="flex items-center gap-2">
              <Chip>{entry.sourceType}</Chip>
              <span className="truncate font-mono text-[11.5px] text-[#2d4e54]">
                {entry.sourceLocation}
              </span>
            </div>
            <Row k="folders" v="docs, guides" mono />
            <Row k="excludeFolders" v="archive" mono />
            <Row k="最近同步" v={entry.updated} />
          </Panel>

          <Panel title="链上存证">
            <div className="flex items-center gap-2">
              {entry.anchored ? <Chip tone="good">已存证</Chip> : <Chip tone="warn">待存证</Chip>}
              <span className="text-[11.5px] text-muted">Aptos 主网</span>
            </div>
            {entry.anchored ? (
              <>
                <Row k="交易哈希" v="0x7f3c…a91b" mono />
                <Row k="区块时间" v="2026-08-17 14:02:11" />
              </>
            ) : (
              <p className="text-[11.5px] text-muted">该版本尚未进入锚定批次，不影响检索与引用。</p>
            )}
            <Button href="/docs/anchoring" variant="outline" className="mt-1 w-full">
              独立验证此版本
            </Button>
            <p className="text-[11px] leading-[1.65] text-faint">
              验证工具不调用 Recall0 任何接口。存证只证明「该时刻内容即此版本」，不构成对内容正确性的保证。
            </p>
          </Panel>

          <Panel title="所有权">
            {entry.claimedBy ? (
              <>
                <div className="flex items-center gap-2">
                  <Chip tone="good">已认领</Chip>
                  <span className="text-[12px] font-semibold text-ink">{entry.claimedBy}</span>
                </div>
                <Row k="校验方式" v="GitHub 仓库权限校验" />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Chip tone="warn">待认领</Chip>
                  <span className="text-[12px] text-muted">尚无所有者</span>
                </div>
                <p className="text-[11px] leading-[1.65] text-faint">
                  提交不等于拥有。来源维护者可以通过独立验证流程认领，取得管理权与发布者分成资格；未认领的公开库不产生收益。
                </p>
                <Button href="/libraries/claim" className="mt-1 w-full">
                  认领此知识库
                </Button>
              </>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}
