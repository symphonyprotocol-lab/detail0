import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Check,
  Code2,
  Database,
  Gauge,
  Hexagon,
  LibraryBig,
  Orbit,
  Quote,
  ShieldCheck,
  Sparkles,
  Triangle,
  Boxes,
  Tag,
  Workflow,
  Building2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RetrievalPreview } from "@/components/retrieval-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const heroImage =
  "https://images.unsplash.com/photo-1776720719669-57fd6daa307f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080";
const teamImage =
  "https://images.unsplash.com/photo-1758691736872-61a1f75fe2d5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080";

const capabilities = [
  [
    LibraryBig,
    "知识市场",
    "发现专业、更新及时且经过验证的知识库。",
    "持续扩充",
    "可购买知识源",
  ],
  [
    BookOpenCheck,
    "可信证据",
    "每条答案都保留引用、版本与来源证明。",
    "目标 ≥80%",
    "引用完整率",
  ],
  [
    Gauge,
    "预算控制",
    "按请求、Agent 和 API 密钥设置消费边界。",
    "双层",
    "预算与 API 密钥限额",
  ],
  [
    BarChart3,
    "收益结算",
    "发布者实时了解调用、收入和结算状态。",
    "待确认",
    "标准结算周期",
  ],
] as const;

const faqs = [
  [
    "Knowledge Market 是什么？",
    "它是连接知识发布者与 AI 应用的可信市场，覆盖发现、授权、检索、引用和结算。",
  ],
  [
    "知识库如何通过审核？",
    "平台会核对内容权利、来源透明度、适用边界、质量评测与安全规则，通过后发布不可变版本。",
  ],
  [
    "检索费用如何计算？",
    "发布者收益只按最终、去重、实际交付的知识 Token 计算，平台费用、税与抵扣会在 Quote 中单独列示。",
  ],
  [
    "可以接入私有知识吗？",
    "可以。私有和非公开知识库仍需明确授权，并在发现、报价、执行和交付阶段重复检查。",
  ],
  [
    "发布者如何获得收益？",
    "合格调用会形成可核对的收入记录与账期对账单；链上只保存隐私保护的账单承诺。",
  ],
] as const;

const insights = [
  [
    "https://images.unsplash.com/photo-1585521747230-516376e5a85d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
    "评估",
    "8 分钟阅读",
    "建立可复现的 RAG 质量基准",
    "从任务集、人工标注到持续回归，搭建团队可以信任的评估流程。",
  ],
  [
    "https://images.unsplash.com/photo-1758876203323-a62498d5eef7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
    "工作流",
    "7 分钟阅读",
    "结束知识在工具间反复搬运",
    "利用统一知识接口减少上下文切换，让引用和权限跟随答案流动。",
  ],
  [
    "https://images.unsplash.com/photo-1581093577421-f561a654a353?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
    "治理",
    "5 分钟阅读",
    "小团队也能做好 AI 治理",
    "用预算、审计和版本记录构建轻量但可靠的知识运营机制。",
  ],
] as const;

