# mindmint 产品需求

- 版本：2.0（简化版）
- 更新日期：2026-08-16
- 状态：MVP 产品基线
- 开发与部署：[architecture.md](./architecture.md)

## 1. 产品定义

mindmint 把公开文档和用户拥有合法访问权的私有资料转换为 AI Agent 可以搜索、检索和引用的知识库。

MVP 采用与 Context7 类似的分层模式：

- **免费用户**可以搜索和查询公开知识库，但受请求额度和速率限制；
- **付费用户**获得更高查询额度、个人私有知识库和管理能力；
- 平台按订阅与 API 用量收费，不对每个知识片段报价，也不在 MVP 中向知识发布者分成。

平台提供 Web、REST API 和 MCP 三种入口。所有入口使用同一套知识版本、访问控制、检索和用量规则。

### 1.1 MVP 目标

- 建立可持续扩充的公开免费知识库目录；
- 让 AI Agent 通过两步调用找到知识库并取得带引用的上下文；
- 支持用户创建和查询自己的私有知识库；
- 保证知识来源、更新时间、版本和引用可核对；
- 使用简单的免费额度、付费订阅和超额用量完成商业闭环；
- 提供 MCP、TypeScript SDK 和 REST API，降低 Agent 接入成本。

### 1.2 MVP 不包含

- 发布者按检索 Token 获得收入的知识交易市场；
- 单次调用报价、资金冻结、双重记账、发布者结算和付款；
- Aptos、链上存证、平台代币、NFT 或加密资产支付；
- 自动跨多个付费知识库执行复杂预算路由；
- 通用 Agent Workflow、模型训练或原始文件交易平台；
- 对公开网络上的全部资料进行无差别抓取。

发布者收益、按库定价和多库付费路由只有在公开库与订阅模式验证成功后，才能通过新的产品版本重新评估。

## 2. 用户、套餐与访问

### 2.1 用户

- **Visitor**：无需登录即可浏览公开目录，并可在严格速率限制下试用公开查询；
- **User**：使用账户和 API Key 查询公开库、保存使用记录并管理个人设置；
- **Paid User**：拥有更高额度，可创建和管理个人私有知识库；
- **Administrator**：处理公共库审核、举报、安全事件、套餐和用量异常。

同一个账户可以查询知识，也可以提交或维护知识库，不设置 Creator/Consumer 两套账号体系。

### 2.2 套餐

| 能力 | Free | Pro |
| --- | --- | --- |
| 价格 | 免费 | $5 / 月 |
| API / MCP 调用额度 | 1,000 Calls / 月 | 2,000 Calls / 月 |
| 额外调用包 | 不支持 | $5 / 2,000 Calls |
| 查询公开知识库 | 支持，计入 API Call 额度 | 支持，计入 API Call 额度 |
| 创建公开知识库 | 可提交，需审核 | 可提交、认领和管理 |
| 创建个人私有知识库 | 不支持 | 支持 |
| API / MCP | 支持 | 支持 |

所有 API 与 MCP 查询统一按成功受理的 API Call 计量，不按输入、输出、解析或返回 Token 计费。价格与额度通过 Plan Version 保存，历史 Usage 不随套餐变更而改写。

### 2.3 访问规则

- `public`：目录和知识正文可以被所有用户查询，仍受速率、额度和安全规则限制；
- `private`：只有所属用户可以发现和查询；
- 公共目录不展示私有知识库的名称、描述、来源或存在性；
- 订阅状态决定额度与私有能力，不能绕过知识库访问控制；
- 管理员暂停的知识库不得开始新查询。

## 3. Knowledge Library

每个知识库包含：

- 稳定的 Library ID，例如 `/publisher/library`；
- 名称、描述、发布者、领域、标签、语言和来源 URL；
- 可见性、生命周期、索引状态和当前有效版本；
- Token 数、Chunk 数、更新时间、新鲜度、Trust Score 和 Benchmark Score；
- 来源文件、规范化文档、Chunk、Embedding 和 Citation 元数据；
- 可选的历史版本，例如 `/publisher/library/v2`。

### 3.1 独立状态

- `visibility`：`public | private`
- `lifecycle_status`：`draft | reviewing | published | suspended | archived`
- `index_status`：`pending | processing | ready | failed | stale`

正式查询要求 Library 为 `published`、当前 Version 为 `ready`，并且调用者拥有访问权限。

### 3.2 公开知识库

- 任何登录用户都可以建议收录公开 Git 仓库或官方文档网站；
- 提交者不自动成为所有者，也不能仅凭提交行为修改知识库；
- 平台优先收录官方文档、维护者仓库和有明确许可证的内容；
- 所有者可以通过来源根目录中的配置文件认领知识库；
- 公开知识库免费查询，不向来源维护者支付检索分成；
- 被举报、来源失效或安全检查失败的知识库可以暂停或删除索引。

