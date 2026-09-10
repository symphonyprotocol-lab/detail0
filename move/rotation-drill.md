# Anchor Signer 轮换演练记录

- 日期：2026-09-10
- 网络：Aptos Testnet
- 依据：[aptos-anchoring-proposal.md](../aptos-anchoring-proposal.md) 第 4.11.1 节门禁 1
- 状态：**已完成**（2026-09-10 补完最后一步）

提案 1.1 版把 Anchor Signer 从云 KMS 改回环境变量持有私钥之后，轮换从「吊销一个凭据」变成了一次合约升级——因为签名地址在合约里是编译期绑定的。门禁 1 因此要求先在测试网完整演练一遍：**出事时现学的代价太高**。

## 走过的步骤

| # | 动作 | 结果 |
| --- | --- | --- |
| 1 | 暂停锚定 | 演练当时用的是后台暂停开关；该功能随后按简化决定移除，现在等效做法是临时移除该环境的 `APTOS_*` |
| 2 | 生成新签名账户 | `0x27bbfed5…ea96b` |
| 3 | 以新地址重编译并升级 Code Object | tx `0x66f2f16d…c46c80`，gas 1269 units |
| 4 | 验证旧账户被拒 | 旧账户 `0x56be51cf…8bbdc` 调用 `submit_batch` 返回 `E_UNAUTHORIZED(0x1)` |
| 5 | 切换 env | 签名私钥与地址换成新账户 |
| 6 | 新账户提交一笔锚定 | 充值 20 APT 后，Workflow 规划出 2026-09-09 的审计链头批次；tick 1 提交、tick 2 确认，链上 sender 为新账户，tx `0x278f2af0…dc45af` |

Upgrade Authority 全程是 `0x56be51cf…8bbdc`（Code Object 的 Owner），也就是轮换前的签名账户。这不构成演练缺陷：**Upgrade Authority 本来就不随 Anchor Signer 轮换**，生产上它是离线冷钥。但测试网上这两把钥匙目前仍是同一个账户，与第 4.6 节「两把密钥的分离是强制的」不符——分离是独立的一项待办，见下。

## 演练验证到的四件事

**升级策略允许轮换。** `compatible` 只禁止破坏 Struct 布局与 public 签名；换签名地址改的是函数体里的一个常量，链上接受了。也就是说轮换不需要放宽升级策略。

**拒绝是即时且干净的。** 旧账户一小时前还能成功提交，升级后同一调用直接 abort，没有中间的「有时能过」状态。

**合约变更监控真的会响。** 这次升级是一次真实的、未经公告的发布，第 4.9 节的监控立刻给出严重告警：

```
anchor-alert critical unannounced_upgrade publishes=2 expected=1 unannounced=1
```

这比翻标志位模拟一次更有说服力，可一并作为**第 4.11 节门禁 8「验证可触发」的证据**。

**升级在运维视图上可见。** 运维视图显示的「Code Object 发布次数」随这次升级从 1 变成 2，`PackageRegistry.upgrade_number` 同步变为 1。演练当时还存在一条基于配置的「未公告升级」告警并如实触发；该机制随后按简化决定移除——发布次数改为只呈现数字，是否异常由运维判断，见 architecture.md §17.2。

## 演练暴露的一个规格缺口

**历史锚定由历史签名账户发出。** 轮换完成后，同一个 Code Object 名下的锚定已经分属两个签名账户：

```text
version      5 leaf  0x56be51cf…bbdc  2026-09-09T11:16
audit_head   1 leaf  0x56be51cf…bbdc  2026-09-09T11:16
audit_head   1 leaf  0x27bbfed5…a96b  2026-09-10T10:17

历史签名地址集合：0x56be51cf…(2 笔)  0x27bbfed5…(1 笔)
```

一个只信任「模块地址 + 单一 sender」的 Verifier，会在轮换后把前两笔——也就是全部历史——判为伪造。

因此 Verifier 必须接受**一组历史签名地址**，而不是一个，并按 Event 所在的账本版本判断当时哪个有效。集合的变更点是链上可验证的：每次轮换都伴随一次升级交易，`0x1::code::PackageRegistry.upgrade_number` 也随之加一。

这是这次演练最有价值的产出——**它在主网发生之前被发现，而不是之后**。已补进提案第 4.5 节。

## 复现步骤

```bash
# 1. 暂停：移除该环境的 APTOS_* 配置
# 2. 新账户
aptos init --profile <new> --network testnet
# 3. 升级，由 Upgrade Authority 签名，把新地址编译进去
scripts/deploy-anchor.sh --profile <upgrade-authority> \
  --object-address <object> --anchor-signer <new-address>
# 4. 确认旧账户被拒
aptos move run --function-id <object>::anchor::submit_batch ... --profile <old>
# 5. 切换 APTOS_ANCHOR_SIGNER_KEY / _ACCOUNT_ADDRESS
# 6. 给新账户充值，恢复锚定，确认下一批次由新账户提交并确认
```

## 结论与遗留

轮换在测试网上端到端走通：换账户、升级、旧账户被拒、新账户提交并确认，全部有链上交易可查。**升级本身只花 1269 gas、一笔交易**，所以真实事故中的瓶颈完全在流程侧——把 Upgrade Authority 从离线保管中取出要多久，就是止血要多久。第 4.6 节应当为这个流程定一个目标时间，见 [contract-review.md](./contract-review.md) F2。

遗留一项：**测试网上 Upgrade Authority 与 Anchor Signer 仍是同一账户**（`0x56be51cf…bbdc` 既是 Code Object 的 Owner，也是轮换前的签名账户）。第 4.6 节要求强制分离；要在测试网也做到，需要把 Code Object 的所有权转移给一个独立账户。生产上从第一天起就必须是两个。