export default function Home() {
  return (
    <main>
      <SiteHeader />
      <section className="hero container-wide">
        <Badge>
          <Sparkles size={13} />
          可信知识路由现已开放
        </Badge>
        <h1>
          让每一次 AI 决策，
          <br />
          都有可信知识作为依据
        </h1>
        <p>
          发现、购买并调用经过验证的专业知识库。让团队获得更准确的答案、完整的引用，以及可控的检索成本。
        </p>
        <div className="hero-actions">
          <Button size="lg" asChild>
            <Link href="/marketplace">
              探索知识市场 <ArrowRight size={15} />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/developers">
              <Code2 size={15} />
              查看 API
            </Link>
          </Button>
        </div>
      </section>

      <section className="home-showcase-section">
        <div
          className="home-photo"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
      </section>

      <section className="trust-strip container-wide">
        <span>品牌展示位 · 正式发布前仅使用已授权客户</span>
        <div>
          {[
            [Hexagon, "NORTHSTAR"],
            [Triangle, "APERTURE"],
            [Boxes, "POLARIS"],
            [Orbit, "ORBITAL"],
            [Database, "MOSAIC"],
          ].map(([Icon, name]) => (
            <b key={name as string}>
              <Icon size={20} />
              {name as string}
            </b>
          ))}
        </div>
      </section>

      <section className="home-benefits-intro">
        <Badge className="section-kicker">核心能力</Badge>
        <h2>可信知识，按照你的工作方式流动</h2>
        <p>
          从发现、评估到调用与结算，一套基础设施覆盖知识进入 AI 产品的完整链路。
        </p>
      </section>

      <section id="capabilities" className="home-spotlight container-wide">
        <RetrievalPreview />
        <div className="feature-copy">
          <Badge className="section-kicker">智能知识路由</Badge>
          <h2>一次查询，连接最合适的知识</h2>
          <p>
            根据质量、成本、延迟和权限自动选择知识库。每个回答都携带原始引用、版本信息和完整证据链。
          </p>
          <ul>
            {[
              "按问题自动匹配多个专业知识库",
              "预算、权限和可信度在路由时同步执行",
              "结果可追溯到具体来源与知识版本",
            ].map((x) => (
              <li key={x}>
                <span className="check-dot">
                  <Check size={12} />
                </span>
                {x}
              </li>
            ))}
          </ul>
          <Button asChild>
            <Link href="/product">
              了解检索流程 <ArrowRight size={15} />
            </Link>
          </Button>
        </div>
      </section>

      <section className="home-capability-grid container-wide">
        {capabilities.map(([Icon, title, desc, metric, label]) => (
          <Card className="capability-card" key={title}>
            <CardHeader>
              <span className="icon-box">
                <Icon size={19} />
              </span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </CardHeader>
            <CardContent>
              <b className="metric">{metric}</b>
              <span>{label}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section id="testimonial" className="home-testimonial section-tint">
        <div className="container-wide testimonial-layout">
          <div>
            <Badge>
              <Quote size={13} />
              体验引言示例 · 正式发布前需客户授权
            </Badge>
            <blockquote>
              “Knowledge Market
              让设计师、工程师和研究团队终于基于同一套可信资料作出决策。我们不再争论答案来自哪里。”
            </blockquote>
            <div className="testimonial-meta">
              <span className="avatar-logo">
                <Hexagon size={18} />
              </span>
              <span>
                <b>Northstar Labs</b>
                <small>2026 年 6 月</small>
              </span>
            </div>
          </div>
          <div className="testimonial-people">
            {[
              ["AM", "Alex Morgan", "产品负责人"],
              ["ST", "Sophie Tan", "研究负责人"],
              ["EC", "Emily Carter", "知识工程师"],
              ["HL", "Hannah Lee", "平台工程师"],
            ].map(([initials, name, role]) => (
              <Card key={name}>
                <span className="avatar">{initials}</span>
                <div>
                  <b>{name}</b>
                  <small>{role}</small>
                </div>
                <span className="stars">★★★★★</span>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="stats" className="home-stats container-wide">
        <div className="stats-copy">
          <Badge className="section-kicker">平台目标</Badge>
          <h2>
            更快找到答案，
            <br />
            更放心采取行动
          </h2>
          <p>
            无论是查找资料、调用知识还是发布知识服务，Knowledge Market
            都帮助用户更快地验证信息、复用知识并控制 AI 成本。
          </p>
          <div className="stats-grid">
            {[
              ["待发布", "月度知识调用 · 上线后披露"],
              ["待验证", "决策提速 · 上线后验证"],
              ["待验证", "满意度 · 上线后验证"],
              ["待确认", "首发区域 · 上线前确认"],
            ].map(([v, l]) => (
              <div key={l}>
                <b>{v}</b>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div
          className="stats-photo"
          style={{ backgroundImage: `url(${teamImage})` }}
        />
      </section>

      <section id="pricing-preview" className="home-pricing section-tint">
        <div className="container-wide">
          <div className="center-heading">
            <Badge className="section-kicker">定价标准</Badge>
            <h2>每一笔费用如何形成，都清晰可见</h2>
            <p>
              知识授权、检索调用和专业服务分别定价。具体金额以发布者报价及使用前确认结果为准。
            </p>
            <div className="pricing-checks">
              {["规则公开", "执行前预估", "明细可核对", "预算可控制"].map(
                (x) => (
                  <span key={x}>
                    <Check size={12} />
                    {x}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="pricing-principles">
            {[
              [
                Tag,
                "知识授权",
                "由知识发布者制定",
                "知识库发布者负责制定价格，并同时说明适用范围、计费单位、内容更新权益与相关条件。",
                [
                  "定价单位和授权范围必须明确",
                  "购买或授权前展示完整规则",
                  "最终金额以知识库详情页为准",
                ],
                "查看知识库定价",
              ],
              [
                Workflow,
                "检索调用",
                "执行前展示预估",
                "调用费用由参与路由的知识库、调用方式及服务条件共同决定，执行前会提供预算估算。",
                [
                  "账户预算与 API 限额优先检查",
                  "执行完成后生成费用明细",
                  "费用记录可与调用证据相互核对",
                ],
                "了解调用计费",
              ],
              [
                Building2,
                "专业服务",
                "根据实际需求评估",
                "迁移接入、数据质量评估、API 集成、技术支持和结算配置等专业服务，根据明确的实施范围形成方案。",
                [
                  "服务范围和交付边界先行确认",
                  "方案报价需经客户确认",
                  "确认前不会产生专业服务费用",
                ],
                "咨询专业服务",
              ],
            ].map(([Icon, title, kicker, desc, items, action], i) => (
              <Card key={title as string}>
                <CardHeader>
                  <span className="icon-box">
                    <Icon size={19} />
                  </span>
                  <small>{kicker as string}</small>
                  <h3>{title as string}</h3>
                  <p>{desc as string}</p>
                  <ul>
                    {(items as string[]).map((x) => (
                      <li key={x}>
                        <ShieldCheck size={13} />
                        {x}
                      </li>
                    ))}
                  </ul>
                </CardHeader>
                <CardContent>
                  <Button variant={i === 1 ? "default" : "outline"} asChild>
                    <Link href="/pricing">
                      {action as string} <ArrowRight size={14} />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="insights" className="home-insights container-wide">
        <div className="insights-head">
          <div>
            <span>资源与洞察</span>
            <h2>关于可信 AI 的最新实践</h2>
            <p>帮助团队更好地构建、评估和运营知识驱动产品。</p>
          </div>
          <Button variant="outline">
            查看全部 <ArrowRight size={14} />
          </Button>
        </div>
        <div className="insight-grid">
          {insights.map(([image, cat, time, title, desc]) => (
            <Card key={title}>
              <div
                className="insight-image"
                style={{ backgroundImage: `url(${image})` }}
              />
              <div className="insight-meta">
                <Badge>{cat}</Badge>
                <span>{time}</span>
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="faq" className="home-faq container-wide">
        <div>
          <Badge className="section-kicker">常见问题</Badge>
          <h2>
            开始之前，
            <br />
            你可能想了解这些
          </h2>
          <p>
            没有找到需要的答案？我们的团队可以帮助你评估知识接入和商业化方案。
          </p>
          <Button variant="outline">
            联系我们 <ArrowRight size={14} />
          </Button>
        </div>
        <Accordion type="single" defaultValue="item-0" collapsible>
          {faqs.map(([q, a], i) => (
            <AccordionItem value={`item-${i}`} key={q}>
              <AccordionTrigger>{q}</AccordionTrigger>
              <AccordionContent>{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="home-newsletter section-tint">
        <h2>持续获得可信 AI 的最新实践</h2>
        <p>产品更新、知识工程方法和市场洞察，直接发送到你的邮箱。</p>
        <form>
          <label className="sr-only" htmlFor="newsletter-email">
            邮箱
          </label>
          <input
            id="newsletter-email"
            type="email"
            placeholder="email@example.com"
          />
          <Button type="submit">订阅</Button>
        </form>
        <small>我们尊重你的隐私，不发送无关邮件。</small>
      </section>
      <SiteFooter />
    </main>
  );
}
