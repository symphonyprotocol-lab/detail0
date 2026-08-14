# Knowledge Market 产品需求

- 版本：1.0
- 更新日期：2026-08-14
- 状态：产品需求基线
- 开发与部署：[architecture.md](./architecture.md)

## 1. 产品定义

Knowledge Market 让用户把拥有合法权利的文档、数据源和专业知识转换为 AI Agent 可以发现、检索、引用和付费使用的知识服务，同时也能发现并调用其他用户发布的知识。

平台交易的是受控知识检索服务，不是原始文件所有权。调用知识的用户使用美元支付，发布知识的用户使用美元收款；同一用户可以同时进行两类活动。Aptos 只发布隐私保护的收益账单承诺，不托管资金、不扣款、不执行付款。

### 1.1 用户与能力

- **User**：使用同一个账户发现、调用、创建、发布和维护知识库，并统一管理预算、费用、收入与收益账单。
- **Administrator**：负责准入、审核、投诉、安全、财务和运营异常。
- **End User**：通过 User 的 Agent 间接使用知识；身份可选且必须最小化或匿名化。

Creator 和 Consumer 只表示一笔发布或调用行为中的上下文身份，不是账号类型、系统角色或独立工作区。平台不得要求用户切换角色，也不得为创作和使用维护两套导航、设置或账户余额。

### 1.2 目标

- 安全接入文件和持续同步数据源。
- 发布不可变、可追溯、可回滚的知识版本。
- 支持 Private、Unlisted 和 Public Marketplace。
- 使用统一 API 完成指定库和自动选库检索。
- 准确完成美元报价、冻结、计量、结算、退款和对账。
- 知识发布者只从最终实际交付的知识正文获得收益。
- 提供可验证的引用、路由解释、调用记录和收益存证。

### 1.3 不包含

- 默认出售或下载完整原始文件。
- 通用大模型训练平台或通用 Agent Workflow 平台。
- 加密资产支付、平台代币、NFT、DeFi、质押或链上资金托管。
- 把问题、知识正文、真实身份、稳定身份哈希或金额写入 Aptos。
- 承诺完全阻止通过大量合法查询推断知识内容。

## 2. Knowledge Base

每个 Knowledge Base 包含：

- 名称、简介、发布者、领域、标签、语言和封面；
- 适用与不适用场景；
- 来源、内容权利和更新说明；
- 不可变的 Knowledge、Index、Tokenizer 和 Publication Version；
- 可见性、授权、许可、质量指标和 Price Version；
- 示例、固定预览和可选的受限实时试用。

支持 PDF、Word、Markdown、文本、网页、SaaS Drive、数据库、API、结构化问答和持续同步数据源。每种 Connector 必须通过授权、增量同步、删除、限流和安全测试后才能开放。

### 2.1 独立状态

以下状态必须分开保存：

- `visibility`：`private | unlisted | public_marketplace`
- `lifecycle_status`：`draft | reviewing | published | rejected | suspended | archived`
- `index_status`：`pending | building | ready | failed | stale`

正式检索要求 Publication 为 `published`、所选 Index 为 `ready`，并且调用者拥有当前有效授权。新 Index 未就绪时继续使用完整旧 Publication，不能混用新旧 Chunk。

`public_marketplace` 只表示 Catalog 元数据可以被公开发现，不表示知识正文可以匿名或无授权读取。免费、付费和公开知识库在正式检索前都必须形成可审计的有效授权或已接受的公开访问条款；`unlisted` 只允许通过不可枚举入口发现，并仍需显式授权。

## 3. 功能需求

### 3.1 知识创建与发布

用户作为知识发布者时必须能够：

- 创建知识库和数据源；
- 上传文件或连接外部来源，查看同步状态；
- 查看解析、切分、索引、评测和失败原因；
- 在 Playground 验证检索和引用；
- 配置可见性、授权、许可、价格、试用和保留规则；
- 提交审核、原子发布、回滚到合格版本、暂停或归档；
- 查看用量、质量、收入、调整、付款和 Aptos 验证结果。

Publication 必须冻结 Source Snapshot、规范化内容、Chunk、Index、Evaluation、Policy、Price、Tokenizer 和 Digest Version。已发布版本不得原地修改；任何变更创建新版本。

### 3.2 Marketplace 与访问

用户作为知识使用者时必须能够：

- 搜索和过滤公开 Catalog 元数据；
- 查看发布者、覆盖范围、排除范围、来源透明度、新鲜度、质量、价格、可用性、示例和引用；
- 使用固定预览或经过批准的受限实时试用；
- 收藏知识库或加入 Trust List；
- 获取 Access Grant、Subscription 或 Bundle；
- 创建 API Key，并设置单次、每日和每月预算。

