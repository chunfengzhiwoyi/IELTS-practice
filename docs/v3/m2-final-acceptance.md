# M2 Observability Contract — Final Acceptance（M2-P3B）

- Contract: `M2_OBSERVABILITY_CONTRACT_V2_2`（`docs/v3/m2-observability-contract.md`）
- Product Checkpoint: `2a9e3834b1b5a1b797515f7c86a771000276b172`（BC-008 + BC-035 code-only + M2-P3A）
- Eval Runner: `7ff7fc1`（EVAL-RUN-02）
- Acceptance worktree: `D:\Codex\IELTS-integration-m2-01`（branch `integration/m2-01`）
- Date: 2026-09-09

---

## 0. 结论摘要

| 维度 | 状态 |
|---|---|
| M2_CODE_STATUS | **PASS**（Memory scope） |
| M2_MEMORY_RUNTIME_STATUS | **PASS** |
| M2_CONTRACT_AC_STATUS | **PARTIAL**（AC-7 人工计时 PENDING；REAL_PROMPT_REGISTRY 未实现） |
| M2_PRODUCTION_VERIFICATION | **BLOCKED_EXTERNAL / UNVERIFIED**（ENV-SUPABASE-01） |

闭包阻塞（CLOSURE_BLOCKERS）：
1. Supabase durability runtime 验证（ENV-SUPABASE-01 BLOCKED_EXTERNAL，禁止 remote workaround）。
2. AC-7 2-Minute RCA 人工计时未实际执行 → `MANUAL_ACCEPTANCE_PENDING`（禁止编造秒数）。
3. `REAL_PROMPT_REGISTRY = NOT IMPLEMENTED`（prompt_version 固定 v1，仅满足"可追踪"）。
4. `tests/unit/llm-safety.test.ts` bundle 静态检查 1 项预存在失败（`components/account/ModelSettingsPanel.tsx` import `@/lib/llm`；相对 base `b0ff1bf` 两文件零改动，非本分支引入）。

---

## 1. Contract Gap Audit（逐条）

### AC-1 Request Correlation — **PASS**
- 现有实现满足（M2 Phase1 `trace-context.ts` + `trace-api-helper.ts` 全量埋点），**未重复开发**。
- 本轮补验证：新增验收测试逐端点断言 `request.received` 首事件、`response.sent` 末事件、seq 连续、`event_count` 与事件数组一致、expected nodes 不缺。
- 主动短路由正向解释：agent/message 的 `routing.decided`（intent_decision 非空）；learn/submit 空答案 `rule.applied(empty_answer_short_circuit)`。
- 已知边界：agent/message 的 LLM 长路由需要真实 provider / Supabase 用户配置，unit 环境不可达；routing 形态由 fixtures（`trc_m2b_fallback`）与结构化单测覆盖。`/api/speaking/transcribe` 为本轮补全埋点（§1.3 覆盖缺口已关闭）。

Endpoint Conformance Matrix（验收测试 `tests/unit/m2-ac-acceptance.test.ts`）：

| Endpoint | request.received | state.read | llm.attempt | validation.result | rule.applied | state.write | report.aggregated | response.sent | 结果 |
|---|---|---|---|---|---|---|---|---|---|
| /api/agent/message | ✓ | –（短路由） | 条件（外部） | – | ✓ routing.decided | – | – | ✓ | PASS |
| /api/learn/card | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ learning_item | – | ✓ | PASS |
| /api/learn/submit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | PASS |
| /api/review/submit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | PASS |
| /api/review/session | ✓ | ✓（DUE） | –（无 LLM 路径） | – | – | – | – | ✓ | PASS |
| /api/speaking/analyze | ✓ | ✓ | ✓ | ✓ | 条件（降级/提升） | ✓ | – | ✓ | PASS |
| /api/speaking/transcribe | ✓ | – | ✓ whisper | – | – | – | – | ✓ | PASS |
| /api/report | ✓ | ✓ | 条件（有数据时） | – | ✓ insufficient_data | – | ✓ | ✓ | PASS |

### AC-2 Prompt / Model Trace — **PASS（可追踪）**，附限制
- 验收测试抽取 10+ 个含 LLM 的 trace（真实 route 6 + fixtures 4）：`provider` / `model_name` / `tier` / `prompt_key` / `prompt_version` 非空率 100%。
- Whisper 特例：`llm.attempt`（whisper）按 Contract §1.6 允许 `prompt_key/prompt_version = null`（已放宽 schema 为 `string | null`），单测直接断言。
- **`REAL_PROMPT_REGISTRY = NOT IMPLEMENTED`**：`prompt_version` 当前固定 `v1`，满足"可追踪"，但**不是成熟 Prompt Versioning System**，不表述为已实现。

