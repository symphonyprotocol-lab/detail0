import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Database,
  FileCheck2,
  Globe2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { MarketplaceCatalog } from "@/components/marketplace-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "知识市场 | Knowledge Market",
  description: "搜索经过审核的知识库，比较范围、来源、质量、价格与授权条件。",
};

const featured = [
  [
    "AI 与工程",
    "Production RAG Playbook",
    "覆盖生产级 RAG 的评估、检索路由、引用质量和成本控制。",
    ["官方文档与实践指南", "明确不适用边界", "版本化更新"],
  ],
  [
    "研究与数据",
    "Agent Reliability Benchmarks",
    "面向智能体系统的可靠性评测方法、失败模式和回归任务集。",
    ["研究来源透明", "包含固定预览", "评测说明公开"],
  ],
  [
    "法律与合规",
    "ASEAN Compliance Monitor",
    "持续追踪东盟跨境业务中的税务、海关和数据合规变化。",
    ["官方来源优先", "持续同步说明", "高风险请求受限"],
  ],
  [
    "研究与数据",
    "Open Research Methods",
    "可复现研究设计、统计检查和证据分级方法。",
    ["开放来源", "可复现方法", "固定版本"],
  ],
] as const;

export default function MarketplacePage() {
  return (
    <main>
      <SiteHeader />
      <section className="marketplace-hero">
        <div className="container-wide">
          <Badge>可信知识市场</Badge>
          <h1>
            发现可以被 AI 安全调用的
            <br />
            专业知识服务
          </h1>
          <p>
            搜索经过审核的知识库，比较覆盖范围、来源透明度、质量和授权条件。当前知识库、发布者与价格均为合成展示数据。
          </p>
          <form className="market-main-search">
            <Search size={20} />
            <input placeholder="搜索知识库、领域、主题或发布者" />
            <Button type="submit">搜索</Button>
          </form>
          <div className="popular-searches">
            <span>热门领域</span>
            {["AI 工程", "研究评测", "法规合规", "运营管理"].map((x) => (
              <button key={x}>{x}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="category-nav">
        <span>按领域浏览</span>
        {[
          [
            "https://images.unsplash.com/photo-1562568068-ea24dcbf3c78?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
            "AI 与工程",
          ],
          [
            "https://images.unsplash.com/photo-1630959300489-63dae3a8240a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
            "研究与数据",
          ],
          [
            "https://images.unsplash.com/photo-1630959305824-a1b5eaf2e188?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
            "法律与合规",
          ],
          [
            "https://images.unsplash.com/photo-1693310540923-7d5ad11477f8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
            "商业与运营",
          ],
          [
            "https://images.unsplash.com/photo-1758873272414-c0bf30332738?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
            "医疗与生命科学",
          ],
          [
            "https://images.unsplash.com/photo-1659070953831-dd4fa16222fb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080",
            "教育与培训",
          ],
        ].map(([image, label]) => (
          <button key={label}>
            <span
              className="category-thumb"
              style={{ backgroundImage: `url(${image})` }}
            />
            {label}
          </button>
        ))}
      </section>
      <section className="section container-wide">
        <SectionHeading
          align="left"
          kicker="编辑推荐"
          title="从高透明度知识库开始探索"
          description="推荐内容仅使用公开目录信息，不读取付费知识正文。"
          action={<Button variant="outline">查看全部</Button>}
        />
        <div className="featured-grid">
          {featured.map(([cat, title, desc, points], i) => (
            <Card className="featured-card" key={title}>
              <div className={`featured-cover cover-${i}`}>
                <Badge>{cat}</Badge>
                <BookOpenCheck size={28} />
              </div>
              <CardHeader>
                <div className="verified-line">
                  <ShieldCheck size={15} />
                  发布者已验证
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <ul>
                  {points.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <Button variant="outline">
                  $1 / 百万知识 Token <ArrowRight size={15} />
                </Button>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
      <section className="section section-tint">
        <div className="container-wide">
          <SectionHeading
            align="left"
            kicker="知识目录"
            title="浏览公开知识库"
            description="按领域筛选并比较知识库；调用价格按实际交付的知识 Token 计费。"
          />
          <MarketplaceCatalog />
        </div>
      </section>
      <section className="section container-wide">
        <div className="evaluation-guide">
          <div>
            <Badge>如何评估</Badge>
            <h2>
              选择知识库，
              <br />
              不只看相关性
            </h2>
            <p>
              市场目录只展示可核对的公开元数据。调用前，还需要确认来源权利、适用边界、版本新鲜度、引用方式与授权条件。
            </p>
            <div className="warning-note">
              Trust List 仅代表路由偏好，不会授予访问权，也不会绕过定价规则。
            </div>
          </div>
          <Card className="checklist">
            <CardHeader>
              <div>
                <h3>知识库评估清单</h3>
                <Badge>公开信息</Badge>
              </div>
              {[
                ["来源、发布者与内容权利", "已公开"],
                ["适用范围与明确排除项", "已说明"],
                ["更新方式与发布版本", "可核对"],
                ["固定预览、质量与引用样例", "可核对"],
                ["访问授权与定价标准", "调用前确认"],
              ].map(([x, s]) => (
                <div className="check-row" key={x}>
                  <CheckCircle />
                  <span>{x}</span>
                  <Badge>{s}</Badge>
                </div>
              ))}
            </CardHeader>
          </Card>
        </div>
      </section>
      <section className="market-publisher section-tint">
        <div className="container-wide">
          <div>
            <span>面向知识提供者</span>
            <h2>拥有合法权利的专业知识？</h2>
            <p>
              把文档、数据源和持续更新的专业知识，发布为可发现、可引用、可计量的知识服务。
            </p>
            <div>
              <Button asChild>
                <Link href="/product">
                  了解发布流程 <ArrowRight size={16} />
                </Link>
              </Button>
              <Button variant="outline">查看发布要求</Button>
            </div>
          </div>
          <Card className="publish-ready">
            <h3>发布准备</h3>
            {[
              [FileCheck2, "记录来源、内容权利与更新方式"],
              [Database, "配置固定预览与质量评估"],
              [Globe2, "设置可见性、授权与定价标准"],
            ].map(([Icon, label]) => (
              <div key={label as string}>
                <Icon size={17} />
                <b>{label as string}</b>
                <ArrowRight size={14} />
              </div>
            ))}
          </Card>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function CheckCircle() {
  return <span className="check-circle">✓</span>;
}