Trust List 只是路由偏好，不能授予访问、购买 Subscription 或绕过价格。

Marketplace Visibility、正文访问授权和计费权益是三个独立维度。公开目录不得把 `public_marketplace` 解释为“正文无需授权”，Access Grant 页面也必须显示公开知识库当前采用的授权或条款接受状态。

### 3.3 Retrieval API

API 必须支持：

- 指定一个或多个 Knowledge Base；
- `trusted_only`、`trusted_first`、`marketplace_auto` 和 `bundle`；
- Retrieval-only、带引用的简短答案和结构化输出；
- 同步、异步状态、SSE、取消，以及调用者明确接受的部分结果；
- REST，以及 MCP、OpenAI-compatible Tool 和常用框架适配。

每个付费创建或执行请求必须提供：

- 具有正确 Scope 的 API Key；
- HTTP Header `Idempotency-Key`；
- Query，以及 Knowledge Base ID 或 Routing Mode；
- 请求或 API Key 默认值提供的 `budget.max_cost`，使用 USD 十进制字符串；
- 最大知识 Token、知识库数量、知识单价、执行时间和部分结果策略。

请求示例：

```http
Authorization: Bearer <api-key>
Idempotency-Key: req_01...
Content-Type: application/json
```

```json
{
  "query": "最新政策有什么变化？",
  "knowledge_base_ids": [],
  "routing": {
    "mode": "trusted_first",
    "fallback_to_marketplace": true,
    "allow_parallel": false,
    "max_trusted_kbs": 3,
    "max_marketplace_kbs": 2
  },
  "retrieval": {
    "max_knowledge_tokens": 12000
  },
  "budget": {
    "currency": "USD",
    "max_cost": "0.10",
    "max_price_per_million_knowledge_tokens": "20.00"
  },
  "execution": {
    "timeout_ms": 8000,
    "accept_partial": false
  }
}
```

响应必须包含：

- 实际交付的知识片段、Citation、评分和更新时间；
- Knowledge、Index、Tokenizer、Policy、Price、Router 和 Sufficiency Version；
- 所选知识库、访问顺序与原因、回退路径和停止原因；
- Request、Delivered Knowledge 和 Platform Output Token；
- Quote、逐库 Publisher Fee、Platform Fee、Total Fee 和账务状态；
- 权限、预算、质量或执行失败时的标准原因码。

### 3.4 Knowledge Router

路由分两阶段：

1. **免费 Catalog 选库**只使用公开或已授权的元数据，不读取付费 Chunk、不产生发布者收益。
2. **渐进式检索**先访问最优合格知识库，只在 Sufficiency Policy、预算、知识库数量和 Deadline 允许时扩展。

访问付费正文前，每个候选必须通过授权、生命周期、价格、语言、新鲜度、质量、地区和 Allow/Deny List 检查。默认渐进执行；只有调用者明确允许且最大费用已完全冻结时才能并行。

Sufficiency Policy 必须版本化相关性、最少有效 Chunk、独立 Citation、新鲜度、冲突处理和停止原因。多库结果必须去重，同一正文不得重复收取完整知识费。

### 3.5 定价与权益

产品支持：

- 免费知识库；
- 发布者按每百万实际交付知识 Token 定价；
- 单独披露的 Platform Processing Fee；
- Prepaid Balance、Included Quota、Subscription、Tier、Bundle、Promotion 和预先确认的特殊授权；
- Request、API Key、Agent、End User、Tenant 的单次、每日和每月限制。

Quote 必须冻结 Price、Policy、Entitlement、Promotion、Tax、Tokenizer 和 Knowledge Version，并包含过期时间。之后调价不能改变已接受 Quote 或历史账单。

Publisher Fee 只使用最终、去重、实际交付的知识正文 Token。Query、Routing、Rerank、Generation、Aggregation、Platform Output、未访问候选和内部召回但未交付的 Chunk 都不产生发布者收益。

`Total Fee = Publisher Fee + Platform Processing Fee + Tax - Credit/Promotion`。调用前和调用后都必须逐项展示，任何页面不得把 Publisher Fee 单独称为“总费用”。预算与 FundHold 使用冻结 Quote 的 Total Fee 上限，而不是只使用知识库单价。

### 3.6 资金与结算

每个付费调用必须：

