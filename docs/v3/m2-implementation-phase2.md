# M2 Implementation Phase 2 — Product State & Decision Trace

| | |
|---|---|
| **Spec** | `M2_IMPLEMENTATION_PHASE2` |
| **前置** | `M1_CODE_STATUS: PASS`；`M2_OBSERVABILITY_CONTRACT_V2_2: FROZEN`；`M2_PHASE1_CODE_STATUS: PASS` |
| **日期** | 2026-09-09 |
| **范围** | 在 Phase 1 LLM Trace Core 基础上补齐产品决策与状态链：routing.decided / state.read / retrieval.executed / rule.applied / state.write / report.aggregated |
| **禁止** | 修改 Evaluation Gold、RAG/Memory/Multi-Agent 升级、新产品功能、大规模 UI、重构 Phase 1 Trace Core |

---

## 1. 目标

使一次用户结果能够区分：
- **AI 问题**（llm.attempt / validation.result / fallback.triggered — Phase 1 已覆盖）
- **业务规则问题**（rule.applied — 本轮新增）
- **状态问题**（state.read / state.write — 本轮新增）
- **检索问题**（retrieval.executed — 本轮新增）
- **路由问题**（routing.decided — 本轮新增）
- **报告聚合问题**（report.aggregated — 本轮新增）

---

## 2. 新增事件类型（6 种）

| 事件类型 | Layer | 触发位置 | 关键字段 |
|---------|-------|---------|---------|
| `routing.decided` | ROUTING | /api/agent/message | intent_decision, ui_action_type, persistence_required, reject_reason |
| `state.read` | STATE_READ | 所有核心链路 | entity, keys, snapshot_summary, due_queue(≤20), total_due |
| `retrieval.executed` | RETRIEVAL | /api/learn/card | query_raw, query_normalized, knowledge_object_ids, knowledge_injected_count, knowledge_miss_flag, conflict_detected, conflict_resolution |
| `rule.applied` | BUSINESS_RULE | 6 条确定性规则 | rule_key, inputs, outputs, llm_call_count |
| `state.write` | STATE_WRITE | 所有核心写路径 | entity, keys, idempotency_outcome, state_before, state_after, canonical_state_hash, next_review_at_before/after |
| `report.aggregated` | REPORT_AGGREGATION | /api/report | period, aggregate_checksum, insufficient_data_flag, baseline_availability, summary_generated, section_render_flags |

### 2.1 rule.applied 覆盖的 6 条确定性规则

| rule_key | 位置 | inputs | outputs |
|----------|------|--------|---------|
| `empty_answer_short_circuit` | learn/submit, review/submit | answer_empty, skipped | result, llm_call_count=0 |
| `learning_branch_map` | learn/submit | correctness, usedHint, shortCircuited | status, scheduleQuality |
| `review_interval_table` | review/submit | result, usedHint, previous_recall_level | next_review_at, recall_level_delta, interval_hours |
| `speaking_rule_engine` | speaking/analyze（LLM 降级时） | answer_length, question_part, llm_failed | main_issue, candidate_count, llm_call_count=0 |
| `insufficient_data` | report | events_count, sessions_count, states_count | insufficient_data, show_message, llm_summary_skipped |
| `observation_promotion` | speaking/analyze | hasIeltsAnalysis, dimensions_extracted | written, skipped, dimensions_persisted |

### 2.2 state.write 覆盖的 4 种实体

| entity | 位置 | idempotency | diff 字段 |
|--------|------|-------------|-----------|
| `learning_event` | learn/submit, review/submit | clientEventId → inserted/duplicate_ignored | eventType, correctness |
| `user_item_state` | learn/submit, review/submit | — | status, recallLevel, consecutiveCorrect, nextReviewAt (before/after) |
| `ability_observation` | speaking/analyze | — | written count, dimensions |
| `speaking_evaluation` | speaking/analyze（二次回答） | — | overallChange, feedbackEffectiveness, issueResolutionRate |
| `speaking_session` | speaking/analyze | — | hasFirstAnswer, hasSecondAnswer, hasIeltsAnalysis |

---

## 3. Endpoint × Node Conformance Matrix

| Endpoint | request.received | routing.decided | state.read | retrieval.executed | llm.attempt | validation.result | fallback.triggered | rule.applied | state.write | report.aggregated | response.sent |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| /api/agent/message | ✅ | ✅ | — | — | ✅ | ✅ | ✅ | — | — | — | ✅ |
| /api/learn/card | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | ✅ |
| /api/learn/submit | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| /api/review/session | ✅ | — | ✅(due_queue) | — | — | — | — | — | — | — | ✅ |
| /api/review/submit | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| /api/speaking/analyze | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| /api/report | ✅ | — | ✅ | — | ✅ | ✅ | — | ✅ | — | ✅ | ✅ |

