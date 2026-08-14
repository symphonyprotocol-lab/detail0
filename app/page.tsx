import Link from "next/link";
import { ArrowRight, BarChart3, BookOpenCheck, Check, CircleDollarSign, Gauge, LibraryBig, Quote, ShieldCheck, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RetrievalPreview } from "@/components/retrieval-preview";
import { SectionHeading } from "@/components/section-heading";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const capabilities = [
  [LibraryBig, "知识市场", "发现专业、更新及时且经过验证的知识库。", "持续扩充", "可购买知识源"],
  [BookOpenCheck, "可信证据", "每条答案都保留引用、版本与来源证明。", "目标 ≥80%", "引用完整率"],
  [Gauge, "预算控制", "按请求、Agent 和 API 密钥设置消费边界。", "双层", "预算与 API 密钥限额"],
  [CircleDollarSign, "收益结算", "发布者实时了解调用、收入和结算状态。", "可核对", "标准结算记录"],
] as const;

const faqs = [
  ["Knowledge Market 是什么？", "它是连接知识发布者与 AI 应用的可信市场，覆盖发现、授权、检索、引用和结算。"],
  ["知识库如何通过审核？", "平台会核对内容权利、来源透明度、适用边界、质量评测与安全规则，通过后发布不可变版本。"],
  ["检索费用如何计算？", "发布者收益只按最终、去重、实际交付的知识 Token 计算，平台费用、税与抵扣会在 Quote 中单独列示。"],
  ["可以接入私有知识吗？", "可以。私有和非公开知识库仍需明确授权，并在发现、报价、执行和交付阶段重复检查。"],
  ["发布者如何获得收益？", "合格调用会形成可核对的收入记录与账期对账单；Aptos 只保存隐私保护的账单承诺。"],
] as const;

