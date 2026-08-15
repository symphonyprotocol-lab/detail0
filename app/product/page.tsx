import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Check,
  CircleDollarSign,
  FileSearch,
  GitBranch,
  KeyRound,
  Layers3,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { RetrievalPreview } from "@/components/retrieval-preview";
import { SectionHeading } from "@/components/section-heading";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "产品 | Knowledge Market",
  description: "覆盖知识发现、授权、检索、引用和结算的可信知识基础设施。",
};

const stages = [
  [ScanSearch, "发现", "只使用公开或已授权的目录元数据匹配知识库。"],
  [KeyRound, "授权", "在发现、报价、执行和交付阶段重复检查访问权。"],
  [GitBranch, "路由", "按质量、成本、时延和预算渐进访问最合适的知识库。"],
  [FileSearch, "交付", "返回去重知识片段、Citation、路由解释与全部版本。"],
  [
    CircleDollarSign,
    "结算",
    "只对最终实际交付的知识正文计量，并生成平衡账务。",
  ],
] as const;

export default function ProductPage() {
  return (
    <main>
      <SiteHeader />
      <section className="page-hero product-hero container-wide">
        <div className="page-hero-copy">
          <Badge>产品</Badge>
          <h1>
            让知识从来源到答案，
            <br />
            始终可控、可查、可验证
          </h1>
          <p>
            一套统一产品覆盖知识创建、不可变发布、市场发现、智能路由、引用交付和美元结算。
          </p>
          <div className="hero-actions">
            <Button size="lg" asChild>
              <Link href="/marketplace">
                探索知识市场 <ArrowRight size={16} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/developers">查看开发文档</Link>
            </Button>
          </div>
        </div>
        <RetrievalPreview />
      </section>

      <section className="section section-tint">
        <div className="container-wide">
          <SectionHeading
            kicker="完整链路"
            title="一次检索，五个清晰边界"
            description="缓存、分析、工作流日志和链上记录都不会替代授权、版本与账务权威。"
          />
          <div className="stage-grid">
            {stages.map(([Icon, title, desc], i) => (
              <Card key={title}>
                <CardHeader>
                  <span className="stage-number">0{i + 1}</span>
                  <span className="icon-box">
                    <Icon size={20} />
                  </span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section container-wide">
        <div className="split-feature reverse">
          <div className="product-console">
            <div className="console-header">
              <b>Knowledge Router</b>
              <Badge>trusted_first</Badge>
            </div>
            {[
              ["01", "Production RAG Playbook", "相关性 0.94", "已访问"],
              ["02", "Agent Reliability Benchmarks", "相关性 0.88", "已访问"],
              ["03", "Open Research Methods", "相关性 0.74", "充分后停止"],
            ].map(([n, title, score, status]) => (
              <div className="route-row" key={n}>
                <span>{n}</span>
                <div>
                  <b>{title}</b>
                  <small>{score}</small>
                </div>
                <Badge>{status}</Badge>
              </div>
            ))}
            <div className="console-foot">
              <span>最终费用上限</span>
              <b>USD 0.10</b>
            </div>
          </div>
          <div className="feature-copy">
            <Badge className="section-kicker">智能知识路由</Badge>
            <h2>先找到最合适的库，再决定是否扩展</h2>
            <p>
              路由器先用免费 Catalog
              元数据筛选候选，再在权限、价格、语言、新鲜度、质量和地区规则通过后渐进检索。
            </p>
            <ul>
              {[
                "trusted_only、trusted_first、marketplace_auto 与 bundle",
                "预算允许且调用者明确同意时才并行",
                "结果足够后立即停止，避免额外成本",
              ].map((x) => (
                <li key={x}>
                  <Check size={16} />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="container-wide">
          <SectionHeading
            kicker="Knowledge Base"
            title="把拥有合法权利的知识，发布为持续服务"
            description="每次发布冻结来源快照、规范化内容、索引、评测、策略、价格与摘要版本。"
          />
          <div className="dark-card-grid">
            {[
              [
                Layers3,
                "多种数据源",
                "PDF、Word、网页、Drive、数据库、API 与持续同步来源。",
              ],
              [
                BadgeCheck,
                "不可变版本",
                "新内容形成新 Publication，可回滚但不原地修改。",
              ],
              [
                Blocks,
                "评测与 Playground",
                "在发布前验证检索质量、引用与适用边界。",
              ],
              [
                LockKeyhole,
                "可见性与授权",
                "Private、Unlisted 与 Marketplace Visibility 和正文授权分开管理。",
              ],
            ].map(([Icon, title, desc]) => (
              <Card key={title as string}>
                <CardHeader>
                  <Icon size={22} />
                  <h3>{title as string}</h3>
                  <p>{desc as string}</p>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section container-wide">
        <SectionHeading
          kicker="默认安全"
          title="在不确定时安全失败"
          description="任何一项权限、余额、版本、质量或外部结果不确定，都不会继续交付付费知识正文。"
        />
        <div className="security-band">
          <div>
            <ShieldCheck size={34} />
            <h3>四次授权检查</h3>
            <p>发现、报价、执行与交付前分别校验。</p>
          </div>
          <div>
            <LockKeyhole size={34} />
            <h3>敏感内容最小化</h3>
            <p>Query、Chunk 与 Credential 不进入普通日志。</p>
          </div>
          <div>
            <CircleDollarSign size={34} />
            <h3>先冻结再访问</h3>
            <p>最大费用冻结成功后才访问付费正文。</p>
          </div>
        </div>
      </section>

      <section className="final-cta section-tint">
        <div className="container-wide">
          <div>
            <h2>让可信知识进入你的下一次 AI 调用</h2>
            <p>先从公开知识市场开始，或用统一 API 接入现有产品。</p>
          </div>
          <div>
            <Button variant="outline" asChild>
              <Link href="/solutions">查看解决方案</Link>
            </Button>
            <Button asChild>
              <Link href="/marketplace">
                开始探索 <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