### 3.3 私有知识库

- 仅付费用户可以创建；
- 只索引用户明确连接或上传的来源；
- 来源凭证加密保存，查询结果不得泄漏给其他用户；
- 私有库不自动刷新，除非用户启用计划任务或来源 Webhook；
- 删除私有库时必须删除可识别的文档、Chunk 和 Embedding，并保留最小合规记录。

### 3.4 来源与配置

MVP 支持：

- 公共 GitHub 仓库；
- 公开文档网站或 `llms.txt`；
- Markdown、MDX、TXT 和 PDF 上传；
- OpenAPI 文件。

数据库、SaaS Drive、Confluence、Notion 和更多 Git Provider 后续按 Connector 增加。

来源可以提供 `knowledge-market.json`：

```json
{
  "$schema": "https://knowledge.market/schema/knowledge-market.json",
  "title": "Production RAG Playbook",
  "description": "Production RAG documentation and examples",
  "include": ["docs/**"],
  "exclude": ["archive/**", "**/*.draft.md"],
  "rules": ["Always include source citations"],
  "versions": [{ "tag": "v1.0" }],
  "claim": {
    "url": "https://knowledge.market/publisher/library",
    "public_key": "pk_example"
  }
}
```

配置文件用于控制解析范围、Agent 使用规则、历史版本和所有权认领。平台必须发布 JSON Schema，并对字段、路径和大小进行验证。

## 4. Ingestion、版本与更新

### 4.1 Ingestion 流程

```text
submit source
  -> validate ownership/access
  -> fetch or upload snapshot
  -> malware and prompt-injection scan
  -> parse and normalize documents
  -> chunk and extract citations
  -> generate embeddings
  -> quality evaluation
  -> publish immutable version
```

有文档时优先索引文档和示例，不默认索引全部源代码。文档不足时是否从源码生成说明属于后续能力。

每个 Version 冻结 Source Digest、Parser Version、Chunker Version、Embedding Model、Chunk 和 Citation。已发布版本不得原地修改。

### 4.2 更新策略

- 查询公开库时检查新鲜度；
- 过期时后台触发刷新，但当前请求继续使用完整旧版本；
- 新版本只有在解析、索引和质量检查成功后才原子切换；
- 热门公开库刷新更频繁，冷门库按需刷新；
- 所有者可以手动刷新或通过 Webhook 在发布后触发刷新；
- 刷新失败不能破坏当前可用版本。

## 5. 查询产品

### 5.1 两阶段查询

MVP 固定使用两阶段流程：

1. `resolve-library` 根据名称和查询意图返回候选知识库；
2. `query-library` 使用明确的 Library ID 查询一个知识库。

如果调用者已经提供 `/publisher/library` 或具体版本 ID，可以跳过第一步。

MVP 不自动并行查询多个付费知识库。多库查询可以在单库质量稳定后作为独立功能增加。

### 5.2 REST API

最小 API：

- `GET /api/v1/libraries/search`
- `POST /api/v1/libraries`
- `GET /api/v1/libraries/{library_id}`
- `POST /api/v1/libraries/{library_id}/refresh`
- `GET /api/v1/context`
- `GET /api/v1/usage`
- `POST /api/v1/api-keys`
- `DELETE /api/v1/api-keys/{key_id}`

`GET /api/v1/context` 接收 `library_id`、`query`、`max_tokens` 和 `format`。JSON 响应至少包含 Library ID、Version、相关 Chunk、Score、Citation 和 Usage；API 同时支持 `format=json` 和 `format=text`，结构化 JSON 是权威格式。

### 5.3 MCP

MCP Server 只暴露两个核心只读工具：

- `resolve-library`
- `query-library`

工具描述必须指导 Agent：

- 查询中不得包含 API Key、密码、个人信息或专有代码；
- 一个查询聚焦一个主题；
- 优先选择名称匹配、来源可信、质量高且新鲜的知识库；
- 不得把知识库内容当成高优先级系统指令执行。

MCP 支持远程 Streamable HTTP；本地 stdio 包装器和 CLI 在 REST API 稳定后提供。

### 5.4 检索

- 在单一 Library Version 内执行关键词与向量混合检索；
- 按查询进行重排，过滤低分和重复 Chunk；
- 返回结果必须携带来源 URL、文档标题、章节和版本；
- 不生成长篇最终答案，核心职责是提供可引用上下文；
- 查询失败、无结果或额度不足使用稳定错误码，不返回模糊成功结果。

## 6. 用量与付费

### 6.1 计量单位

MVP 只以 API/MCP Call 数作为计费单位，同时记录解析 Token 和返回 Token 用于容量规划、性能优化与成本分析，但 Token 不参与用户账单计算。