**主动短路原则**：如果某端点没有 llm.attempt，必须通过 rule.applied 正向解释原因（如 empty_answer_short_circuit、insufficient_data），不能靠"没有 llm.attempt"猜测。

---

## 4. Trace Capability Fixtures（非 Eval Case 执行）

> **重要声明**：以下是 Trace Capability Fixtures，用于验证 Trace 系统能否记录完整事件链。**不是 ELS-EVAL Case 执行**。Eval Case 由 Eval Runner 负责，使用真实 API 调用和 Golden Data。

### Fixture A — Review Independent Correct

**期望事件链**：`request.received → state.read → llm.attempt → validation.result → rule.applied(review_interval_table) → state.write → response.sent`

**验证点**：
- rule.applied.rule_key = "review_interval_table"
- state.write.next_review_at_before / next_review_at_after 有明确 diff
- recall_level_delta 可追溯

### Fixture B — Empty Answer Short Circuit

**期望事件链**：`request.received → state.read → rule.applied(empty_answer_short_circuit) → rule.applied(review_interval_table) → state.write → response.sent`

**验证点**：
- **llm.attempt count = 0**
- rule.applied(empty_answer_short_circuit).llm_call_count = 0 正向解释
- 不依赖"没有 llm.attempt"猜测

### Fixture C — Retrieval Hit

**期望事件链**：`request.received → retrieval.executed → state.read → llm.attempt → validation.result → response.sent`

**验证点**：
- retrieval.executed.knowledge_miss_flag = false
- retrieval.executed.knowledge_object_ids 非空
- retrieval.executed.conflict_resolution = "capability_missing"（明确标记当前无 conflict detection）

### Fixture D — Report Insufficient Data

**期望事件链**：`request.received → state.read → report.aggregated → rule.applied(insufficient_data) → response.sent`

**验证点**：
- report.aggregated.insufficient_data_flag = true
- report.aggregated.baseline_availability = false
- rule.applied(insufficient_data).llm_call_count = 0
- **llm.attempt count = 0**（不调用 LLM summary，正向解释）

### Fixture E — Idempotent Replay

**场景**：同一 clientEventId 连续提交两次。

**验证点**：
- 第一条 trace: state.write.idempotency_outcome = "inserted"
- 第二条 trace: state.write.idempotency_outcome = "duplicate_ignored"
- 两条 trace 返回相同 event.id
- 业务状态不再次推进
- idempotency_outcome 由 `CreateLearningEventResult.created` 映射，Trace 只观察不判断

---

## 5. 关键设计决策

### 5.1 idempotency_outcome 映射

```
CreateLearningEventResult.created = true  → state.write.idempotency_outcome = "inserted"
CreateLearningEventResult.created = false → state.write.idempotency_outcome = "duplicate_ignored"
```

Trace 只观察 Repository 返回的结果，**不参与幂等判断**。trace_id 仅用于 observability。

### 5.2 canonical_state_hash

使用 `JSON.stringify(sorted_keys)` + sha256 前 16 位。用于 state.write 前后状态对比，未来可用于状态变更检测和回归验证。

### 5.3 Privacy Contract

- state.read 只记录 `snapshot_summary`（字符串摘要），不复制整份用户数据库
- due_queue 最多记录前 20 条（itemId + nextReviewAt）
- state.write 只记录关键字段的 before/after，不记录完整 entity
- retrieval.executed 不记录完整 knowledge object 内容，只记录 id 和 count

### 5.4 conflict detection capability missing

当前系统**没有** knowledge conflict detection。retrieval.executed 中明确记录：
```json
{ "conflict_detected": false, "conflict_resolution": "capability_missing" }
```
不造字段值，明确标记 capability missing。

---

## 6. Verification

### 6.1 测试结果

| 检查项 | 结果 |
|--------|------|
| `tsc --noEmit` | **PASS** |
| `next build` | **PASS** |
| M2 Phase 1 测试 | **18/18 PASS** |
| M2 Phase 2 测试 | **18/18 PASS** |
| M1 ELS-EVAL-037/038 | **PASS（无回归）** |
| 全量 unit suite | **174 passed / 2 failed**（2 预存在失败） |

### 6.2 Phase 2 测试覆盖

