import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "解决方案 | Knowledge Market",
  description: "获取可信知识、发布知识服务，或通过统一 API 构建 AI 产品。",
};

const flow = [
  ["01", "发现与授权", "使用公开或已授权的目录元数据选库，不读取付费正文。"],
  ["02", "报价与预算", "冻结适用价格、策略、权益和版本，并检查预算边界。"],
  ["03", "检索与交付", "渐进访问合格知识库，返回去重内容、引用和路由解释。"],
  ["04", "计量与结算", "只按最终实际交付知识计量，并生成可核对账务记录。"],
];

export default function SolutionsPage() {
  return (
    <main className="solutions-page">
      <SiteHeader />
      <section className="page-hero centered-hero container-wide">
        <Badge>解决方案</Badge>
        <h1>
          让可信知识服务于
          <br />
          每一种 AI 工作流
        </h1>
        <p>
          无论是寻找专业答案、发布可信知识，还是通过 API
          构建产品，都能获得清晰的权限、引用、预算和结算边界。
        </p>
        <div className="hero-actions">
          <Button size="lg" asChild>
            <Link href="/marketplace">
              探索知识市场 <ArrowRight size={16} />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/developers">阅读开发文档</Link>
          </Button>
        </div>
      </section>

      <section className="audience-strip">
        <span>选择与你最相关的路径</span>
        {[
          [
            "https://images.unsplash.com/photo-1758691462668-046fd85ceac9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
            "获取可信知识",
            "发现与调用",
          ],
          [
            "https://images.unsplash.com/photo-1491841651911-c44c30c34548?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
            "发布知识服务",
            "创建与发布",
          ],
          [
            "https://images.unsplash.com/photo-1573495627361-d9b87960b12d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
            "构建 AI 产品",
            "API 集成",
          ],
        ].map(([image, title, label]) => (
          <Link href="#solutions" key={title}>
            <span
              className="audience-thumb"
              style={{ backgroundImage: `url(${image})` }}
            />
            <div>
              <b>{title}</b>
              <small>{label}</small>
            </div>
            <ArrowRight size={16} />
          </Link>
        ))}
      </section>

      <section id="solutions" className="section solution-block">
        <div className="container-wide solution-story">
          <div className="feature-copy">
            <Badge className="section-kicker">发现与调用</Badge>
            <h2>
              从专业知识中获得
              <br />
              可以采取行动的答案
            </h2>
            <p>
              搜索并比较公开知识库，查看来源透明度、适用范围、质量、价格与示例。通过固定预览或经过批准的试用验证价值，再决定是否授权。
            </p>
            <ul>
              {[
                "搜索和过滤公开知识目录",
                "查看引用、新鲜度与路由原因",
                "通过预算限制控制每次、每日和每月支出",
              ].map((x) => (
                <li key={x}>
                  <Check size={16} />
                  {x}
                </li>
              ))}
            </ul>
            <Button asChild>
              <Link href="/marketplace">
                查看知识市场 <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
          <div className="market-mini">
            <div className="mini-search">搜索领域、知识库或发布者</div>
            {[
              ["Production RAG Playbook", "评测、路由与成本控制"],
              ["Agent Reliability Benchmarks", "智能体失败模式与测试"],
              ["ASEAN Compliance Monitor", "法规、海关与数据合规"],
            ].map(([t, d], i) => (
              <Card key={t}>
                <span className={`mini-cover cover-${i}`}></span>
                <div>
                  <b>{t}</b>
                  <p>{d}</p>
                  <Badge>{i === 2 ? "持续更新" : "已验证"}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-tint solution-block">
        <div className="container-wide">
          <div className="solution-story reverse">
            <div className="publisher-panel">
              <div className="publisher-steps">
                {[
                  "基础信息",
                  "数据来源",
                  "处理规则",
                  "评测预览",
                  "审核发布",
                ].map((x, i) => (
                  <span className={i === 1 ? "active" : ""} key={x}>
                    0{i + 1} {x}
                  </span>
                ))}
              </div>
              <div className="publisher-body">
                <div>
                  <Badge>草稿 · 新版本</Badge>
                  <h3>Production RAG Playbook</h3>
                  <p>3 个数据源已连接，评测与引用检查已通过。</p>
                </div>
                {[
                  "rag-evaluation.pdf",
                  "docs.production.ai",
                  "benchmark_results",
                ].map((x, i) => (
                  <div className="source-row" key={x}>
                    <FileCheck2 size={18} />
                    <span>{x}</span>
                    <Badge>{["已索引", "已同步", "准备就绪"][i]}</Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="feature-copy">
              <Badge className="section-kicker">创建与发布</Badge>
              <h2>
                把合法拥有的知识，
                <br />
                发布为可持续的服务
              </h2>
              <p>
                连接文件、网页、Drive、数据库或
                API，跟踪解析、索引和评测状态。每次发布都会冻结完整版本，不在已发布版本上原地修改。
              </p>
              <ul>
                {[
                  "连接持续同步的数据源并记录授权",
                  "使用 Playground 验证检索和引用",
                  "查看用量、收入、调整与收益存证",
                ].map((x) => (
                  <li key={x}>
                    <Check size={16} />
                    {x}
                  </li>
                ))}
              </ul>
              <Button variant="outline" asChild>
                <Link href="/product">了解发布流程</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="section solution-block">
        <div className="container-wide solution-story">
          <div className="code-window">
            <div className="code-head">
              <span>retrieval-request.ts</span>
              <Badge>200 OK</Badge>
            </div>
            <pre>{`const response = await client.retrieve({\n  query: "最新政策有什么变化？",\n  routing: { mode: "trusted_first" },\n  budget: { max_cost: "0.10" },\n  execution: { timeout_ms: 8000 }\n}, { idempotencyKey: requestId });`}</pre>
            <div className="response-strip">
              <span>
                引用 <b>完整</b>
              </span>
              <span>
                路由解释 <b>已返回</b>
              </span>
              <span>
                费用状态 <b>可核对</b>
              </span>
            </div>
          </div>
          <div className="feature-copy">
            <Badge className="section-kicker">API 集成</Badge>
            <h2>
              通过一个 API，
              <br />
              接入整个知识市场
            </h2>
            <p>
              指定知识库或使用 trusted_only、trusted_first、marketplace_auto 和
              bundle 路由。同步、异步、SSE、取消和部分结果采用统一请求模型。
            </p>
            <ul>
              {[
                "REST、MCP、OpenAI-compatible Tool 与框架适配",
                "Idempotency-Key 保证相同重试返回原结果",
                "响应包含引用、路由解释、全部版本与账务状态",
              ].map((x) => (
                <li key={x}>
                  <Check size={16} />
                  {x}
                </li>
              ))}
            </ul>
            <Button asChild>
              <Link href="/developers">
                查看 API 文档 <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="section container-wide">
        <SectionHeading
          kicker="端到端工作流"
          title="从发现知识到完成结算，边界始终明确"
          description="每一步都保留授权、版本、预算和证据，避免把缓存、分析或工作流日志当作权威来源。"
        />
        <div className="flow-grid">
          {flow.map(([n, t, d]) => (
            <Card key={n}>
              <CardHeader>
                <b>{n}</b>
                <h3>{t}</h3>
                <p>{d}</p>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="section section-dark">
        <div className="container-wide trust-layout">
          <div>
            <Badge>信任、安全与隐私</Badge>
            <h2>
              默认拒绝，完整追溯，
              <br />
              在不确定时安全失败
            </h2>
            <p>
              权限、内容、资金和存证分别拥有明确的权威边界。外部结果不确定时先查询或对账，不盲目重试。
            </p>
            <div className="warning-note">
              Aptos
              仅发布隐私保护的收益账单承诺，不托管资金、不执行付款，也不写入金额或知识正文。
            </div>
          </div>
          <div className="trust-items">
            {[
              [KeyRound, "访问控制", "发现、报价、执行和交付都进行授权检查。"],
              [
                ShieldCheck,
                "内容安全",
                "敏感数据、Prompt Injection 与批量提取进入检测。",
              ],
              [
                CircleDollarSign,
                "资金边界",
                "没有成功冻结最大费用，不访问付费知识正文。",
              ],
              [
                LockKeyhole,
                "可验证存证",
                "发布者可使用 Statement 与公开算法复算承诺。",
              ],
            ].map(([Icon, t, d]) => (
              <Card key={t as string}>
                <CardHeader>
                  <Icon size={21} />
                  <h3>{t as string}</h3>
                  <p>{d as string}</p>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <section className="final-cta">
        <div className="container-wide">
          <div>
            <h2>找到适合你的知识工作流</h2>
            <p>探索公开知识、发布自己的知识服务，或接入 API 构建应用。</p>
          </div>
          <div>
            <Button variant="outline">联系我们</Button>
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