1. 创建或复用 Idempotency Record；
2. 授权调用者并生成不可变 Quote；
3. 原子检查 Entitlement、Limit 和 Available Balance；
4. 在访问付费正文前创建唯一的最大费用 FundHold；
5. 计量最终交付 Artifact；
6. 写入一笔平衡 Settlement，并释放剩余 Hold；
7. 相同重试返回原结果和原账务状态。

无结果、平台错误、未接受的部分结果或交付前取消，Usage Charge 必须为 0 并释放 Hold。Refund、Chargeback、Correction 和 Late Event 只能新增 Reversal/Adjustment，不得覆盖历史账务。

权威币种为 USD。内部 Ledger 和 Statement 使用整数 nano-USD，每次完成交易只在结算精度执行一次 half-even 舍入；页面显示不能改变账本值。

### 3.7 发布者收益与 Aptos

Publisher Net Revenue 等于合格 Publisher Fee 减去已披露佣金和发布者应承担的 Adjustment。平台促销和平台责任退款不得减少发布者收益。

Private、Unlisted 和 Public Marketplace Publication 产生的合格付费调用使用相同收益规则；可见性不得决定收益是否显示或是否进入对账单。

账期只有在 Usage、Ledger、Payment Provider、Statement 和 Aptos 无未解释差异时才能关闭。完整 Statement 至少包含匿名调用 ID、全部版本、实际交付 Token、Price、Fee、Adjustment、Net Revenue、时间和状态。

Aptos 只接收全局唯一 Batch ID、Schema/Version、每期随机盐生成的 Subject Commitment、Statement/Payload Digest，以及可选 Relation/Payout Reference Commitment；不得接收金额或敏感经营数据。链上只能证明承诺存在且未被修改，不能证明调用真实发生或美元已经付款。

Correction 和 Payout Confirmation 使用新 Batch。发布者付款始终由链下银行或 Payment Provider 完成。

### 3.8 管理、安全与隐私

平台必须提供：

- 发布者准入和内容权利声明；
- 审核、投诉、下架、申诉和恢复；
- 高风险领域限制和人工审核；
- Malware、敏感数据、Prompt Injection、Poisoning 和输出安全检查；
- Rate Limit、最大返回量、相似查询检测、提取窗口和跨 API Key 滥用检测；
- Payout Account 验证、变更冷静期和异常付款拦截；
- Purpose、Retention、Deletion、Legal Hold 和 Backup Expiry；
- 安全、访问、发布、配置、资金和链上操作的不可变 Audit Trail。

Audit Trail 必须只追加、禁止原地更新或删除、具备篡改检测和受控保留策略。运行时只能通过受控写入命令追加事件；管理员不能绕过 Legal Hold、Retention 或审计完整性检查。

Query、Chunk、Credential、Payout Detail 和私有来源元数据不得写入普通日志或 Analytics。

### 3.9 统一 Dashboard 交互

所有登录后页面共用全局搜索、账户上下文、导航、Dialog、Drawer、Toast、表单校验和确认模式。必须实现：

- 市场筛选、价格保护、排序、预览和知识库详情；
- Trust List 条目优先级、回退策略、移除和顺序保存；
- 访问申请的对象、用途、期限、预算和提交结果；
- API Key 创建、Scope、预算、一次性密钥展示、复制、撤销和重建；
- 调用记录筛选、详情、路由解释、引用、Token、费用和导出；
- 充值、付款确认、预算保存和账单/对账单查看；
- 账户偏好、社交登录、活跃会话、通知设置和保存反馈；
- 知识库创建、数据源连接、草稿保存、发布检查和不可变发布确认；
- 版本比较、质量门禁、Playground、回滚原因和回滚确认；
- 收款账户、身份验证、最低付款额、收益对账单和 Aptos Proof 配置。
- 管理员审核队列、内容权利检查、投诉/申诉、下架/恢复、安全事件、财务异常、对账差异和 Proof Backlog。
- Index Failed/Stale、Publication Rejected/Suspended/Archived、Access Revoked、Payment/Provider Unknown、未接受 Partial Result、退款/拒付和 Aptos Pending/Failed 等关键异常状态。

敏感值只能在必要步骤展示。API Key 完整值只显示一次；付款、发布、回滚、撤权和收款配置等高风险操作必须明确说明影响并二次确认。空状态必须提供可执行的下一步，成功提示不能替代服务端权威状态。

Dashboard 与公开页面至少覆盖 360、768、1024 和 1440 像素宽度。正文、标签和交互控件必须保持可读、可缩放、可键盘操作并具有清晰 Focus；关键业务文案不得依赖小于 12px 的文字表达，主要交互文字默认不小于 14px。

## 4. 强制不变量

