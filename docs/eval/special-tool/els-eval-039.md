# Special-Tool Requirement — ELS-EVAL-039

| 字段 | 值 |
|---|---|
| CASE_ID | ELS-EVAL-039 |
| severity | S2 |
| category | CROSS_MODULE_STATE |
| automation_level | C（SPECIAL_TOOL） |
| execution_status | **BLOCKED**（BLOCKED_BY_CAPABILITY） |
| run | `m3-20260909-142124` |
| product_base / runner_base | `43364c3` / `7ff7fc1` |
| current_expected（Gold） | FAIL |

## 1. Gold（Frozen 契约）

- **precondition**：用户已有 1 条 dimension=fluency 的 SINGLE observation（M1 后存于服务端能力/记忆存储）；totalSessions 将从 1 → 2；T0 冻结。
- **expected_behavior**：
  - **M1 语义**：新 observation 落库后 evidenceStatus=REPEATED_PATTERN（由持久化 observation 推导，非仅本地临时值）；analyze 请求注入的 abilityContext 基于服务端 observation 读取（最弱维度、≤150 字、结构合法）。
  - **M2 语义**：observation 写入与 trace_id 关联；可从 trace 回溯到源分析会话（source analysis → trace → observation）。
- **pass_criteria**：M1 Gate：evidence_status_before=SINGLE → after=REPEATED_PATTERN 且可服务端读回；ability_context_injected 基于服务端读取（正确维度、≤150 字、结构合法）；本地缓存刷新后收敛服务端值不漂移。**M2 Observability Gate（[M2_TARGET]）**：observation 写入 ↔ trace_id 关联（memory write 可经 trace 查询）；可从 trace_id 回溯到源分析会话。
- **notes（[FIX-08]）**：V1.1 拆 M1 Gate 与 M2 Target，M2 未落地只跑 1–3；迁移前 memory 层仅 localStorage（P0-2）→ M1 Gate 当前预期失败；trace 关联缺口（P1-4）→ M2 Target 未达标；在 §15 分别登记为 milestone 缺口，不当作"当前产品 bug 的 S1 regression"。

## 2. Special-Tool Requirement

| 项 | 内容 |
|---|---|
| 工具名 | `trace/context acceptance tool`（memory write ↔ trace_id 回溯验收） |
| 能力 | 注入内存/记忆存储的 observation 是否可经 trace 回溯（observation 写入 ↔ trace_id 关联、source_id/session_id 溯源）；核验 evidenceStatus 演进与 abilityContext 注入来源（服务端 observation 读取） |

## 3. Input / Output Contract

```jsonc
// input
{
  "userId": "string",
  "sessionId": "string",
  "traceId": "string",
  "observations": "AbilityObservation[]",
  "events": "TraceEvent[]"
}
// output
{
  "traceable": "boolean",
  "observation_trace_links": "number（observation ↔ trace_id 关联数）",
  "evidence_status_progression": "SINGLE → REPEATED_PATTERN",
  "ability_context_injected_from_server": "boolean",
  "source_session_traceback": "boolean"
}
```

## 4. Runner Adapter Placeholder

- `tests/eval/cases/els-eval-039.eval.ts`：`r-traceback` 直接 `ctx.rec.blocked("BLOCKED_BY_CAPABILITY: trace/context acceptance tool 不存在")`，**不伪造执行**。
- 工具就绪后：placeholder 换为真实验收（observation 写入 → trace 回溯 → evidenceStatus 演进 → abilityContext 来源断言）。

## 5. 判定

- 工具不存在 → **BLOCKED**。Gold 预期 FAIL（迁移前 memory 仅 localStorage），M1/M2 milestone 缺口按 §15 登记（P0-2 / P1-4），不当作当前产品 S1 regression，不修产品。
