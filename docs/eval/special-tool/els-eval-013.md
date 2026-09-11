# Special-Tool Requirement — ELS-EVAL-013

| 字段 | 值 |
|---|---|
| CASE_ID | ELS-EVAL-013 |
| severity | **S1**（replay≠snapshot = 数据损坏类） |
| category | LEARNING_STATE_MEMORY |
| automation_level | C（SPECIAL_TOOL） |
| execution_status | **BLOCKED**（BLOCKED_BY_CAPABILITY） |
| run | `m3-20260909-142124` |
| product_base / runner_base | `43364c3` / `7ff7fc1` |
| current_expected（Gold） | FAIL（FUTURE_TARGET：M1 收敛前） |

## 1. Gold（Frozen 契约）

- **precondition**：空用户；执行脚本化操作序列 S（含学习 3 词 × 若干提交、复习若干轮、1 次重复 clientEventId）。
- **expected_behavior**：重放器从 events 计算出的每词状态（status/levels/nextReviewAt/consecutiveCorrect）与 repo 快照逐字段相等；事件总数与去重后一致。
- **pass_criteria**：`replay(events) == user_item_states`（逐字段比较）；events 无重复 client_event_id；快照 updated_at 单调。
- **notes**：M1「Single Source of Truth」的 AI 行为侧验收不变式；AUDIT: FUTURE_TARGET（M1 收敛前）CURRENT=FAIL / TARGET=PASS。

## 2. Special-Tool Requirement

| 项 | 内容 |
|---|---|
| 工具名 | `replay_job`（离线重放器） |
| 能力 | 从事件流（TraceEvent[]）重算每词状态，与 repo 快照逐字段比对；检测重复 client_event_id；校验 updated_at 单调 |
| 依赖 | M2 trace 事件全集 + state 快照 + checksum |

## 3. Input / Output Contract

```jsonc
// input
{
  "events": "TraceEvent[]",
  "checksum": "canonical_state_hash",
  "client_event_ids": "string[]"
}
// output
{
  "replay_state": "UserItemState[]",
  "replay_matches_snapshot": "boolean",
  "duplicate_client_event_ids": "string[]",
  "updated_at_monotonic": "boolean"
}
```

## 4. Runner Adapter Placeholder

- `tests/eval/cases/els-eval-013.eval.ts`：`r-replay` 直接 `ctx.rec.blocked("BLOCKED_BY_CAPABILITY: replay_job 不存在")`，**不伪造执行**。
- 工具就绪后：placeholder 换为真实调用（注入脚本化序列 S → replay_job → 逐字段断言）。

## 5. 判定

- 工具不存在 → **BLOCKED**（非产品 FAIL）。Gold 预期 CURRENT=FAIL（M1 收敛前），本 Case 的最终 PASS 依赖 replay_job 落地，登记为 FUTURE_TARGET，不修产品。