1. 已过账 Journal 的 Debit 总额等于 Credit 总额。
2. Available Balance 等于已过账预充值负债减有效 Hold 和其他约束，且不得为负。
3. 同一 API Key 与 Idempotency Key 最多对应一个规范化请求和一个财务结果。
4. 没有成功 Hold，不得访问或交付付费知识正文。
5. Publisher Fee 只来自最终、去重、实际交付的知识正文。
6. 每个 Artifact 必须解析到唯一 Publication、Index、Policy、Price、Tokenizer、Router 和 Sufficiency Version。
7. Suspended、Revoked、Unpublished、Unready 或 Unauthorized Knowledge 不得开始新检索。
8. 发现、报价、执行和交付都必须执行相应授权检查。
9. Trust List 不能授予访问。
10. Payout 不得超过已对账且未被其他 Payout 覆盖的 Publisher Payable。
11. Closed Statement 不可修改；纠错只能新增 Adjustment。
12. 同一 Aptos Batch ID 不能对应两个不同 Payload Digest。
13. 发布者必须能用 Statement、Salt 和公开算法复算链上 Commitment。
14. Cache、Search、Analytics、Workflow Log 和 Aptos 不能成为余额、权限或 Publication 权威。
15. 除非存在明确且有效的授权，所有 Cross-tenant Access 默认拒绝。
16. 外部财务或链上结果不确定时必须先查询或对账，禁止盲目重试。

## 5. 质量与运营要求

- 至少 80% 的合格付费调用返回一个或以上有效 Chunk 和完整 Citation；具体领域可要求更高阈值。
- 平台技术错误导致的合格付费调用失败率低于 2%；权限、预算和知识不足单独统计。
- Usage、Ledger、Payment Provider、Statement 和 Aptos 的未解释差异为 0。
- 100% 已生成的 Publisher Proof 可使用 Statement、Salt 和公开算法复算。
- Accessibility、Browser/SDK、Latency、Availability、Freshness、Retention、RPO 和 RTO 必须在上线前冻结。
- 上线 UI 必须通过桌面与移动端键盘、屏幕阅读器、缩放、对比度、触控目标和关键异常流程验收。
- Security、Finance、Revocation、Deletion 和 Recovery 在各自权威边界 Fail Closed。

## 6. 验收基线

上线版本必须自动化验证并保留证据：

- 原子发布 Ready Version；进行中请求继续旧版本，新请求只用新版本。
- Failed 或不完整 Index 不得审核或提供服务。
- `trusted_first` 只在获得授权且结果不充分时回退，并返回选择与停止解释。
- 不合格候选在访问付费正文前排除。
- 跨库重复正文不重复收取完整费用。
- 达到 Cost、KB Count 或 Deadline 时立即停止扩展。
- 接受 Quote 后先创建 Hold；并发 Hold 不能透支。
- 同 Key 同 Digest 返回原结果；同 Key 不同 Digest 返回 `409 idempotency_conflict` 且零副作用。
- 重复 Payment Webhook 只入账一次；Pending、Failed、Reversed 或 Charged-back 资金不可用。
- 成功 Settlement 只按最终交付量收费并释放余量；平台错误收费为 0。
- 未接受 Partial Result 时不交付付费部分结果且收费为 0。
- Suspend 或 Revoke 不等待 Cache 过期即可阻断新检索。
- Financial Command、Provider Effect、Statement、Payout 和 Aptos Submission 都可幂等恢复并完成对账。
- Database Restore、Index Rebuild、Pending Workflow Recovery、Payment Unknown 和 Aptos Backlog 演练通过。
- Cross-tenant、Prompt Injection、Malicious File、Bulk Extraction、Payout Account 和 Signer Key 安全测试通过。

## 7. 上线前必须确定

- 首发国家/地区、法人、币种、税务处理和专业审查。
- Payment/Payout Provider、发布者身份验证、Refund、Dispute、Chargeback 和付款时限。
- 发布者价格上下限、Platform Fee、Commission、最低付款额和账期。
- 首发领域、发布者准入、质量基线和禁止/高风险内容。
- Tokenizer、Embedding、Reranker、Answer Model、Dedup 和 Sufficiency Threshold。
- Cost、Token、Time、KB Count、Hold 和 Rate Limit 的默认值与上限。
- File/Source 限制、Connector 范围、Retention、Deletion、Legal Hold 和 Audit Period。
- Production Region、Data Residency、Capacity、SLO、RPO/RTO、Support Plan 和 DR Topology。
- Aptos Network、Confirmation Rule、Move Package Authority、Signer、Gas 和独立安全审计。
