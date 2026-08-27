# Detail0

把公开文档和用户有权使用的私有资料，转换为 AI Agent 可搜索、可检索、可引用的**版本化知识库**。

按成功受理的 API/MCP Call 计费，不按 Token 计费。

## 当前状态

**本仓库目前只有设计文档，没有应用代码。** 上一版站点代码已在提交 `306e76a` 中整体移除，当前处于「设计冻结、准备开工」阶段。

要开始实现，第一步是 [architecture.md](./architecture.md) 第 21 节的第 1 项：建立 App Shell、Contracts、Postgres Schema、身份与工作空间。

## 产品定义

四个入口共用同一套身份、工作空间、知识版本、访问规则、检索、额度和审计规则：

| 入口 | 职责 |
| --- | --- |
| Web | 发现知识库、在线试用、管理知识库和账户 |
| REST API | 稳定、结构化的知识检索与管理接口 |
| MCP | 让 Claude、Codex、Cursor 等 Agent 用两项只读工具取得上下文 |
| CLI / SDK | 安装、配置与 API 封装，不复制服务端业务逻辑 |

核心价值：**最新**（按来源变化创建不可变版本）、**可信**（公开库经来源与安全审核）、**可追溯**（每段上下文保留来源、文档、章节和版本）、**可独立验证**（版本摘要上链，第三方不调用本平台接口即可校验）、**可治理**（工作空间可限制可访问内容）、**可预测计费**（按 Call）。

查询是两阶段的：`resolve-library-id` → `query-docs`。

## 文档地图

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| [requirement.md](./requirement.md) | 产品边界、用户行为、套餐、接口契约、验收标准 | MVP 基线 |
| [architecture.md](./architecture.md) | 运行基座、数据模型、检索、计量、部署与发布 | MVP 基线 |
| [publisher-revenue-share.md](./publisher-revenue-share.md) | 发布者调用分成的完整设计 | MVP 基线 |
| [aptos-anchoring-proposal.md](./aptos-anchoring-proposal.md) | 链上版本、审计与结算单存证 | MVP 基线 |
| `knowleg-market.pen` | 设计稿，27 个画板（Pencil 格式，需用 Pencil 打开） | — |

冲突时的决策顺序以 [requirement.md](./requirement.md) 第 1 节为准：产品规则 → 设计稿 → 架构约束 → Context7 接入模式 → 旧文档与旧设计稿。本文只是索引，不是权威来源。

## 技术栈

| 关注点 | 选型 |
| --- | --- |
| Web 与 BFF | Next.js App Router（Vercel 原生） |
| 运行环境 | Vercel Functions |
| 业务数据库 | Neon Postgres + Drizzle |
| 关键词检索 | Postgres 全文检索 + BM25 |
| 向量检索 | 同库 pgvector，**与 Chunk 同事务** |
| 对象存储 | S3 兼容私有 Bucket，首发 Cloudflare R2 |
| 长任务 | Vercel Workflows |
| 边缘态 | Upstash Redis，**只做**匿名限流与检索缓存 |
| 答案生成 | 外部 LLM Provider，**只用于 Web 在线试用**，不进入 REST/MCP 链路 |
| 链上存证 | Aptos 主网，签名密钥托管在云 KMS，私钥不可导出 |

选型理由和被否决的替代方案记录在 [architecture.md](./architecture.md) 第 1.2 节。其中最关键的一条：Chunk 正文、全文索引和向量在同一个 Postgres 事务内，因此发布是真正的 ACID 事务，不存在跨系统的中间态。

## 套餐

以 USD 计价，只有以下三档，不设 Enterprise。

| | Free | Pro | Additional Calls |
| --- | --- | --- | --- |
| 月费 | $0 | $5 / 月 | $5 / 包，一次性 |
| API/MCP Calls | 1,000 / 月 | 5,000 / 月 | +5,000 Calls |
| Calls 有效期 | 当账期，期末清零 | 当账期，期末清零 | **不过期**，跨账期结转 |
| 自建知识库 | 5 个 | 25 个 | 沿用 Pro |
| 单库容量 | 20 MB | 100 MB | 沿用 Pro |
| 有效 API Key | 3 个 | 20 个 | 沿用 Pro |

扣减顺序固定为「先套餐额度、后调用包余额」。公开知识库全部可查，无需逐库购买。

