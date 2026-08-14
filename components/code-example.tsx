"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const code={fetch:`const response = await fetch("/v1/retrievals", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer <api-key>",\n    "Idempotency-Key": "req_01...",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    query: "最新政策有什么变化？",\n    routing: { mode: "trusted_first" },\n    budget: { currency: "USD", max_cost: "0.10" }\n  })\n});`,curl:`curl -X POST /v1/retrievals \\\n  -H "Authorization: Bearer <api-key>" \\\n  -H "Idempotency-Key: req_01..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"query":"最新政策有什么变化？"}'`,sse:`const events = new EventSource(\n  "/v1/events?retrieval_id=ret_01..."\n);\n\nevents.addEventListener("citation", (event) => {\n  const citation = JSON.parse(event.data);\n  renderCitation(citation);\n});`} as const;

export function CodeExample(){const [copied,setCopied]=useState(false);const [tab,setTab]=useState<keyof typeof code>("fetch");return <Tabs value={tab} onValueChange={v=>setTab(v as keyof typeof code)} className="code-tabs"><div className="code-tabs-head"><TabsList>{Object.keys(code).map(x=><TabsTrigger value={x} key={x}>{x}</TabsTrigger>)}</TabsList><button onClick={async()=>{await navigator.clipboard?.writeText(code[tab]);setCopied(true);setTimeout(()=>setCopied(false),1500)}}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?"已复制":"复制"}</button></div>{Object.entries(code).map(([k,v])=><TabsContent value={k} key={k}><pre>{v}</pre></TabsContent>)}</Tabs>}