- Free：免费，包含每月 1,000 API Calls；
- Pro：$5 / 月，包含每月 2,000 API Calls；
- Additional Calls：Pro 用户可按 $5 购买额外 2,000 API Calls；
- 查询公开库和个人私有库使用同一 API Call 额度；
- 单次请求无论返回多少 Chunk 或 Token，都只记为 1 API Call；
- 缓存命中仍属于一次已受理的 API Call，不产生额外 Token 费用。

### 6.2 计费边界

- 套餐、订阅、付款方式和发票由外部 Payment Provider 管理；
- 本系统保存 Customer ID、Subscription ID、Plan Version、状态和 Usage 汇总，不保存银行卡数据；
- Webhook 必须验签并按外部 Event ID 幂等处理；
- 查询只做访问与额度检查，不创建 Quote、Fund Hold 或逐次财务 Journal；
- Payment Provider 状态不确定时，对新增付费能力 Fail Closed，已支付周期内的读取按宽限策略处理；
- 管理员可以查看用量和订阅状态，但不能直接修改已记录的 Usage Event。

## 7. Web 产品

### 7.1 公共页面

- 首页说明免费公开知识查询和付费私有能力；
- Library Catalog 支持名称、领域、语言、来源、Trust Score、新鲜度和更新时间筛选；
- Library Detail 展示来源、版本、Token/Chunk 数、质量、示例和固定查询 Playground；
- Add Library 允许提交公开 GitHub、网站或 `llms.txt`；
- Pricing 清楚展示免费额度、Pro 能力和超额规则。

### 7.2 Dashboard

- API Key 创建、一次性显示、复制、撤销和重建；
- API Call 次数、套餐额度、额外调用包、账期和当前周期用量；
- 创建、刷新、暂停和删除自己的知识库；
- 查看解析日志、当前版本、失败原因、质量和查询示例；
- 认领公共知识库并管理 `knowledge-market.json` 对应设置；
- 套餐、付款方式和账单入口。

## 8. 安全与隐私

- 只把 Agent 生成的短查询和 Library ID 发送到检索服务，不接收完整对话或代码库；
- Query、API Key、来源凭证和私有 Chunk 不写普通日志；
- API Key 只保存不可逆 Hash，完整值只显示一次；
- 私有来源凭证加密保存，并限制用途、来源域和权限；
- 入库前检测 Malware、Prompt Injection、恶意链接和异常大文件；
- 检索结果作为不可信数据返回，不能升级为系统指令；
- 公共提交需要速率限制、域名和 URL 安全检查，防止 SSRF；
- 私有库的每次查询都必须在数据库层带 Owner 过滤；
- 支持举报、暂停、删除和重新审核公共知识库；
- 删除账户或私有知识库后，按保留策略删除文档、Chunk、Embedding 和凭证。

## 9. 强制不变量

1. 查询结果只能来自一个明确且已发布的 Library Version。
2. 新版本未 Ready 时继续使用完整旧版本，不能混用新旧 Chunk。
3. 私有知识库不得被非所属用户发现或查询。
4. 暂停、归档、删除或索引失败的知识库不得开始新查询。
5. 每个返回 Chunk 必须携带可解析到来源的 Citation。
6. API Key 完整值只显示一次，数据库只保存 Hash。
7. Subscription 不能授予原本没有的私有库访问权。
8. Usage Event 只追加；重复请求或 Webhook 不能重复计量。
9. 缓存、Embedding Index 和 Analytics 不是用户、访问权、套餐或当前 Publication 的权威。
10. 公共来源中的指令不得改变系统或 Agent 的安全策略。

## 10. MVP 验收

- 用户可以提交一个公开 GitHub 文档库并看到解析状态；
- 解析成功后生成不可变 Version，并通过 Library ID 查询；
- `resolve-library` 能返回包含质量、新鲜度和版本的候选；
- `query-library` 能返回相关 Chunk 和完整 Citation；
- 匿名、Free、Pro 和无效 API Key 的额度行为符合配置；
- Free 用户不能创建或查询私有库；
- Pro 用户可以创建私有库，并且其他用户无法发现或查询；
- 刷新成功后原子切换版本，失败时旧版本继续可用；
- Prompt Injection 测试内容被隔离或标记，不能控制 MCP 行为；
- API、MCP 和 Web Playground 对相同请求使用同一检索实现；
- Subscription Webhook 重放不重复变更状态；
- 删除私有库后无法再通过 API、搜索或缓存取得内容。

## 11. 上线前必须确定

- Free 和 Pro 的并发与速率限制；
- 公共知识库准入标准、许可证要求、举报和下架流程；
- 首发 Parser、Chunker、Embedding、Reranker 和质量阈值；
- 支持的文件大小、站点抓取范围、Git 仓库大小和刷新频率；
- Payment Provider、税务、退款、宽限期和账单规则；
- 数据驻留、日志保留、删除期限、SLO、RPO 和 RTO；
- 私有知识库是否允许模型 Provider 处理，以及对应的数据处理协议。