## 发布者分成

通过审核并**完成认领**的用户公开知识库，按被成功检索的次数从平台收入中分成。要点：

- 只有 `query-docs` 计分成，`resolve-library-id` 和匿名试用不计；
- 未认领的公开库不产生收益，它的调用也不摊薄其他发布者的分配；收益不追溯到认领之前；
- 按可计分成 Call 数线性分配，**不按 Trust Score 加权**——分数只决定资格，不决定金额；
- 收益数据不得进入检索、召回或排序的任何环节；
- 出账由外部支付服务完成，Detail0 不保存银行账号、不持有用户资金。

完整设计见 [publisher-revenue-share.md](./publisher-revenue-share.md)。

## 所有权认领

提交一个公开知识库**不等于拥有它**。所有权只能通过认领取得，认领要回答的不是「你是谁」，而是「你是否控制这个来源」——OAuth 只建立身份，不代表发布权。

| 来源类型 | 验证方式 |
| --- | --- |
| GitHub 仓库 | 仓库权限校验（要求 `admin` 或 `maintain`），备选 DNS TXT |
| Website、`llms.txt` | DNS TXT 记录，备选 well-known 文件 |
| 上传文档、OpenAPI、Notion | 不适用，创建者即所有者 |

**在 `detail0.json` 里放公钥不会授予任何权限**：配置文件的可写范围与来源的控制权不等价，Fork、PR、镜像站都能写那个文件。完整规则见 [requirement.md](./requirement.md) 第 7.3 节，授权链路约束见 [architecture.md](./architecture.md) 第 5.4 节。

## 链上存证

已发布 Version、每日审计链头和已关账的发布者结算单，摘要写入 Aptos 主网。链上**只有摘要**，没有知识正文、Query、用户标识或任何资产。

存证是旁路能力：链或签名账户不可用时，发布、刷新、检索、计量、审核和出账全部不受影响，存证状态停留在待存证。存证不消耗 Call 额度，Free 与 Pro 均包含。

**存证只证明「某时刻的内容就是这一份」，不构成对内容正确性的保证**；对结算单只证明锚定后未被改写，不证明分配算得对。完整设计见 [aptos-anchoring-proposal.md](./aptos-anchoring-proposal.md)。

## 环境准备

`development` / `preview` / `production` **三套环境完全隔离**，各自独立拥有：

- Neon Project 或分支
- 对象存储 Bucket
- Upstash Database 与 REST Token
- OAuth Client、Payment Environment 和 Provider Key
- LLM Provider Key
- Aptos 账户与云 KMS 密钥（非生产使用 Testnet）
- Workflow 名称与 Webhook Secret

**禁止把 Production 数据复制到 Preview**——私有知识库里是用户授权的 Notion 页面与私有仓库内容，测试数据必须脱敏或由 Fixture 生成。

完整环境变量清单见 [architecture.md](./architecture.md) 第 19.1 节。Secret 不得进入前端 Bundle，只允许在 Server Component、Route Handler 和 Workflow 中读取。Anchor Signer 私钥不出现在任何环境变量里。

## 本地开发与登录

```bash
npm install
cp .env.example .env.local   # 填入下面几项，其余可留空
npm run db:migrate           # 需要 DATABASE_URL_UNPOOLED
npm run dev
```

跑通登录最少需要这几个变量：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Neon 分支的连接池端点与直连端点，后者用于迁移 |
| `APP_BASE_URL` | 本地固定 `http://localhost:3000`，回调 URL 由它拼出 |
| `SESSION_SIGNING_SECRET` | 至少 32 字符，用于会话摘要和 OAuth 状态 Cookie 的加密 |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | GitHub OAuth App |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | Google OAuth Client |

两个 Provider 需要登记的回调地址：

```text
http://localhost:3000/api/auth/github/callback
http://localhost:3000/api/auth/google/callback
```

`0002_seed_plans.sql` 会写入 Free 和 Pro 的 Plan Version——首次登录要在同一个事务里创建 Free 订阅，因此迁移必须先于任何流量执行。

测试：

```bash
npm test                                                   # 域与安全用例，不需要数据库
TEST_DATABASE_URL='postgres://...' npx vitest run tests/integration   # 会写库，只指向可丢弃的分支
```

## 界面语言

