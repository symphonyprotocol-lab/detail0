"use client";

import { useMemo, useState } from "react";
import { Bookmark, Check, ChevronDown, Filter, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const entries = [
  ["AI 与工程","AI Evaluation Handbook","Aperture Research","评估任务设计、人工标注、回归测试与质量监控方法。",["来源公开","固定预览","版本更新"]],
  ["AI 与工程","Retrieval Systems Guide","Polaris Systems","混合检索、重排、去重与多知识库路由的工程实践。",["权利说明","持续维护","引用示例"]],
  ["研究与数据","Model Safety Casebook","Mosaic Safety","模型安全事件、失败模式和缓解措施的结构化案例。",["高风险受限","来源说明","定期发布"]],
  ["法律与合规","Trade Compliance Sourcebook","Regional Trade Lab","跨境贸易、海关与数据传输规则的来源索引。",["官方来源","适用边界","持续同步"]],
  ["研究与数据","Open Research Methods","Open Methods Group","可复现研究设计、统计检查和证据分级方法。",["开放来源","固定版本","公开示例"]],
  ["商业与运营","Support Operations Manual","Service Operations Guild","客户支持流程、知识维护和质量复盘的运营手册。",["持续维护","显式授权","预览可用"]],
] as const;

const categories = ["全部","AI 与工程","研究与数据","法律与合规","商业与运营"];

export function MarketplaceCatalog(){
  const [query,setQuery]=useState(""); const [category,setCategory]=useState("全部");
  const results=useMemo(()=>entries.filter(e=>(category==="全部"||e[0]===category)&&`${e[1]} ${e[2]} ${e[3]}`.toLowerCase().includes(query.toLowerCase())),[query,category]);
  return <div className="catalog-layout">
    <aside className="catalog-filter"><div className="filter-title"><b><Filter size={16}/>筛选</b><button onClick={()=>{setQuery("");setCategory("全部")}}>清除</button></div><div className="filter-group"><strong>领域</strong>{categories.slice(1).map(c=><label key={c}><input type="checkbox" checked={category===c} onChange={()=>setCategory(category===c?"全部":c)}/><span>{c}</span></label>)}</div>{[["来源透明度",["来源说明公开","权利说明完整","更新机制公开"]],["访问方式",["固定预览","受限实时试用","需要授权"]],["更新方式",["持续同步","定期发布","固定版本"]],["语言",["中文","English","多语言"]]].map(([title,items])=><div className="filter-group" key={title as string}><strong>{title as string}</strong>{(items as string[]).map(x=><label key={x}><input type="checkbox"/><span>{x}</span></label>)}</div>)}</aside>
    <div className="catalog-results"><div className="catalog-search-row"><div className="inline-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索知识库、主题或发布者"/></div><Button variant="outline"><SlidersHorizontal size={16}/>按相关性排序 <ChevronDown size={14}/></Button></div><div className="result-summary"><span>{results.length} 个符合当前条件的知识库</span><button><Bookmark size={15}/>已收藏</button></div><div className="result-list">{results.map(([cat,title,publisher,desc,tags],i)=><Card className="result-card" key={title}><span className={`result-cover cover-${i%4}`}><b>0{i+1}</b></span><div className="result-copy"><Badge>{cat}</Badge><h3>{title}</h3><small>{publisher} · 发布者已验证</small><p>{desc}</p><div>{tags.map(t=><span key={t}><Check size={12}/>{t}</span>)}</div></div><div className="result-action"><b>$1</b><span>/ 百万知识 Token</span><Button variant="outline">查看详情</Button></div></Card>)}</div></div>
  </div>
}