### AC-3 Retrieval — **PASS**
- hit：seed 词 `take something for granted` → `retrieval.executed` `query_raw/query_normalized` + `knowledge_object_ids` 非空 + `knowledge_injected_count>0` + `knowledge_miss_flag=false`。
- miss：`well-being` → `knowledge_object_ids=[]`、`knowledge_miss_flag=true`，仍走 LLM 不崩溃（BC-035 已有证据，未改其 Gold）。
- 字段完整性：`query_raw` / `query_normalized` / `knowledge_object_ids` / `knowledge_injected_count` / `knowledge_miss_flag` 均落 trace。

### AC-4 Fallback — **PASS**
- provider fallback：primary `MODEL_TIMEOUT` → fallback 成功，`fallback.triggered(to_kind=provider)` + `chain_snapshot=[primary(used), fallback_provider(used)]`。
- fallbackJudge：learn/submit LLM 判题失败 → 关键词降级，`to_kind=fallback_judge`。
- rule-based fallback：speaking/analyze LLM 不可用 → `fallback.triggered(rule_based_analysis)` + `rule.applied(speaking_rule_engine)`。
- null_report_summary：report LLM 总结失败 → `fallback.triggered(null_report_summary)`。
- `degradation_flag` 三处一致（fallback 事件 / Trace Header / response.sent.fallback_used_flag）→ fixture `trc_m2b_fallback` + 单测双验证。
- `chain_snapshot` 无解释空白：所有 step 均带 `status ∈ {used, skipped, unavailable}` + `from/to`。

### AC-5 State Before / After — **PASS**
- 正常 review：`state.write` 含 `state_before/state_after` + `canonical_state_hash` + `next_review_at_before/after`。
- BC-037 duplicate replay（`ce-m2c-replay-001` 关联双 trace）：
  - 第一条：`idempotency_outcome=inserted`，state 推进一次。
  - 第二条：`idempotency_outcome=duplicate_ignored`，`next_review_at_before === next_review_at_after`（不二次推进），`canonical_state_hash` 不变。
- 已验证：event count=1 每次写入、state 只推进一次、duplicate replay 不产生第二次 advance。

### AC-6 Regression Guard — **PASS**
- Trace Enabled / Disabled 两轮在**固定时钟**下执行相同 deterministic flow（learn/card → learn/submit → review/submit → idempotent replay），业务响应逐字节一致（排除随机 `eventId`）。
- Trace Disabled：不产生任何 trace 记录，业务状态照常推进（learn 后 item 存在、review 后状态推进、replay 返回既有结果）。
- 结论：Trace 层不改变业务状态与 API semantic result。

### AC-7 Debug Console — **PASS（页面能力）** + `MANUAL_ACCEPTANCE_PENDING`（人工计时）
- 使用 M2-P3A 已实现页面，验收测试经 `GET /api/debug/traces/[traceId]` 真实走查 5 类 trace：
  1. normal（`trc_m2a_normal`）→ `PRIMARY_SUSPECT_LAYER=UNKNOWN` + degraded=false + "无异常证据"
  2. fallback（`trc_m2b_fallback`）→ FALLBACK 层 + degraded=true
  3. BC-008 style（`trc_m2d_empty`）→ empty_answer_short_circuit + llm_call_count=0
  4. BC-035 style（`trc_m2e_retrieval_miss`）→ knowledge_miss_flag=true
  5. BC-037 idempotency（`trc_m2c_replay_1/2`）→ duplicate_ignored 关联 2 条
- 页面可显示：Trace Header / Event Timeline / Failure Layer Diagnosis（PRIMARY_SUSPECT_LAYER + EVIDENCE）/ relevant correlations（client_event_id 关联）。
- **2-Minute RCA 人工计时未实际执行 → `MANUAL_ACCEPTANCE_PENDING`**：验收流程已建立（给定 trace_id → 回答十问 → 计时），需真实操作者走查后回填时间；禁止编造秒数。

### Diagnosability Checklist（十问）— **PASS（证据齐全）**
| 问题 | 证据事件 |
|---|---|
| 用户输入边界发生了什么 | `request.received`（含 bodyRaw/input_summary 截断摘要） |
| 是否调用 LLM | `llm.attempt`（含 prompt/model/tier）或 absence |
| 用哪个 prompt/model | `llm.attempt.prompt_key/prompt_version/model_name` |
| validation 是否通过 | `validation.result`（outcome=pass/fail + error_code） |
| 是否 fallback | `fallback.triggered`（to_kind + chain_snapshot + degradation_flag） |
| 什么 rule 被执行 | `rule.applied`（rule_key + inputs/outputs） |
| 什么 state 被写 | `state.write`（entity + keys + idempotency_outcome + before/after + hash） |
| retrieval 是否命中 | `retrieval.executed`（query_raw/normalized + ids + miss_flag） |
| 响应是否降级 | `response.sent`（fallback_used_flag）+ header.degradation_flag |
| primary suspect layer | `runDiagnosis`（PRIMARY_SUSPECT_LAYER + EVIDENCE + checks） |

