import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeDollarSign, Check, CircleDollarSign, FileKey2, Gift, KeyRound, Layers3, LockKeyhole, ReceiptText, ShieldCheck, Sparkles, TicketCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "定价 | Knowledge Market", description: "透明展示知识调用单价、授权方式、平台费用、税、抵扣和预算边界。" };

const standards=[[BadgeDollarSign,"单价公开","每个知识库以“每百万知识 Token”展示调用单价。","详情页为准"],[ReceiptText,"按交付计费","仅统计实际交付给调用方的知识 Token。","统一口径"],[KeyRound,"授权独立","定价不替代 Access Grant、订阅或显式授权。","先授权"],[Sparkles,"变更可见","发布者调整价格时，在后续调用前展示新标准。","调用前确认"]] as const;
const access=[[Gift,"免费知识库","发布者可以设为免费调用，但仍可要求用户接受访问条件。","发布者选择"],[FileKey2,"Access Grant","为指定用户、应用或 API Key 授予明确范围的访问权。","按授权范围"],[Layers3,"订阅与 Bundle","通过订阅或知识库组合获得持续访问，再按约定规则调用。","组合访问"],[TicketCheck,"显式授权","面向定向分享、受邀访问或特殊范围的授权方式。","单独确认"]] as const;

export default function PricingPage(){return <main><SiteHeader/>
  <section className="page-hero pricing-hero container-wide"><div className="page-hero-copy"><Badge>透明定价标准</Badge><h1>每次调用前，<br/>都知道如何计费</h1><p>Publisher Fee 按实际交付知识 Token 计费；Platform Fee、Tax、抵扣、授权方式与更新规则在 Quote 中逐项展示。</p><div className="hero-actions"><Button size="lg" asChild><Link href="/marketplace">浏览知识市场 <ArrowRight size={16}/></Link></Button><Button size="lg" variant="outline">发布者定价标准</Button></div></div><Card className="price-example"><CardHeader><div><span>知识库价格展示示例</span><Badge>调用前可见</Badge></div><div className="price-amount"><b>$1</b><span>/ 百万知识 Token</span></div><p>这是当前知识库卡片采用的价格示例；不同知识库的最终单价以各自详情页为准。</p></CardHeader><CardContent><div className="formula-mini">Publisher Fee + Platform Fee + Tax − Credit/Promotion = <b>Total Fee</b></div><div className="warning-note"><LockKeyhole size={16}/>价格不会授予访问权；调用仍需有效授权。</div></CardContent></Card></section>

  <section className="section section-tint"><div className="container-wide"><SectionHeading kicker="统一规则" title="知识调用的四项定价标准" description="市场页、详情页和账单使用相同口径。"/><div className="four-grid">{standards.map(([Icon,t,d,s])=><Card key={t}><CardHeader><span className="icon-box"><Icon size={20}/></span><h3>{t}</h3><p>{d}</p><Badge>{s}</Badge></CardHeader></Card>)}</div><div className="wide-note"><ShieldCheck size={18}/>平台不使用未定义的席位套餐；任何特殊授权范围与费用都需在购买前明确确认。</div></div></section>

  <section className="section container-wide"><SectionHeading kicker="访问方式" title="价格不等于访问权" description="先确定授权方式，再按知识 Token 计算调用费用。"/><div className="four-grid">{access.map(([Icon,t,d,s])=><Card key={t}><CardHeader><Icon size={23}/><h3>{t}</h3><p>{d}</p><Badge>{s}</Badge></CardHeader></Card>)}</div><div className="warning-note centered-note">Trust List 仅表示路由偏好，不会授予访问权，也不会绕过知识库价格。</div></section>

  <section className="section section-tint"><div className="container-wide fee-layout"><div><Badge className="section-kicker">计算方式</Badge><h2>总费用由报价中的全部项目组成</h2><p>Publisher Fee 按实际交付知识 Token 计算；Platform Fee、Tax 与 Credit/Promotion 在调用前逐项冻结并披露。</p><div className="budget-chips"><Badge>单次预算</Badge><Badge>周期预算</Badge><Badge>API Key 范围</Badge></div></div><Card className="formula-card"><CardHeader><h3>Total Fee 公式</h3><div className="formula-parts"><div><b>Publisher Fee</b><span>交付 Token × 知识库单价</span></div><strong>+</strong><div><b>Platform Fee / Tax</b><span>按 Quote 冻结</span></div><strong>=</strong><div className="total-part"><b>Total Fee</b><span>扣除 Credit / Promotion</span></div></div></CardHeader><CardContent><div className="warning-note">预算与 FundHold 使用 Quote 的 Total Fee 上限；授权无效或余额不足时不会访问正式知识正文。</div></CardContent></Card></div></section>

  <section className="section container-wide"><SectionHeading align="left" kicker="常见问题" title="关于计费与授权" description="所有规则均可在调用前确认。"/><div className="faq-card-grid">{[["固定预览会计费吗？","不会。固定预览展示预设问题和截断内容，不执行实时检索，也不消耗知识 Token。"],["模型的输入与输出 Token 会算入吗？","Publisher Fee 只按实际交付知识 Token 计算；其余项目在 Quote 和账单中单列。"],["发布者调整价格后会立即扣费吗？","不会静默改变。新价格需要在后续正式调用前展示，并以调用时确认的规则为准。"],["Trust List 或显式授权能绕过价格吗？","不能。Trust List 只是路由偏好；显式授权的范围和计费条件需要单独确认。"]].map(([q,a])=><Card key={q}><CardHeader><h3>{q}</h3><p>{a}</p></CardHeader></Card>)}</div></section>
  <section className="final-cta section-tint"><div className="container-wide"><div><h2>按预算选择适合的知识库</h2><p>比较价格、覆盖范围、来源透明度和授权条件，再决定预览或申请访问。</p></div><div><Button variant="outline">查看定价标准</Button><Button asChild><Link href="/marketplace">浏览知识市场 <ArrowRight size={16}/></Link></Button></div></div></section>
  <SiteFooter/>
</main>}