站点、Dashboard 和演示数据都有中英两套文案，URL 不变，语言由请求决定：

1. `r0_locale` Cookie —— 用户在页眉切换过语言时写入，优先级最高；
2. 浏览器的 `Accept-Language` —— `zh-*` 归中文，其余归英文（`DEFAULT_LOCALE`）。

规则集中在 `lib/i18n/locale.ts`（纯函数，可单测），Server Component 用
`lib/i18n/server.ts` 的 `getMessages()`，Client Component 用
`lib/i18n/client.tsx` 的 `useI18n()` —— 后者由 `app/(public)/layout.tsx` 和
`app/dashboard/layout.tsx` 各自注入本次请求解析出的字典。

**`lib/i18n/messages/zh.ts` 是字典形状的权威来源**：`Dictionary = typeof zh`，
所以 `en.ts` 少一个键、拼错一个键都会编译失败。带运行时值的文案写成 `{name}`
占位符，用 `fill()` 填充——整份字典要跨 Server/Client 边界序列化，不能放函数。

约定：

- **新增文案先写进 `zh.ts`，再补 `en.ts`**，不要在组件里硬编码字符串；
- **筛选器、图标映射一律按 id 或下标匹配，不要按显示文案匹配**——文案会随语言变；
- **存下来的文本（如首次登录生成的工作空间名）在写入时定语言**，见
  `personalWorkspaceName` 与 `CompleteOAuthInput.workspaceNaming`；
- `tests/contract/locale.test.ts` 会检查协商规则、英文文案里的漏译，以及两份字典的占位符是否一致。

`content/docs/**` 的 MDX 正文还只有中文，需要按 Fumadocs 的 i18n 单独接。

## 实现顺序

见 [architecture.md](./architecture.md) 第 21 节，共 14 步。前四步是地基：

1. App Shell、Contracts、Postgres Schema、身份与工作空间
2. Plan Version、API Key、Usage Reservation 和统一错误
3. 对象存储上传、GitHub/Website/Markdown/PDF/OpenAPI Ingestion
4. 全文检索、pgvector、混合检索、Citation 和版本发布

后段有两处顺序是有依赖的，不能调换：**认领（第 10 步）必须早于分成（第 11 步）**，否则会产生一批无主的收益记录；**Earning Anchor（第 13 步）**要等分成跑出可独立复算的真实数据。

## 开发约定

这些约束在 [architecture.md](./architecture.md) 里是硬性的，实现时不要绕开：

- **Route Handler 和 MCP Tool 只能调用 `lib/application` 的 Use Case**，不直接碰数据库；
- **`contracts` 是 REST、MCP、SDK、CLI 和前端共同的权威类型来源**；
- **Provider SDK 只允许出现在 `lib/infrastructure` 和 Workflow 里**；Domain 不依赖 Next.js、Vercel、Neon、Payment、AI SDK 或链 SDK；
- **额度计数不得迁移到 Redis 或任何缓存层**——Reservation 与 Usage Event 是计费事实，必须与业务库同事务；
- **查询必须先授权并固定 Library Version 和 Policy Version**，再做任何召回；
- **Version 不可变**，刷新通过原子切换 `current_version_id` 发布；
- **`library.owner_workspace_id` 只能由已验证的认领或管理员裁定写入**，Ingestion、审核和刷新一律不得触碰；
- **REST 与 MCP 不引入 LLM 依赖**——移除在线试用的生成层后，两者行为必须完全不变；
- **在线试用零结果时不调用模型**，且答案中每条事实必须绑定到本次返回的 Chunk；
- **管理后台不能直连表**，必须经过 Admin Use Case 和 Audit Decorator。

## 待验证事项

开工前需要确认：

- 中文分词方案（Postgres 原生 FTS 需要 `zhparser`、`pg_bigm` 或退回 trigram，取决于 Neon 的扩展支持范围）；
- BM25 排序的实现路径；
- 从 Workflow 写入 100 MB 量级快照到对象存储的实际表现，需压测；
- 云 KMS 对 Ed25519 的支持范围（Aptos 主用 Ed25519，各家 KMS 差异较大），见 [aptos-anchoring-proposal.md](./aptos-anchoring-proposal.md) 第 4.6 节。

前三项见 [architecture.md](./architecture.md) 第 22 节。