export default function Home() {
  return (
    <main>
      <SiteHeader />
      <section className="hero container-wide">
        <Badge><Sparkles size={13} className="text-primary" />可信知识路由现已开放</Badge>
        <h1>让每一次 AI 决策，<br />都有可信知识作为依据</h1>
        <p>发现、购买并调用经过验证的专业知识库。让团队获得更准确的答案、完整的引用，以及可控的检索成本。</p>
        <div className="hero-actions"><Button size="lg" asChild><Link href="/marketplace">探索知识市场 <ArrowRight size={16} /></Link></Button><Button size="lg" variant="outline" asChild><Link href="/developers">查看 API</Link></Button></div>
      </section>

      <section className="showcase-wrap container-wide"><div className="showcase home-showcase"><div className="showcase-grid"><div className="showcase-copy"><span>Knowledge Retrieval</span><h2>把团队的知识，变成 AI 可以信任的答案</h2><p>自动选择最合适的知识源，并为每条结论保留引用、版本和费用记录。</p></div><RetrievalPreview /></div></div></section>
      <section className="trust-strip container-wide"><span>品牌展示位 · 正式发布前仅使用已授权客户</span><div>{["NORTHSTAR", "APERTURE", "POLARIS", "ORBITAL", "MOSAIC"].map(x => <b key={x}>{x}</b>)}</div></section>

      <section className="section container-wide">
        <SectionHeading kicker="核心能力" title="可信知识，按照你的工作方式流动" description="从发现、评估到调用与结算，一套基础设施覆盖知识进入 AI 产品的完整链路。" />
        <div className="split-feature"><RetrievalPreview /><div className="feature-copy"><Badge className="section-kicker">智能知识路由</Badge><h2>一次查询，连接最合适的知识</h2><p>根据质量、成本、延迟和权限自动选择知识库。每个回答都携带原始引用、版本信息和完整证据链。</p><ul>{["按问题自动匹配多个专业知识库", "预算、权限和可信度在路由时同步执行", "结果可追溯到具体来源与知识版本"].map(x => <li key={x}><Check size={16} />{x}</li>)}</ul><Button asChild><Link href="/product">了解检索流程 <ArrowRight size={16} /></Link></Button></div></div>
        <div className="capability-grid">{capabilities.map(([Icon, title, desc, metric, label]) => <Card key={title} className="capability-card"><CardHeader><span className="icon-box"><Icon size={20} /></span><h3>{title}</h3><p>{desc}</p></CardHeader><CardContent><b className="metric">{metric}</b><span>{label}</span></CardContent></Card>)}</div>
      </section>

      <section className="section section-tint"><div className="container-wide testimonial-layout"><div><Badge><Quote size={13} />体验引言示例 · 正式发布前需客户授权</Badge><blockquote>“Knowledge Market 让设计师、工程师和研究团队终于基于同一套可信资料作出决策。我们不再争论答案来自哪里。”</blockquote><b>Northstar Labs</b><span>2026 年 6 月</span></div><div className="testimonial-people">{[["AM", "Alex Morgan", "产品负责人"], ["ST", "Sophie Tan", "研究负责人"], ["EC", "Emily Carter", "知识工程师"], ["HL", "Hannah Lee", "平台工程师"]].map(([initials, name, role]) => <Card key={name}><span className="avatar">{initials}</span><div><b>{name}</b><small>{role}</small></div><span className="stars">★★★★★</span></Card>)}</div></div></section>

      <section className="section container-wide"><div className="stats-layout"><div><Badge className="section-kicker"><BarChart3 size={13} />平台目标</Badge><h2>更快找到答案，<br />更放心采取行动</h2><p>无论是查找资料、调用知识还是发布知识服务，Knowledge Market 都帮助用户更快地验证信息、复用知识并控制 AI 成本。</p></div><div className="stats-grid">{[["待发布", "月度知识调用 · 上线后披露"], ["待验证", "决策提速 · 上线后验证"], ["待验证", "满意度 · 上线后验证"], ["待确认", "首发区域 · 上线前确认"]].map(([v,l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div></div></section>

      <section className="section section-tint"><div className="container-wide"><SectionHeading kicker="定价标准" title="每一笔费用如何形成，都清晰可见" description="知识授权、检索调用和专业服务分别定价。具体金额以发布者报价及使用前确认结果为准。" /><div className="pricing-principles">{[["知识授权", "由知识发布者制定", "授权范围、计费单位和更新权益必须明确。"], ["检索调用", "执行前展示预估", "账户预算与 API 限额优先检查，完成后生成费用明细。"], ["专业服务", "根据实际需求评估", "服务范围和交付边界先确认，确认前不产生费用。"]].map(([title,kicker,desc],i) => <Card key={title} className={i===1 ? "featured-principle" : ""}><CardHeader><small>{kicker}</small><h3>{title}</h3><p>{desc}</p></CardHeader><CardContent><Button variant={i===1?"default":"outline"} asChild><Link href="/pricing">了解定价 <ArrowRight size={15} /></Link></Button></CardContent></Card>)}</div></div></section>

      <section className="section container-wide"><div className="faq-layout"><div><Badge className="section-kicker">常见问题</Badge><h2>开始之前，<br />你可能想了解这些</h2><p>没有找到需要的答案？我们的团队可以帮助你评估知识接入和商业化方案。</p><Button variant="outline">联系我们</Button></div><Accordion type="single" defaultValue="item-0" collapsible>{faqs.map(([q,a],i) => <AccordionItem value={`item-${i}`} key={q}><AccordionTrigger>{q}</AccordionTrigger><AccordionContent>{a}</AccordionContent></AccordionItem>)}</Accordion></div></section>

      <section className="newsletter"><div className="container-wide"><div><ShieldCheck size={30} /><h2>持续获得可信 AI 的最新实践</h2><p>产品更新、知识工程方法和市场洞察，直接发送到你的邮箱。</p></div><form><label className="sr-only" htmlFor="newsletter-email">邮箱</label><input id="newsletter-email" type="email" placeholder="email@example.com" /><Button type="submit">订阅</Button><small>我们尊重你的隐私，不发送无关邮件。</small></form></div></section>
      <SiteFooter />
    </main>
  );
}