| 测试类 | 用例数 | 覆盖 |
|--------|--------|------|
| Trace Contract 新事件类型 | 9 | 6 种事件 → Layer 映射、canonicalStateHash |
| Fixture A (Review Correct) | 1 | 完整事件链 + rule.applied + state.write diff |
| Fixture B (Empty Answer) | 1 | llm.attempt=0 + empty_answer_short_circuit 正向解释 |
| Fixture C (Retrieval Hit/Miss) | 2 | knowledge_miss_flag + conflict capability_missing |
| Fixture D (Report Insufficient) | 1 | report.aggregated + insufficient_data + no LLM |
| Fixture E (Idempotent Replay) | 1 | duplicate_ignored + event.id 一致 + 状态不推进 |
| Endpoint Conformance | 2 | 7 端点 required 节点 + 主动短路正向解释 |
| Regression Guard | 1 | Trace Disabled 时所有新事件为 no-op |

### 6.3 Regression Guard（AC-6）

关闭 Trace 后，所有 6 种新事件类型均为 no-op，traceStore 中无新记录。业务行为完全不变。

---

## 7. 实现文件清单

### 新建
- `tests/unit/m2-trace-phase2.test.ts` — 18 个 Phase 2 测试

### 修改
- `lib/observability/trace-contract.ts` — 新增 6 种事件类型 + payload 接口 + EVENT_TYPE_TO_LAYER 映射
- `lib/observability/trace-context.ts` — 新增 6 个 emit 方法 + canonicalStateHash 导出
- `lib/observability/trace-api-helper.ts` — TraceRouteContext 新增 6 个代理方法
- `app/api/agent/message/route.ts` — routing.decided（3 条路径：正常/mock 短路/LLM 失败 fallback）
- `app/api/learn/card/route.ts` — retrieval.executed + state.read
- `app/api/learn/submit/route.ts` — state.read + rule.applied(empty_answer/learning_branch_map) + state.write(2 entities)
- `app/api/review/session/route.ts` — state.read（含 due_queue ≤20 + total_due）
- `app/api/review/submit/route.ts` — state.read + rule.applied(empty_answer/review_interval_table) + state.write(2 entities)
- `app/api/speaking/analyze/route.ts` — state.read(2 entities) + rule.applied(speaking_rule_engine/observation_promotion) + state.write(3 entities)
- `app/api/report/route.ts` — state.read + report.aggregated + rule.applied(insufficient_data)
- `tests/unit/m2-trace-phase1.test.ts` — 修复 noUncheckedIndexedAccess 索引访问

---

## 8. Remaining Risks / Gaps

| 项 | 状态 | 说明 |
|----|------|------|
| Supabase Trace Store | UNVERIFIED | Phase 1 已设计 migration，未执行 |
| Debug Console UI | NOT IMPLEMENTED | 只有 API 查询端点 |
| Knowledge conflict detection | CAPABILITY MISSING | 明确标记，不造字段 |
| prompt_version 真实版本化 | PARTIAL | 固定 "v1" |
| state.write 完整 diff | PARTIAL | 只记录关键字段，非完整 entity diff |
| retrieval 上下文注入追踪 | PARTIAL | 记录 knowledge_object_ids，但未记录注入到 prompt 的具体内容 |
| routing 模糊/unsupported 请求追踪 | PARTIAL | 当前 LLM 直接返回 ui_action，无独立澄清/拒绝路径 |
| Trace TTL / 清理 | NOT IMPLEMENTED | Memory store 无过期 |

---

## 9. 状态

```
M2_PHASE2_CODE_STATUS: PASS
M2_PHASE2_VERIFICATION_STATUS: PASS (Memory runtime)
M2_PHASE2_PRODUCTION_VERIFICATION: UNVERIFIED (Supabase migration 未执行)
```

**PASS 条件满足：**
- ✅ routing.decided 接入 /api/agent/message
- ✅ state.read 接入 5 条核心链路（Learn/Review Session/Review Submit/Speaking/Report）
- ✅ retrieval.executed 接入 learn/card，conflict detection 明确标记 capability missing
- ✅ rule.applied 覆盖 6 条确定性规则
- ✅ state.write 覆盖 4 种核心实体 + idempotency_outcome 映射 + before/after diff
- ✅ report.aggregated 接入 /api/report 服务端聚合
- ✅ Endpoint Node Conformance Matrix 自动校验
- ✅ Fixtures A-E 全部通过
- ✅ 主动短路必须通过 rule.applied 正向解释
- ✅ typecheck / build / full unit / M1 ELS-EVAL / M2 Phase1 无回归
- ✅ Trace Disabled no-op Regression Guard

**不声称：**
- ❌ M2_STATUS=PASS（Debug Console minimal、持久化最终验证、AC 全量 Gate 尚未完成）
- ❌ Supabase runtime verified
- ❌ 完整 M2（缺 Debug Console UI、Trace TTL、prompt 版本化等）