---

## 2. Privacy / Cost / Retention Audit

### Privacy（Contract §3 条款逐项）
| 条款 | 状态 | 证据 |
|---|---|---|
| API Key NEVER | PASS | trace schema 无 key 字段；`llm.attempt` 仅 provider kind/name；bundle 静态检查 1 项**预存在失败**（ModelSettingsPanel import @/lib/llm，base 同态，非本分支引入，已登记不改） |
| Authorization NEVER | PASS | trace schema 无 Authorization/header 字段 |
| audio bytes NEVER | PASS | transcribe 的 `llm.attempt` 仅落转写文本/metadata，不落音频字节 |
| full conversation NEVER | PASS | `input_summary` 截断为前 200 字（lastUserMsg/term/answer/period） |
| raw output truncation/redaction | PASS | `truncateRawOutput`（head256 + tail256 + sha256）；status=error 时 raw 全量（已知限制：append-only 分层埋点架构下质量门 fail 的 raw 无法预知，注释声明） |
| payload ≤ 4KB | PASS | `truncatePayload`（>4096 保留前 6 键摘要 + `_payload_size` + `_payload_truncated_keys`）；事件信封带 `payload_truncated` |
| user identity hashing | PASS | `hashUserId(user_id + salt)` → 16 hex；稳定性/长度/不含原始 id 单测通过 |

### Retention（Contract §1.7 30d / 90d）
- 审计发现 Contract 缺口（Memory store 无 TTL）→ 本轮已实现（判断 A：做最小 TTL/cleanup，结构性能力已提供）：
  - `EVENT_RETENTION_MS = 30d`：事件裁剪并同步 header.event_count。
  - `HEADER_RETENTION_MS = 90d`：整条 trace 删除。
  - `prune(now?, eventsRetentionMs?, headerRetentionMs?)` + `listTraceIds` 惰性 prune。
  - 单测覆盖：90d+ 整删 / 40d 事件裁剪 header 保留 / 30d 内保留。
- 边界说明：Memory 进程内生命周期通常短于 TTL；生产级滚动清理由持久化后端（Supabase）承载 → `RETENTION_STATUS: PASS（Memory scope）/ PARTIAL（生产）`。

---

## 3. Persistence Status（三拆，不混同）

| 项 | 状态 | 说明 |
|---|---|---|
| TRACE_MEMORY_RUNTIME_STATUS | **PASS** | 验收 29/29 + M1/M2 定向 76/76 + 全量 283/284（1 预存在） |
| TRACE_DURABILITY_STATUS | **PARTIAL** | in-process store + prune TTL 已实现；进程重启即失，属 Memory runtime 语义；持久化待 Supabase |
| TRACE_SUPABASE_RUNTIME_STATUS | **BLOCKED_EXTERNAL** | ENV-SUPABASE-01；禁止恢复项目/猜远程数据/未批准 migration/声称 verified |

---

## 4. Regression

| 项 | 命令 | 结果 |
|---|---|---|
| typecheck | `npx tsc --noEmit` | **PASS** |
| build | `npm run build` | **PASS**（Compiled 12.5s；35/35 static pages） |
| M2-P3B acceptance | `npx vitest run tests/unit/m2-ac-acceptance.test.ts` | **29/29 PASS** |
| M1 037/038 + M2 Phase1/2 + Console | `npx vitest run tests/unit/m1-single-source-of-truth.test.ts tests/unit/els-eval-037-038.test.ts tests/unit/m2-trace-phase1.test.ts tests/unit/m2-trace-phase2.test.ts tests/unit/m2-console-*.test.ts` | **76/76 PASS** |
| full unit | `npx vitest run tests/unit` | **283/284**；1 项失败 = llm-safety bundle 静态检查（base 预存在，两文件相对 b0ff1bf 零改动，非新增失败） |

---

## 5. Final Status Model

```
M2_CODE_STATUS:                PASS
M2_MEMORY_RUNTIME_STATUS:      PASS
M2_CONTRACT_AC_STATUS:         PARTIAL
  - AC-1..AC-6: PASS（Memory scope 实测）
  - AC-7: 页面能力 PASS；2-Minute RCA = MANUAL_ACCEPTANCE_PENDING
  - AC-2 附注: REAL_PROMPT_REGISTRY = NOT IMPLEMENTED（prompt_version 固定 v1）
M2_PRODUCTION_VERIFICATION:    BLOCKED_EXTERNAL / UNVERIFIED（ENV-SUPABASE-01）
```

未写整体 `M2_STATUS=PASS`：Supabase persistence / AC final gate 尚未完成。
