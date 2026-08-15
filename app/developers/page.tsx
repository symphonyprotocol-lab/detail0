import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Braces,
  CircleStop,
  Code2,
  FileJson2,
  KeyRound,
  Radio,
  RefreshCcw,
  Route,
  ShieldCheck,
  Waypoints,
} from "lucide-react";
import { CodeExample } from "@/components/code-example";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "开发者 | Knowledge Market",
  description:
    "通过统一 Retrieval API 安全调用可信知识，并获得引用、路由解释、版本和费用。",
};

const request = `{\n  "query": "最新政策有什么变化？",\n  "routing": { "mode": "trusted_first" },\n  "retrieval": { "max_knowledge_tokens": 12000 },\n  "budget": { "currency": "USD", "max_cost": "0.10" }\n}`;

export default function DevelopersPage() {
  return (
    <main>
      <SiteHeader />
      <section className="page-hero developer-hero container-wide">
        <div className="page-hero-copy">
          <Badge>Developer API</Badge>
          <h1>
            用一个接口，让 AI
            <br />
            安全调用可信知识
          </h1>
          <p>
            通过统一 Retrieval API
            指定知识库或自动路由，获得带引用的知识片段、选择原因、版本信息与逐库费用。
          </p>
          <div className="hero-actions">
            <Button size="lg" asChild>
              <Link href="#quickstart">
                查看快速开始 <ArrowRight size={16} />
              </Link>
            </Button>
            <Button size="lg" variant="outline">
              API 参考
            </Button>
          </div>
          <div className="format-badges">
            {["REST", "SSE", "MCP", "OpenAI-compatible Tool"].map((x) => (
              <Badge key={x}>{x}</Badge>
            ))}
          </div>
        </div>
        <div className="request-card">
          <div className="request-head">
            <Badge>POST</Badge>
            <code>/v1/retrievals</code>
            <span>SSE ready</span>
          </div>
          <pre className="request-headers">
            Authorization: Bearer &lt;api-key&gt;{`\n`}Idempotency-Key:
            req_01...{`\n`}Content-Type: application/json
          </pre>
          <pre>{request}</pre>
          <small>Quote · Citation · Usage</small>
        </div>
      </section>

      <section id="quickstart" className="section section-tint">
        <div className="container-wide">
          <SectionHeading
            align="left"
            kicker="快速开始"
            title="从 API Key 到带引用结果"
            description="三个步骤完成最小 Retrieval 调用。"
          />
          <div className="quickstart-layout">
            <Card className="steps-card">
              <CardHeader>
                <h3>接入步骤</h3>
                {[
                  [
                    KeyRound,
                    "创建 API Key",
                    "设置正确 Scope，以及单次、每日和每月预算。",
                  ],
                  [
                    RefreshCcw,
                    "构造幂等请求",
                    "传入 Idempotency-Key、Query、Routing Mode 与预算上限。",
                  ],
                  [
                    FileJson2,
                    "读取结果与引用",
                    "检查所选知识库、Citation、Usage、Quote 和停止原因。",
                  ],
                ].map(([Icon, t, d], i) => (
                  <div className="quick-step" key={t as string}>
                    <span>{i + 1}</span>
                    <Icon size={18} />
                    <div>
                      <b>{t as string}</b>
                      <p>{d as string}</p>
                    </div>
                  </div>
                ))}
                <div className="warning-note">
                  同一幂等键只对应一个规范化请求。
                </div>
              </CardHeader>
            </Card>
            <div>
              <CodeExample />
              <div className="response-contract">
                <div>
                  <b>响应中可验证的内容</b>
                  <Badge>标准响应</Badge>
                </div>
                {[
                  ["交付知识", "知识片段与 Token"],
                  ["Citation", "来源定位"],
                  ["路由解释", "选库与停止原因"],
                  ["Usage & Quote", "逐项费用与账务"],
                ].map(([t, d]) => (
                  <span key={t}>
                    <b>{t}</b>
                    <small>{d}</small>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section container-wide">
        <SectionHeading
          kicker="统一能力"
          title="一个 API，覆盖完整知识调用"
          description="按任务选择模式，而不是维护多套接口。"
        />
        <div className="four-grid">
          {[
            [
              Route,
              "知识路由",
              "trusted_only、trusted_first、marketplace_auto 与 bundle。",
              "选择模式",
            ],
            [
              Braces,
              "响应格式",
              "Retrieval-only、带引用短答案与结构化输出。",
              "按需返回",
            ],
            [
              Radio,
              "执行方式",
              "同步、异步状态、SSE、取消与明确接受的部分结果。",
              "可恢复",
            ],
            [
              Code2,
              "生态适配",
              "REST、MCP、OpenAI-compatible Tool 与常用框架适配。",
              "统一契约",
            ],
          ].map(([Icon, t, d, s]) => (
            <Card key={t as string}>
              <CardHeader>
                <span className="icon-box">
                  <Icon size={20} />
                </span>
                <h3>{t as string}</h3>
                <p>{d as string}</p>
                <Badge>{s as string}</Badge>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="section section-tint">
        <div className="container-wide secure-flow">
          <div>
            <Badge className="section-kicker">执行路径</Badge>
            <h2>一次调用的安全路径</h2>
            <p>
              认证、授权、价格、预算和知识版本在正式访问付费正文前被共同检查。
            </p>
            <div className="warning-note">
              Query、Chunk 与 API Key 不写入普通日志或 Analytics。
            </div>
          </div>
          <Card>
            <CardHeader>
              {[
                [
                  KeyRound,
                  "认证与幂等",
                  "校验 API Key、Scope、限流、Schema 和 Idempotency-Key。",
                ],
                [
                  ShieldCheck,
                  "授权与 Quote",
                  "冻结访问权、预算、价格、Policy 与知识版本。",
                ],
                [
                  Waypoints,
                  "路由与检索",
                  "按 Routing Mode 执行搜索、去重与充分性检查。",
                ],
                [
                  CircleStop,
                  "交付与结算",
                  "返回 Citation、Usage、费用、停止原因和账务状态。",
                ],
              ].map(([Icon, t, d], i) => (
                <div className="secure-step" key={t as string}>
                  <span>0{i + 1}</span>
                  <Icon size={18} />
                  <div>
                    <b>{t as string}</b>
                    <p>{d as string}</p>
                  </div>
                </div>
              ))}
            </CardHeader>
          </Card>
        </div>
      </section>

      <section className="section container-wide">
        <SectionHeading
          align="left"
          kicker="API 资源"
          title="从资源端点到运行约定"
          description="所有契约由 OpenAPI 与 JSON Schema 统一生成。"
        />
        <div className="resources-layout">
          <Card>
            <CardHeader>
              <h3>核心资源端点</h3>
              <div className="endpoint-grid">
                {[
                  ["目录", ["/v1/knowledge-bases", "/v1/catalog/search"]],
                  ["访问", ["/v1/trust-list", "/v1/access-grants"]],
                  ["检索", ["/v1/quotes", "/v1/retrievals", "/v1/events"]],
                  ["账务", ["/v1/balance", "/v1/transactions", "/v1/refunds"]],
                ].map(([g, eps]) => (
                  <div key={g as string}>
                    <b>{g as string}</b>
                    {(eps as string[]).map((x) => (
                      <code key={x}>{x}</code>
                    ))}
                  </div>
                ))}
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <h3>运行约定</h3>
              {[
                ["OpenAPI & JSON Schema", "API、Workflow 与数据库共享类型源"],
                ["标准错误", "code、message、request_id、trace_id、retryable"],
                ["幂等冲突", "同 Key 不同摘要返回 409 idempotency_conflict"],
                ["SSE 恢复", "使用 Event ID 恢复，最终状态从 API 读取"],
              ].map(([t, d]) => (
                <div className="runtime-row" key={t}>
                  <b>{t}</b>
                  <span>{d}</span>
                </div>
              ))}
            </CardHeader>
          </Card>
        </div>
      </section>
      <section className="final-cta section-tint">
        <div className="container-wide">
          <div>
            <h2>开始构建可信知识调用</h2>
            <p>
              创建受 Scope 和预算约束的 API Key，然后完成第一条幂等 Retrieval
              请求。
            </p>
          </div>
          <div>
            <Button variant="outline">阅读 API 文档</Button>
            <Button>
              创建 API Key <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
