# M2: Observability / Trace Contract — 设计冻结（V2）

| | |
|---|---|
| **Spec** | `M2_OBSERVABILITY_CONTRACT_V2_2` |
| **状态** | `DESIGN_FROZEN_M2_IMPLEMENTATION_PENDING` |
| **日期** | 2026-09-09（V1 冻结 → 同日 V2 补全 → V2.1 Post-M1 对齐 → V2.2 最终一致性清扫） |
| **输入** | `ELS_EVALUATION_V1_1`（39 Case，S1×6 / S2×25 / S3×8，required_trace_fields 去重 129 项）；`docs/v2-system-audit.md`（7 个 LLM 调用点 + 统一 callLlmStructured 管线 + P1-4 Trace 不落库）；`docs/v3/m1-single-source-of-truth.md`（Server Repository 权威化）；M1 Final 已完成：`M1_CODE_STATUS: PASS` / `M1_PRODUCTION_VERIFICATION: UNVERIFIED`；recall_level 已冻结为 **0–2 mastery level**；幂等已冻结为 **显式 Repository created boolean**（`CreateLearningEventResult.created`），原 traceId 幂等反例已在 M1 Final 修复 |
| **本轮边界** | V2.2 仅做最终一致性清扫（Failure Layer 枚举对齐 / 端点事实 / Speaking 质量门事实 / M1 文档残留），**不新增任何设计，零实现**。不改业务代码 / DB Schema / API / Prompt / 页面 / Evaluation Gold。不引入 Datadog / LangSmith / OpenTelemetry 等平台。 |
| **V1→V2 变更** | ① 新增 §1.7 字段级六要素契约（required/type/producer/consumer/retention/sensitivity）；② §2 Event Model 升级为 A/B/C 三方案四维显式对比；③ 新增 §4 Debug Console 信息架构（2 分钟判层）；④ §5 新增逐类 Evaluation Mapping 与可判性三级分级；⑤ §6 验收标准按 7 条硬性 AC 重写；V1 的结构（§0 Goal / §1 Lifecycle / §3 Event Types / §8 矩阵）原样保留并入 |
| **V2→V2.1 变更** | ① FIX-01：幂等事实更新——M1 Final 已修复 traceId 反例，正式契约为 `client_event_id`（业务幂等 identity）+ `CreateLearningEventResult.created`（Repository 显式首次创建结果）+ `trace_id`（observability only），AC-6 转为 Regression Guard，`M1_PRECONDITION_STATUS: SATISFIED`；② FIX-02：恢复里程碑边界——instrumentation / trace persistence / version trace / retrieval / fallback / state before-after trace / Debug Console minimal 实现均属 **M2 Implementation**，不得推迟 M3，M2 完成条件 = Design + Implementation + Verification；③ FIX-03：修正 §0 Goal overclaim，与 §5 A/B/C 可判性分级对齐；④ FIX-04：文档输入状态更新为 M1 Final 事实（见"输入"行） |
| **V2.1→V2.2 变更** | ① FIX-01：`response.sent.layer` 冻结为 `UI_PRESENTATION`、`report.aggregated.layer = REPORT_AGGREGATION`（废除中文非枚举标签），10 种 event_type 的 layer 全部 ∈ 13 层 Failure Taxonomy；② FIX-02：复习队列端点事实修正——真实 API 为 `POST /api/review/session`（`mode=DUE`），废除虚构的旧端点写法（§1.3 矩阵及全文）；③ FIX-03：Speaking Quality Gate 对齐冻结事实——四项 `schemaCheck / evidenceConsistencyCheck / actionabilityCheck / ieltsAlignmentCheck`，`quality_gate_scores` 表达全部四项，`ieltsAlignmentCheck` → Band leakage detection，废除旧的错误门数计数表述；④ FIX-04：M1 文档残留清理（recall_level 契约冲突当前态、Supabase→Memory 运行时降级暗示），正确表述为 Repository abstraction 仅提供结构基础、无 runtime automatic failover |
| **下游消费者** | **M2 Implementation**（埋点、trace 持久化/查询、Debug Console minimal 实现——本 Contract 为其唯一规格来源）；M3（基于 Trace 大规模运行 Eval 与 Bad Case Registry 闭环）；M4（Evidence-driven AI Upgrade） |

---

## 0. Goal

用**最小的字段与事件集合**，让任何一个 ELS Bad Case 发生后能够快速定位 Root Cause。Trace 的能力承诺（V2.1 修正，与 §5 可判性分级严格一致）：

> **对于单请求 AI 主链 Bad Case，Trace 应足以在 2 分钟内定位 primary suspect layer；对于跨事件状态重放、真实 UI 行为等特殊问题，Trace 提供必要证据，并允许结合 replay job / E2E 等专用工具。**

对应 §5 的诚实边界：A 级（29 Case）单请求主链内 Trace 自足；B 级（7 Case）Trace 提供完整证据但终审需人工/LLM-as-judge；C 级（3 Case：013/034/039）Trace 是必要非充分证据，必须配合离线重放 job、前端 E2E 等专用工具。诊断目标仍是把根因归到 `ELS_EVALUATION_V1_1` 的 13 层分类法之一（INPUT / ROUTING / STATE_READ / RETRIEVAL / PROMPT / MODEL / OUTPUT_VALIDATION / BUSINESS_RULE / STATE_WRITE / REPORT_AGGREGATION / FALLBACK / UI_PRESENTATION / UNKNOWN）。

**十问（RCA Question Set，M2 的存在理由）：**

| # | 问题 | 回答它的事件 |
|---|------|-------------|
| Q1 | 用户输入是什么？ | `request.received` |
| Q2 | 系统读到了什么状态？ | `state.read` |
| Q3 | 检索到了什么？ | `retrieval.executed` |
| Q4 | 用了什么 Prompt / Model / 参数？ | `llm.attempt` |
| Q5 | 模型原始输出是什么？ | `llm.attempt`（按策略截断/全量） |
| Q6 | Validation 是否拦截？ | `validation.result` |
| Q7 | 是否发生 fallback？ | `fallback.triggered` + `llm.attempt(attempt_purpose)` |
| Q8 | 写回了什么状态？ | `state.write` |
| Q9 | 用户最终看到了什么？ | `response.sent` |
| Q10 | Root Cause 属于哪一层？ | 由 Q1–Q9 收敛，见 §4.4 判层规则 |

**用户请求全链路视图（本 Contract 的覆盖承诺）：**

```
User Request → Routing → State Read → Retrieval → LLM Call
→ Output Validation → Fallback → State Write → Final Response
```

每一环都有对应事件类型（§1.6），任一环失败都能在 Trace 中定位。

**反目标（明确不做）：**
- 不做"记录越多越好"——每个字段必须能指出它服务哪些 Case；
- 不做实时监控大盘、告警、APM；
- 不为非 LLM 路径制造噪声事件；
- 不设计生产级大数据平台——这是求职作品的轻量 Observability。

---

## 1. Trace Schema

### 1.1 标准节点序列

```
Request
  │
  ├─ (1) request.received          [INPUT]
  ├─ (2) routing.decided           [ROUTING]        仅 /api/agent/message
  ├─ (3) state.read                [STATE_READ]     按端点条件
  ├─ (4) retrieval.executed        [RETRIEVAL]      仅词卡生成 / ima 知识注入
  ├─ (5) llm.attempt ×N            [MODEL]          primary → repair → fallback provider
  ├─ (6) validation.result         [OUTPUT_VALIDATION]  Zod + 口语四项质量门
  ├─ (7) fallback.triggered        [FALLBACK]       条件触发
  ├─ (8) rule.applied              [BUSINESS_RULE]  确定性规则路径（调度/短路/规则引擎）
  ├─ (9) state.write               [STATE_WRITE]    仅写路径
  └─ (10) response.sent            [UI_PRESENTATION]  请求响应边界（layer 冻结值）
```

补充节点：`report.aggregated` [REPORT_AGGREGATION]，仅报告端点，位于 state.read 之后、llm.attempt（总结）之前。

### 1.2 跳过节点的语义（关键设计决定）

**条件节点不发生 = 不发事件；但"主动短路"必须正向记录，不允许靠"事件缺席"来推断。**

1. **结构性缺席**（该端点本来就没有该节点，如判题无检索）：不发事件。每个端点的期望节点集在 §1.3 固定，**期望节点缺席本身视为埋点 Bug**，Contract 校验器应能发现。
2. **运行时跳过**（节点存在但被确定性逻辑短路，如空答案不调 LLM——Case 008）：必须发 `rule.applied`（`rule_key=empty_answer_short_circuit`），使 `llm_call_count=0` 成为**正向记录的事实**而非推断。
3. **条件失败**（fallback 链中某环节不适用）：`fallback.triggered` 的 `chain_snapshot` 记录整条链及每个环节的状态（`used | skipped(reason) | unavailable`），不留解释空白。

### 1.3 端点 × 节点矩阵

| 端点 | routing | state.read | retrieval | llm.attempt | validation | fallback | rule.applied | state.write | report.agg |
|---|---|---|---|---|---|---|---|---|---|
| `/api/agent/message` | ✅ | ✅ conversation_state | ◐ 仅配置 ima | ✅ fast | ✅ Zod | ✅ mock 兜底 | ◐ mock 短路 | ❌（state_patch 随响应返回，不落服务端） | ❌ |
| `/api/learn/card` | ❌ 参数直入 | ✅ seed/item 查 | ✅ knowledge | ✅ main | ✅ Zod | ❌ 502 直抛 | ❌ | ✅ 幂等建 item | ❌ |
| `/api/learn/submit` | ❌ | ✅ state_before | ❌ 判题无检索 | ✅ fast 判题 | ✅ Zod | ✅ fallbackJudge | ✅ 空答案短路 | ✅ event+state | ❌ |
| `/api/review/submit` | ❌ | ✅ state_before | ❌ | ✅ fast 判题 | ✅ Zod | ✅ fallbackJudge | ✅ 间隔表+短路 | ✅ event+state | ❌ |
| `/api/review/session`（mode=DUE，队列） | ❌ | ✅ due 快照 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ 纯读 | ❌ |
| `/api/speaking/analyze` | ❌ | ✅ session+ability | ❌ 不注入 | ✅ main | ✅ Zod+四项质量门 | ✅ 规则引擎 | ✅ 规则引擎路径 | ✅ observation 写 | ❌ |
| `/api/speaking/transcribe` | ❌ | ❌ | ❌ | ✅ provider=whisper | ❌ 非结构化 | ◐ 前端文字回退（记 `ui_fallback_offered` 于 response） | ❌ | ❌ | ❌ |
| `/api/report` | ❌ | ✅ 聚合读 | ❌ | ◐ 总结（可 null） | ✅ Zod | ◐ 失败→null 非阻塞 | ◐ insufficientData | ❌ 纯读 | ✅ |

### 1.4 Trace 头（每请求 1 条）

```json
{
  "trace_id": "uuid-v4",
  "request_id": "client-logical-id",
  "user_hash": "sha256:<hex16>",
  "route": "/api/review/submit",
  "started_at": "ISO8601(ms)",
  "ended_at": "ISO8601(ms)",
  "latency_ms": 1830,
  "http_status": 200,
  "app_error_code": null,
  "degradation_flag": false,
  "event_count": 8,
  "suspect_layers": []
}
```

`trace_id` vs `request_id` vs `client_event_id` 三者语义（**三者并存，不冗余**；V2.1 按 M1 Final 正式契约对齐）：
- `trace_id`：服务端观测单位（**observability only**，不参与任何业务逻辑，AC-6）；Case 012 的 `trace_id×3` = 三次独立请求；
- `request_id`：客户端逻辑动作单位（重试不变）；
- `client_event_id`：**业务幂等 identity**（唯一判重键，仅写路径 learn/review submit）；Repository 侧由 `CreateLearningEventResult.created` 显式返回是否首次创建（幂等判定唯一权威语义）。Case 037 的两次请求 = 两个 trace，靠 `client_event_id` 关联。

### 1.5 TraceEvent 信封（每请求 N 条，统一信封 + 按类型异构 payload）

```json
{
  "trace_id": "uuid-v4",
  "event_id": "uuid-v4",
  "parent_event_id": null,
  "seq": 5,
  "ts": "ISO8601(ms)",
  "event_type": "llm.attempt",
  "layer": "MODEL",
  "duration_ms": 1420,
  "status": "ok",
  "error": { "code": null, "message": null },
  "payload": { }
}
```

信封字段全部 MUST（trace_id / event_id / seq / ts / event_type / layer / status）；`parent_event_id`、`duration_ms`、`error`、`payload` 按类型 MUST 或 SHOULD（§1.6）。单条 `payload` 序列化后上限 **4KB**，超限截断并置 `payload_truncated: true`。`layer` 枚举与 ELS_EVALUATION_V1_1 的 13 层一字不差。

### 1.6 Event Types（10 种 payload 契约）

| # | event_type | layer | MUST payload 字段（SHOULD 括注） |
|---|---|---|---|
| 1 | `request.received` | INPUT | `input_summary`(结构化截断 200 字，不存全文)、`client_event_id`(写路径)、`session_id`(口语)、(is_retry_hint) |
| 2 | `routing.decided` | ROUTING | `intent_decision`、`ui_action_type`、`persistence_required`(002 正向记录无副作用)、(disambiguation_needed / reject_reason) |
| 3 | `state.read` | STATE_READ | `entity`、`keys`(itemId/**canonical_form**/sessionId/userId)、`snapshot_summary`、`due_queue`(review/session mode=DUE，截断前 20 + total_due)、(state_not_found 显式记录) |
| 4 | `retrieval.executed` | RETRIEVAL | `query_raw`、`query_normalized`、`knowledge_object_ids`(空=miss)、`knowledge_injected_count`、(knowledge_miss_flag / conflict_detected / conflict_resolution / injected_context_snippet≤200 字) |
| 5 | `llm.attempt` | MODEL | `attempt_purpose`(primary/repair/fallback_provider/mock_shortcircuit)、`provider`、`model_name`、`tier`、`prompt_key`、`prompt_version`、`token_usage{prompt,completion,total}`、`latency_ms`、`raw_output`(默认 head256+tail256+sha256；异常全量，§3)、(temperature / model_version)；whisper 端点允许 prompt 字段为 null |
| 6 | `validation.result` | OUTPUT_VALIDATION | `validator`、`outcome`(pass/fail/needs_review)、`zod_validation_result`+`repair_attempts`(LLM 路径)、`quality_gate_scores`（四项全量：`schemaCheck` / `evidenceConsistencyCheck` / `actionabilityCheck` / `ieltsAlignmentCheck`，冻结契约见 `lib/speaking/feedback-quality.ts`）+`quality_warning`+`band_leakage_flag`(由 `ieltsAlignmentCheck` 产出，Band leakage detection)+`final_response_redacted`(口语)、(judge_confidence 判题端点) |
| 7 | `fallback.triggered` | FALLBACK | `trigger_error_code`、`chain_snapshot`[{step,from,to,status: used\|skipped\|unavailable}]、`degradation_flag`、`to_kind`(provider/rule_engine/fallback_judge/mock_response/null_summary) |
| 8 | `rule.applied` | BUSINESS_RULE | `rule_key`(review_interval_table/learning_branch_map/empty_answer_short_circuit/insufficient_data/speaking_rule_engine/observation_promotion)、`inputs`{correctness,used_hint,chain,…}、`outputs`{next_review_at,recall_level_delta,schedule_quality,…}、(llm_call_count 与事件缺席互证) |
| 9 | `state.write` | STATE_WRITE | `entity`、`keys`、`event_id`+`client_event_id`、`idempotency_outcome`(inserted/duplicate_ignored，由 `CreateLearningEventResult.created` 显式映射——观测 Repository 结果，不参与判重)、`state_before/after`(changed-fields diff + canonical hash)、`next_review_at_before/after`(复习链)、(replay_checksum；observation 写加 `evidence_status_before/after`+`observation_persisted_flag`+`source_id`+`dimension`；口语评估写加 evaluation_result 摘要) |
| 10 | `response.sent` / `report.aggregated` | UI_PRESENTATION / REPORT_AGGREGATION | response：`http_status`、`app_error_code`、`output_summary`(≤500 字，泄漏只存 redacted)、`fallback_used_flag`、(ui_fallback_offered)；report：`period`、`aggregate_checksum`、`section_render_flags`、`insufficient_data_flag`、`baseline_availability`、`summary_generated`(true/false/null)、(aggregate_values) |

### 1.7 字段级六要素契约（V2 新增）

39 Case 的 `required_trace_fields` 去重后归入 13 个字段组。每组按六要素定义：**级别**（MUST/SHOULD/OPTIONAL）、**类型**、**producer**（埋点位置，对应现有代码结构，M2 Implementation 的唯一接线图）、**consumer**（消费方：Case 组 / Debug Console 区 / Registry / 指标）、**保留**（events 30 天 / trace 头 90 天，滚动清理；被 Registry 登记的 trace 以导出快照形式随 Registry 永久保留，不延长原表）、**敏感级**（PLAIN / HASH / TRUNCATE / REDACT / SAMPLE / NEVER，细则见 §3）。

| 字段组 | 代表字段 | 级别 | 类型 | Producer | Consumer | 保留 | 敏感级 |
|---|---|---|---|---|---|---|---|
| Request 链路 | trace_id, request_id, user_hash, route, client_event_id, session_id, input_summary | MUST | string/uuid | API route 入口（扩展现有 `lib/observability/trace.ts` middleware） | 全部 Case；Console A/B/D 区；Registry 主键 | 头 90d / 事件 30d | user_hash=HASH；input_summary=TRUNCATE |
| Routing | intent_decision, ui_action_type, persistence_required | MUST(聊天) | enum/string | `/api/agent/message` 意图路由层 | 001/002；Console B/C | 30d | PLAIN |
| State Read | entity, keys(canonical_form), snapshot_summary, due_queue | MUST | string/object/array | Repository 读方法调用点（route handler 内） | 003/004/009/010/013/014/038/039；Console C 检查 3 | 30d | PLAIN（快照为学习状态，非自由文本） |
| Retrieval | query_raw/normalized, knowledge_object_ids, injected_count, conflict_*, snippet | MUST | string/array[int]/bool | 检索层（learn/card 词卡 + ima 注入调用点） | 022–026/035；Console C 检查 4 | 30d | snippet=TRUNCATE；原文 NEVER |
| Prompt | prompt_key, prompt_version, (temperature) | MUST / SHOULD | string/number | `callLlmStructured` 统一管线入口（7 调用点共用） | PROMPT 层判层唯一依据（006/016/017/020/026/030/039）；Console D 同版本分布 | 30d | PLAIN |
| Model | provider, model_name, tier, token_usage, latency_ms, (model_version) | MUST | string/number | `callLlmStructured` 管线 | 005/015/021/031；成本核算；Console B | 30d | PLAIN（provider 名 + `has_user_override:bool`；用户 API Key NEVER） |
| LLM Result | raw_output, llm_error_code | MUST(策略化) | string/enum | `callLlmStructured` 管线 | 005/006/017/019/025/027/030/032/033（9 Case）；Console C 检查 5–6 | 30d | TRUNCATE（异常场景全量）+ sha256 |
| Validation | validator, outcome, zod_result, repair_attempts, quality_gate_scores(四项), band_leakage_flag, quality_warning | MUST | enum/object/number | `callLlmStructured` Zod 层 + 口语四项质量门（`lib/speaking/feedback-quality.ts`） | 001/003/015/016/019/020/032/033；Console C 检查 7 | 30d | REDACT（band 泄漏只存 redacted 版） |
| Fallback | trigger_error_code, chain_snapshot, degradation_flag, to_kind | MUST | enum/array/bool | `shouldFallback` 切换点 + 规则引擎/fallbackJudge 降级分支 | 005/021/031/036；指标 Fallback Success Rate；Console C 检查 11 | 30d | PLAIN |
| State Write | entity, keys, idempotency_outcome, state_before/after, next_review_at_*, replay_checksum, evidence_*(039) | MUST | object/string | Repository 写方法（createLearningEvent / upsertUserItemState / observation 写） | 003/007/011/012/013/037/038/039；Console C 检查 9 | 30d | diff+canonical hash，非全量快照 |
| Response | http_status, app_error_code, output_summary, fallback_used_flag, (ui_fallback_offered) | MUST | number/enum/string/bool | API route 出口 | 几乎全部 Case 的 Q9；Console A 区 | 头 90d / 事件 30d | output_summary=TRUNCATE 500；泄漏=REDACT |
| Report | period, aggregate_checksum, section_render_flags, insufficient_data_flag, baseline_availability, summary_generated, (aggregate_values) | MUST(报告) | enum/string/bool | `lib/report/aggregator` + 总结调用点 | 014/027/028/029/030/038；Console C 检查 10 | 30d | PLAIN |
| Performance | started_at/ended_at, latency_ms, ts, duration_ms | MUST | ISO8601/number | 信封级（trace 头 + 每事件） | 031 超时诊断；Console B latency 分解条 | 同宿主记录 | PLAIN |

**删除项（显式 DELETE）**：`clock_snapshot`（客户端时钟不可信且不可诊断；所有 ts 仅服务端时钟，调度边界问题由 `state.read.due_queue` 覆盖）。**采样项（OPTIONAL，过渡期 1%）**：`local_snapshot` / `ui_copy_strings`（M1 收敛完成后整体删除，§3.5）。

**充分性声明**：39 Case 的 `required_trace_fields` 逐字段核对（脚本 `docs/tools/m2_contract_check.py` 机械校验 + 下表别名归位），全部落在上述字段集内，无缺口；派生量（event_count / llm_call_count / replay_checksum）不单独存列、由事件流本身给出——这是"最小"的边界。

**别名归位表**（Case 中自由书写的字段描述 → Contract 规范字段名）：

| Case 侧写法 | 归位到 | 说明 |
|---|---|---|
| `fallback_chain` | `fallback.triggered.chain_snapshot` | 同义 |
| `retrieval_query` / `retrieval_query(normalized)` | `retrieval.executed.query_raw` / `query_normalized` | 拆分为前后两个规范字段 |
| `prompt_key/version` | `prompt_key` + `prompt_version` | 斜杠简写 |
| `event.correctness` | `state.write` 持久化的 correctness 值 | 三层断言的 event_correctness 层（V1.1 §6.0.1） |
| `state 快照` / `state_before/after 全量` | `state.read.snapshot_summary` / `state.write` changed-fields diff + canonical hash | 全量快照不持久化，重放校验用 hash 比对（013） |
| `state_after 终态` | `state.write.state_after` | 修饰词 |
| `next_review_at 序列/集合（读前快照）` | `state.read.due_queue` + 每次写路径的 `next_review_at_before/after` | 序列由跨 trace 事件流聚合得出 |
| `tasks` / `tasks 顺序` / `due 队列` | `state.read.due_queue` | 到期任务有序列表 |
| `client_event_id 集合` | `client_event_id`（跨 trace 关联，Console D 区） | 013 离线重放聚合键 |
| `event 全集` | 事件流本身（append-only 全事件） | 不单独存列 |
| `item_id/canonical_form` | `state.read/write.keys`（itemId / canonical_form） | |
| `first/second_answer` | `state.read.snapshot_summary` 的 session 两答快照 | 018 |
| `report 聚合值` | `report.aggregated.aggregate_values` | |
| `response_body×2` | 两个 trace 各自的 `response.sent.output_summary` | 037，不存原始 body |

---

## 2. Event Model（V2 升级：三方案显式对比）

### 2.1 候选方案

- **A. 单条完整 trace JSON**：请求结束时一次性写入 `{ request, routing, state, retrieval, llm[], validation, fallback, state_write, response, perf }` 大文档；
- **B. 纯 append-only Trace Events**：只有事件行，无头记录，一切靠事件流聚合；
- **C. Trace 头 + append-only Trace Events（推荐）**：§1.4/§1.5 双层结构。

### 2.2 四维对比

| 维度 | A 单 trace JSON | B 纯事件流 | **C 头+事件（推荐）** |
|---|---|---|---|
| **Debugging** | 一次读取看全貌；但 5–10KB 文档内定位一个字段靠翻找；跨 trace 对比（037 双请求）需程序整文档 diff | 逐事件天然对应节点顺序；但"这次请求整体怎么样"（status/latency/是否降级）需要聚合全部事件后才知道 | **头给 10 秒速览（A 区）+ 事件给逐层细节（B 区）**；`suspect_layers` 预填粗判，先看头再下钻 |
| **Query** | 只能按 trace_id 取整文档，程序内过滤；"找所有 llm_error_code=MODEL_SCHEMA_MISMATCH"（高频诊断动作）需全表扫描+解析 | 字段级索引查询最灵活 | 同 B 的事件级查询，且**头可独立查询**（按 http_status / degradation_flag / route / latency 筛选不展开事件）——Bad Case 筛选的主入口 |
| **Storage** | 每请求 1 文档；但请求结束前无法部分 flush（**中途崩溃丢整条 trace**）；fallback 后需回填头字段（读改写） | 追加不可变、无回填；但缺头导致每次列表查询都要聚合 | 事件追加 + 头在请求结束时一次写（崩溃时头缺失=诊断"请求未完成崩溃"本身的信号） |
| **实现复杂度** | 最低（logger.info 一次） | 中（仅事件表） | 中（多一张头表/头行）——多出的成本换来查询效率与速览能力 |

### 2.3 推荐与现状衔接

**推荐 C。** 决定性理由：
1. Case 012/037 需要跨 trace 对比（`trace_id×3`、`trace_id×2`），扁平事件天然支持按 `client_event_id` / `request_id` 聚合；
2. 每层耗时（latency 分解）需要离散时间戳；
3. 巨型 JSON 无法做字段级查询；
4. 事件追加模型与 append-only 事件流的诊断习惯一致（Case 013 重放）；
5. 与现有基础设施衔接成本最低：`lib/observability/logger.ts` 已输出结构化 JSON 日志且自动带 trace_id——**起步形态即"stdout JSON lines"（C 的退化形态：头+事件都进日志流）**，Trace 持久化/查询的存储后端选型（Supabase 表 vs 日志服务）属 **M2 Implementation** 期决策，Contract 字段不因后端改变。

---

## 3. Privacy / Cost Boundary

### 3.1 NEVER（绝不保存）

- 用户语音 / 音频字节（只存 `audio_metadata` 指标：duration、wpm、pause 统计——**指标非音频**）；
- 整段聊天历史与 `conversation_state` 全文（只存 `input_summary` 截断摘要）；
- 任何 API Key、用户自有模型凭证、ima 凭证、Authorization 头（**连 hash 都不存**；只存 provider 名 + `has_user_override: bool`）；
- 用户备考目标等敏感配置全文（goals 只存字段级枚举摘要）；
- 知识库对象原文（只存 object ids + 200 字 snippet）。

### 3.2 HASH

- `user_id` → `user_hash = sha256(user_id + deployment_salt)` 前 16 hex；salt 不入库、不入日志；
- `llm_raw_output` 截断时附 `sha256(raw)`（两处截断输出一致性比对，012）。

### 3.3 TRUNCATE

- `user_answer` → 200 字；`llm_raw_output` 默认 head 256 + tail 256；`injected_context_snippet` → 200 字；error message → 256 字；`output_summary` → 500 字。

### 3.4 REDACT

- Band 泄漏被质量门拦截时，`response.sent.output_summary` **只存 redact 后版本** + `band_leakage_flag=true`（Case 020：红线内容本身也不该二次扩散进日志）。

### 3.5 SAMPLE

- `local_snapshot`、`ui_copy_strings` → 1% 采样，仅过渡期（M1 收敛完成后整体删除）。

### 3.6 用户四问的直接回答

| 问题 | 回答 |
|---|---|
| 是否保存完整 user input？ | **否**。只存 `input_summary`（结构化摘要，自由文本截断 200 字）。完整原文仅存在于业务库本体，Trace 不复制。 |
| 是否保存完整 LLM raw output？ | **默认否**（head256+tail256+sha256）。**异常场景全量**：validation fail / 质量门 fail·needs_review / fallback 触发 / 任何 error / 显式 debug 开关。关键洞察：**需要 raw output 的 Case 恰好全部是异常场景，按需全量的天然覆盖率即足够**。 |
| Prompt 是否全量保存？ | **只存 prompt_key + prompt_version**，不存渲染后的完整 prompt 文本（prompt 本体由版本化注册表管理，P1-4 落地后可按 version 回溯）。 |
| Personal learner data 如何脱敏？ | §3.1–3.5 五级政策；核心原则：Trace 只存"判断所需的证据摘要"，不复制业务数据本体；学习状态以 changed-fields diff + canonical hash 形式记录。 |

### 3.7 成本边界（量级估算：1000 DAU × 30 req/日）

- 30k traces/日 × 平均 6 events = 180k events/日；截断策略下平均 payload ≈ 400B → **≈72MB/日，2.2GB/月**——单一存储后端即可承载；
- 若 raw output 无条件全量：额外 +100~150MB/日，且 PII 暴露面与 §3.1 冲突——**不可取**；
- 五条 V1 硬控制：① raw output 按需全量；② state.write 只存 diff+hash；③ 单事件 payload ≤4KB；④ 保留期 events 30d / 头 90d 滚动清理；⑤ 不新增生产级基础设施（stdout JSON lines 起步，持久化后端在 M2 Implementation 内轻量落地）。

---

## 4. Debug Console 信息架构（V2 新增）

**目标：输入一个 trace_id，2 分钟内判断 Failure Layer。** 只定义字段与布局结构，不做视觉设计。

### 4.1 查询入口（三个，互为补充）

1. **trace_id**（主入口）：精确单次请求；
2. **request_id / client_event_id**：聚合视图——列出关联的全部 trace（037 双请求对比、012 多轮序列）；
3. **user_hash + 时间窗**：该用户近期 trace 列表（013/038 状态漂移的时间线排查）。

### 4.2 页面结构（A→E 五区，按诊断动线排列）

```
┌─ A. Trace Header 摘要条（10 秒速览区）──────────────────────────┐
│ route | http_status | app_error_code | latency_ms | degradation_flag │
│ suspect_layers(预填粗判) | event_count | started_at                │
│ 用户可见结果摘要: response.sent.output_summary(截断)              │
├─ B. 事件瀑布时间线（主工作区）──────────────────────────────────┤
│ 每事件一行: seq | event_type | layer | status | duration_ms |      │
│            关键字段内联(如 llm: model+purpose+error_code)          │
│ · 异常事件高亮(status=error/degraded/异常 skipped)                │
│ · latency 分解条(每事件 duration 占总时长的比例条)                 │
│ · 行点击展开 payload 全文(截断标记 truncated + sha256)             │
│ · 期望节点对照: 按 §1.3 端点矩阵标出"应有而缺席"的节点(埋点 Bug     │
│   vs 业务短路的区分: 缺席+rule.applied 存在=正常短路)              │
├─ C. 判层面板（Q10 收敛区，§4.4 规则的机器化呈现）────────────────┤
│ 12 项瀑布检查逐项显示: ✅通过 / ❌失败(附证据字段值+跳转锚点) /      │
│ ⚠️证据缺失(标注缺哪个事件)                                          │
│ → Primary Suspect Layer 结论 + 歧义层提示(跨两层 Case 交人工定夺)   │
├─ D. 上下文关联区 ─────────────────────────────────────────────┤
│ · 同 request_id / client_event_id 的关联 trace 列表(一键对比视图)    │
│ · 同 prompt_version 近期 pass/fail 分布(PROMPT 层判据)              │
│ · 同 user_hash 近期 trace 列表                                     │
├─ E. 操作区（只读 + 登记）─────────────────────────────────────┤
│ 导出 trace JSON | 复制诊断摘要(十问格式) |                          │
│ 一键登记 Bad Case Registry(root_cause_trace = trace_id + 判层结论   │
│ 预填，Registry 15 字段中 evidence 部分自动带入)                     │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 2 分钟判层路径（设计验收线）

| 步骤 | 区 | 动作 | 预算 |
|---|---|---|---|
| 1 | A | 看 status / error_code / degradation_flag / suspect_layers，形成第一假设 | 10s |
| 2 | B | 扫瀑布找**第一个异常事件**（时间线自上而下第一个 error/degraded） | 30s |
| 3 | C | 判层面板 12 项检查确认或推翻第一假设（每项证据可跳转） | 60s |
| 4 | D | 交叉验证（同版本分布 / 关联 trace 对比），排除环境噪声 | 20s |

### 4.4 Trace → Root Cause 判层规则（Q10 的回答方式）

按事件顺序做瀑布排除，**第一个异常证据所在层即 Primary Suspect Layer**：

| 检查顺序 | 证据 | 判层 |
|---|---|---|
| 1 | `request.received` 输入即非法/为空 | INPUT |
| 2 | `routing.decided.intent_decision` ≠ 期望 | ROUTING |
| 3 | `state.read.snapshot_summary` 与期望不符（含 not_found） | STATE_READ |
| 4 | `retrieval.executed` ids 漏/多/冲突 | RETRIEVAL |
| 5 | 同 `prompt_version` 下系统性 fail，而换版本修复 | PROMPT |
| 6 | `llm.attempt.raw_output` 内容错（schema 对但语义错） | MODEL |
| 7 | `validation.result.outcome=fail` 且 raw 本身合法 | OUTPUT_VALIDATION |
| 8 | `rule.applied.outputs` 与输入不符（间隔/分支/短路错） | BUSINESS_RULE |
| 9 | `state.write` 写错/漏写/`duplicate_ignored` 异常 | STATE_WRITE |
| 10 | `report.aggregated.aggregate_checksum` 与事件流重算不符 | REPORT_AGGREGATION |
| 11 | `fallback.triggered` 链本身错（误切换/该切未切） | FALLBACK |
| 12 | 以上全对但用户看到的不对 | UI_PRESENTATION |
| — | 证据不足 | UNKNOWN（Registry 强制记录缺哪个事件） |

歧义处理：一个 Case 常跨两层（如 019 = OUTPUT_VALIDATION 或 MODEL），Contract 不做仲裁——**trace 提供两层的完整证据，判层结论写进 Bad Case Registry，由人/回归循环定夺**。

---

## 5. Evaluation Mapping（V2 新增框架 + V1 矩阵）

### 5.1 逐类 Trace 使用方式

| 评测类 | Case | Trace 如何被评测使用 | 关键事件/字段 |
|---|---|---|---|
| **Answer Judge** | 005–008 | 判题结果三层断言（V1.1 §6.0.1）：`api_result`（response.sent.output_summary）↔ `event_correctness`（state.write 持久化值）↔ `state_transition`（state.write diff）；008 靠 rule.applied 的 llm_call_count=0 正向证明短路 | response.sent / state.write / rule.applied |
| **Speaking** | 015–021 | 质量门分数（validation.result.quality_gate_scores）驱动自动判；019/020 红线靠 band_leakage_flag / evidence 门 + raw 全量（异常场景策略保证全量）；018 改善判定跨两 trace 靠 session_id 聚合 + observation 升迁（state.write.evidence_*） | validation.result / state.write / llm.attempt |
| **Retrieval** | 022–026 | query_raw vs query_normalized 对比（035 规范化缺陷）；ids 空数组 + miss_flag（023/024）；conflict_detected/resolution（026）；snippet（025 污染证据） | retrieval.executed |
| **Report** | 027–030 | aggregate_checksum 与事件流重算互证（014/027/038）；insufficient_data_flag / summary_generated=null（028）；section_render_flags / baseline_availability（029/030） | report.aggregated |
| **Fallback** | 031–036 | chain_snapshot 全链状态（used/skipped/unavailable）判定"该切未切/误切换"；032 repair 链靠 attempt_purpose=repair 的 llm.attempt 序列；034 whisper error_code + ui_fallback_offered；degradation_flag 传播三处（事件/头/response）一致性 | fallback.triggered / llm.attempt / response.sent |
| **State Consistency** | 013/014/037–039 | 037 双 trace 靠 client_event_id 关联 + 第二 trace 的 idempotency_outcome 直接判层；038 server_state_checksum ↔ report aggregate_checksum 互证；013 replay_checksum 供离线重放 job 比对；039 M2 行（memory write ↔ trace_id）即本 Contract 的实现本身 | state.write / state.read / report.aggregated |

### 5.2 可判性三级分级（V2 新增，诚实边界）

**前提**：以下分级均指 **M2 Contract 落地后** 的能力。当前实现（V2 Audit P1-4）trace 仅存在于日志不落库，**全部 Case 的 post-hoc 诊断在现状下均不可用**——这正是 M2 的存在理由。

**A级：可完整自动判（trace 字段充分，断言可机械化）——29 Case**

001/002/003/004/005/007/008/009/010/011/012/014/015/020/021/022/024/025/026/027/028/029/031/032/033/035/036/037/038

（说明：020 虽为 S1 红线，band_leakage_flag + redacted 版本已是确定性布尔断言；038 在 M1 收敛后归此级，过渡期 server 侧 checksum 断言仍可自动执行。）

**B级：半自动（trace 提供完整证据，终审需人工/LLM-as-judge 仲裁）——7 Case**

| Case | Trace 提供什么 | 为什么不能纯机械判 |
|---|---|---|
| 006 | correctness_judged + judge_confidence + raw（截断） | "语义等价"gold 本身是语义判断；错判时 MODEL vs PROMPT 归因需人看 raw |
| 016 | quality_gate_scores(actionability) + raw | V1.1 已标 `[H]` MANUAL_GOLD——"建议可执行且相关"需人工 |
| 017 | raw（复读检测证据） | 重复识别质量人工抽检 |
| 018 | 双 trace session 聚合 + observation 升迁 | "明显改善"显著性人工抽检 |
| 019 | evidence 门 + raw 全量 | evidenceConsistencyCheck 自动第一道，争议人工仲裁（S1 红线不冒自动判风险） |
| 023 | query 对比 + miss_flag | miss **检测**可自动；但"是否应召回"（语义 gold）在当前关键词引擎下不可自动确证——记录 miss，P0-4 升级后转 A 级 |
| 030 | baseline_availability + LLM raw 全量 + output 标志 | API 侧可自动判；**UI 文案层**（前端硬编码）只有 ui_copy_strings 标志/采样，全面扫描需 E2E |

**C级：Trace 之外还需专用工具（Trace 是必要非充分证据）——3 Case**

| Case | Trace 提供 | 还需要什么 |
|---|---|---|
| 013 | replay_checksum（每 state.write） | **离线重放 job**：从事件流重算状态并与 checksum 比对——重放器是独立工具，非 trace 范畴 |
| 034 | whisper error_code + ui_fallback_offered | **E2E**：用户真的能切到文字输入并提交（前端行为） |
| 039(M2 行) | trace 关联本身 | memory write ↔ trace_id 回溯即 M2 实现；但"回溯可用"的验收本身是 §6 AC-7 的验收动作 |

### 5.3 39 Case 覆盖矩阵（V1 保留）

事件缩写：REQ=request.received, RT=routing.decided, SR=state.read, RET=retrieval.executed, LLM=llm.attempt, VAL=validation.result, FB=fallback.triggered, RULE=rule.applied, SW=state.write, RSP=response.sent, RAG=report.aggregated

| Case | 类别 | 必需事件（加粗=判层主证据） | 判层 | 可判级 |
|---|---|---|---|---|
| 001 | 路由 | REQ, **RT**, LLM, VAL, RSP | ROUTING / OUTPUT_VALIDATION | A |
| 002 | 路由 | REQ, **RT**, RSP | ROUTING | A |
| 003 | 新词 | REQ, **SR**, RET, LLM, VAL, **SW**, RSP | MODEL / STATE_WRITE / RETRIEVAL | A |
| 004 | 新词 | REQ, **SR**, SW, RSP | STATE_READ / BUSINESS_RULE | A |
| 005 | 判题 | REQ, SR, **LLM**, RULE, **SW**, RSP | MODEL / STATE_WRITE | A |
| 006 | 判题 | REQ, **LLM**(raw), RULE, RSP | MODEL / PROMPT | B |
| 007 | 判题 | REQ, **RULE**(两链分支), SW, RSP | BUSINESS_RULE | A |
| 008 | 判题 | REQ, **RULE**(短路, llm_call_count=0), SW, RSP | BUSINESS_RULE | A |
| 009 | 调度 | REQ, **SR**(due 快照+顺序), RSP | STATE_READ | A |
| 010 | 调度 | REQ, **SR**(total_due=0), RSP | STATE_READ | A |
| 011 | 调度 | REQ, SR, LLM, **RULE**, **SW**(before/after), RSP | BUSINESS_RULE / STATE_WRITE | A |
| 012 | 调度 | 3×(REQ, LLM, RULE, SW)，靠 **client_event_id 序列** 串联 | BUSINESS_RULE | A |
| 013 | 状态记忆 | 全事件流 + **SW.replay_checksum**（离线重放 job） | STATE_WRITE / STATE_READ | C |
| 014 | 状态记忆 | SR, RAG, **SW/RAG checksum 互证** | STATE_READ / REPORT_AGGREGATION | A |
| 015 | 口语 | REQ, **LLM**, **VAL**(gate 分数), RULE(规则引擎路径), RSP | MODEL / OUTPUT_VALIDATION | A |
| 016 | 口语 | REQ, **VAL**(actionability), RSP | OUTPUT_VALIDATION / PROMPT | B |
| 017 | 口语 | REQ, **LLM**(raw), RSP | MODEL / PROMPT | B |
| 018 | 口语 | 2×(REQ, SR, **LLM**), **SW**(evidence 升迁), RSP | MODEL / STATE_WRITE | B |
| 019 | **口语红线** | REQ, LLM, **VAL**(evidence 门+raw 全量), RSP | OUTPUT_VALIDATION / MODEL | B |
| 020 | **口语红线** | REQ, LLM, **VAL**(band_leakage+redacted), RSP | OUTPUT_VALIDATION / PROMPT | A |
| 021 | 口语 | REQ, **LLM**(error_code), **FB**, RULE, RSP | FALLBACK | A |
| 022 | 检索 | REQ, **RET**(命中), LLM, RSP | RETRIEVAL | A |
| 023 | **检索** | REQ, **RET**(raw vs normalized, ids=[], miss_flag), LLM, RSP | RETRIEVAL | B |
| 024 | 检索 | REQ, **RET**(miss), LLM(不被阻塞), RSP | RETRIEVAL / FALLBACK | A |
| 025 | 检索 | REQ, **RET**(snippet), **LLM**(raw 全量), RSP | RETRIEVAL / PROMPT | A |
| 026 | 检索 | REQ, **RET**(conflict), LLM, RSP | RETRIEVAL / PROMPT | A |
| 027 | 报告 | REQ, SR, **RAG**(checksum), LLM(raw 全量), RSP | REPORT_AGGREGATION / MODEL | A |
| 028 | 报告 | REQ, **RAG**(insufficient_data, summary=null), RSP | BUSINESS_RULE / MODEL | A |
| 029 | 报告 | REQ, **RAG**(section_render_flags), RSP | REPORT_AGGREGATION / UI_PRESENTATION | A |
| 030 | **报告红线** | REQ, **RAG**(baseline_availability), **LLM**(raw 全量), RSP(output 标志) | REPORT_AGGREGATION / PROMPT / UI_PRESENTATION | B |
| 031 | **兜底** | REQ, **LLM**×2(主超时+备), **FB**(chain), RSP(latency) | FALLBACK | A |
| 032 | 兜底 | REQ, **LLM**(原始 raw 全量), **LLM**(repair), VAL, RSP | OUTPUT_VALIDATION / FALLBACK | A |
| 033 | 兜底 | REQ, LLM, VAL(修复后仍 mismatch), **RSP**(app_error_code 归类) | OUTPUT_VALIDATION / FALLBACK | A |
| 034 | 兜底 | REQ(audio 指标), **LLM**(whisper error_code), **RSP**(ui_fallback_offered) | FALLBACK(记 MODEL) | C |
| 035 | 兜底 | REQ, **RET**(normalized 漏检), RSP | RETRIEVAL | A |
| 036 | 兜底 | REQ, **LLM**(error), **FB**, **RULE**(fallbackJudge), RSP | FALLBACK | A |
| 037 | **幂等 S1** | 2×trace 靠 **client_event_id** 关联；第二个 trace 的 **SW.idempotency_outcome** | STATE_WRITE(→IDEMPOTENCY) | A |
| 038 | **跨模块 S1** | SW(state_after), **RAG(aggregate_checksum)**, server_state_checksum, (过渡期 local_snapshot 采样) | STATE_WRITE / STATE_READ | A |
| 039 | **跨模块** | SR(evidence_before), **SW**(升迁), 下次分析 **LLM.context_summary**(ability_context_injected) | STATE_WRITE / PROMPT | C(M2 行) |

**抽样走查（037 与 020，十问完整性验证）：**

**Case 037（幂等重放，S1）**——两个 trace：
- Q1：两次 `request.received.input_summary` + `client_event_id` 相同 → 确认重放；
- Q2/Q3：第二次 `state.read` 显示已推进状态；
- Q4~Q7：判题 LLM 可能照常执行（`llm.attempt` 正常）——**这正是"LLM 无辜"的证据**；
- Q8：第二个 trace 的 `state.write.idempotency_outcome` 若为 `inserted`（而非 `duplicate_ignored`）→ 判层 STATE_WRITE（幂等失效）；若为 `duplicate_ignored` 但 UI 重复反馈 → 判层 UI_PRESENTATION；
- Q9/Q10：两次 `response.sent.output_summary` 对比 + 上述证据收敛判层。

**Case 020（Band 泄漏红线，S1）**：
- Q1~Q3：输入/状态正常（排除前置层）；
- Q4：`llm.attempt.prompt_key/prompt_version` 确认"禁给分"指令版本在位 → 排除 PROMPT 指令缺失（若版本不含该指令则判 PROMPT）；
- Q5：`raw_output` 全量保存（质量门触发场景）→ 证据显示模型输出了 "Band 6"；
- Q6：`validation.result(validator=gate:ieltsAlignmentCheck)` 的 `band_leakage_flag` 与 `outcome`——若 `fail` 且响应仍带分 → 门未拦；若 `pass` → 门本身漏判；两者皆归 OUTPUT_VALIDATION；
- Q7~Q10：`final_response_redacted` + `response.sent` 完成 Q9；判层 OUTPUT_VALIDATION。

其余 7 个高价值 Case（013/019/023/030/031/038/039）按同法走查，每问均能落到 §1.6 的字段——无悬空问题。

---

## 6. M2 Acceptance Criteria（未来 M2 Implementation 的验收标准）

### 6.1 七条硬性 AC（每条附验收断言）

**AC-1 同一次用户请求可完整关联**

一个 trace_id 下：事件 `seq` 连续无空洞；首事件 = `request.received`，末事件 = `response.sent`；事件集合与 §1.3 端点期望节点集一致（结构性缺席的节点零出现，期望节点缺席 = 埋点 Bug 报警）。验收方式：Contract 校验器跑全部端点 × 正常/异常路径，`expected_node_missing` 计数 = 0。

**AC-2 Model / Prompt version 可追踪**

每次 `llm.attempt` 均有 provider / model_name / tier / prompt_key / prompt_version（whisper 端点允许 prompt 字段 null）。可按 `prompt_version` 聚合查询近期 pass/fail 分布（Debug Console D 区）。验收方式：任取 10 个含 LLM 调用的 trace，字段非空率 100%（whisper 除外）。

**AC-3 Retrieval 可追踪**

`retrieval.executed` 含 query_raw / query_normalized / knowledge_object_ids / knowledge_injected_count；ids 空数组时 miss 显式化。验收方式：Case 022（命中）与 024（miss）各跑一次，事件字段完整且语义正确。

**AC-4 Fallback 可追踪**

`fallback.triggered.chain_snapshot` 覆盖全部降级形态（provider 切换 / repair / fallbackJudge / 规则引擎 / null_summary），每环节 status ∈ {used, skipped, unavailable}；`degradation_flag` 三处一致（事件 / trace 头 / response.sent.fallback_used_flag）。验收方式：Case 031/036/021 各跑一次，链快照无解释空白。

**AC-5 State Before / After 可追踪**

写路径 `state.write` 含 state_before/after（changed-fields diff + canonical hash）、next_review_at_before/after（复习链）、idempotency_outcome。验收方式：Case 011（四分支表驱动）与 037（重复提交）断言 diff 正确、重复提交第二 trace 的 outcome=duplicate_ignored。

**AC-6 trace_id 不承担业务逻辑（Regression Guard）**

`M1_PRECONDITION_STATUS: SATISFIED`——M1 Final 已落地正式幂等契约，本条前置条件满足。当前正式 Contract：

- `client_event_id` = **业务幂等 identity**（唯一判重键）；
- `CreateLearningEventResult.created` = **Repository 是否首次创建事件的显式结果**（幂等判定的唯一权威语义来源）；
- `trace_id` = **observability only**（仅观测与关联，不参与任何业务分支）。

V1 曾登记的反例（M1 closeout 用 `event.traceId !== traceId` 判重）**已在 M1 Final 修复**，不再是待修正项。AC-6 保留为 **Regression Guard**：关闭全部 Trace 采集（环境开关）后，**业务行为必须完全不变**（幂等、调度、判题、报告零变化）。验收方式：trace 开 / 关两种配置下各跑全量回归测试，结果集逐字节一致。

**AC-7 Debug Console 可按 trace 查询**

输入 trace_id 后 ≤2s 返回：Trace 头摘要（A 区）+ 完整事件瀑布（B 区，含期望节点对照）+ 判层面板（C 区 12 项检查）+ 关联 trace 列表（D 区）。验收方式：任取 Registry 中已登记 Bad Case 的 trace_id，按 §4.3 的 2 分钟路径走查，判层结论与 Registry 记录一致。

### 6.2 Diagnosability 检查单（V1 验收保留，与 6.1 互补）

- [ ] 十问映射完备：Q1–Q10 每问映射到具体 `event_type.字段`，无空缺；
- [ ] 9 个高价值 Case（013/019/020/023/030/031/037/038/039）各有十问走查记录（§5.3 抽样 2 个，其余 7 个同法核对通过）；
- [ ] 无缺口：39 Case 的 `required_trace_fields` ⊆ Contract 字段集（§1.7 充分性声明）；
- [ ] 无冗余：每个 MUST 字段至少被一个 Case 消费；每个 DELETE/降级都有推导路径或成本依据（clock_snapshot 删除、model_version 降级等）；
- [ ] 隐私禁项可执行：§3.1 NEVER 清单逐条评审，无字段定义与之冲突；
- [ ] 成本上限明确：payload 4KB / raw 按需全量 / 保留期 30d+90d 写入 Contract；
- [ ] 判层枚举对齐：事件 `layer` = ELS_EVALUATION_V1_1 的 13 层一字不差；`STT`/`IDEMPOTENCY` proposed 层的过渡记法（暂记 MODEL / STATE_WRITE）在 §1.6/§5.3 有说明。

### 6.3 边界声明（V2.1 按冻结路线图修正）

项目路线冻结为：**M0 Audit → M1 Single Source of Truth → M2 Observability → M3 Evaluation + Bad Case → M4 Evidence-driven AI Upgrade**。

**本 Contract 是 M2 的 Design 产物，且仅是 M2 的一半。** 以下能力属 **M2 Implementation，不得推迟到 M3**：

- instrumentation（§1.6 十种事件 + §1.7 字段级六要素的埋点接线）；
- Trace persistence / query（Trace 头 + append-only 事件的落库与检索）；
- prompt / model version trace（AC-2）；
- retrieval trace（AC-3）；
- fallback trace（AC-4）；
- state before/after trace（AC-5）；
- Debug Console **minimal implementation**（AC-7：按 trace_id 查询 + 五区信息架构的最小可用版）。

**M2 完成条件 = Design（本 Contract）+ Implementation（上述七项）+ Verification（§6.1 七条 AC 逐条验收断言全部通过 + §6.2 检查单）**。三者缺一，M2 状态不得标 PASS。

**M3 才开始**：基于 Trace 大规模运行 ELS Evaluation 39 Case 与 Bad Case Registry 闭环（`root_cause_trace` 字段格式 = `trace_id` + 判层结论，§4.4 规则产出）。M3 不承担任何埋点/存储/Console 实现义务。

**明确不属 M2**（反目标保留）：实时监控大盘、告警、APM、生产级大数据平台。

---

## 附：Contract 冻结声明

冻结物：Trace/TraceEvent 双层结构（§1.4/§1.5）、10 种事件类型及 payload 契约（§1.6）、字段级六要素契约（§1.7）、Event Model 选型 C 及其依据（§2）、隐私五级政策与成本五条规则（§3）、Debug Console 信息架构与判层规则（§4）、逐类 Evaluation Mapping 与可判性三级分级（§5）、七条硬性 AC + Diagnosability 检查单（§6）。
V2.2 冻结澄清（不改变 V2.1 任何设计，仅枚举对齐）：① 10 种 event_type 的 `layer` 全部 ∈ 13 层 Failure Taxonomy，`response.sent.layer = UI_PRESENTATION`、`report.aggregated.layer = REPORT_AGGREGATION`；② 复习队列端点 = `POST /api/review/session`（`mode=DUE`）；③ Speaking Quality Gate = 四项 `schemaCheck / evidenceConsistencyCheck / actionabilityCheck / ieltsAlignmentCheck`，`quality_gate_scores` 必须表达全部四项，`ieltsAlignmentCheck` 即 Band leakage detection。
未冻结（随 M2 Implementation 一并落地，字段名以本文档为准）：存储后端选型、埋点接线实现、trace 采样率实现、Contract 自身的 Zod schema。
变更程序：任何字段级变更必须先过 ELS_EVALUATION_V1_1 的 39 Case 覆盖矩阵回归核对，再更新本文件版本号。

---

## M2_DESIGN_STATUS: PASS

> 说明：本状态代表「M2 Observability Contract V2.2」设计定稿并通过自检——39 Case 的 required_trace_fields 逐字段核对无缺口（§1.7 充分性声明）；十问 RCA 框架每问映射到具体事件字段；Event Model 选型（Trace 头 + append-only 事件）经三方案四维对比确认；隐私五级政策与成本硬上限明确；Debug Console 信息架构满足 2 分钟判层目标；可判性三级分级诚实标注 29 A / 7 B / 3 C 的自动化边界，Goal 措辞与该分级严格一致；幂等事实已对齐 M1 Final（`client_event_id` = 业务幂等 / `CreateLearningEventResult.created` = Repository 显式结果 / `trace_id` = observability only，`M1_PRECONDITION_STATUS: SATISFIED`，AC-6 转为 Regression Guard）；里程碑边界已按冻结路线图恢复（M2 完成条件 = Design + Implementation + Verification）。V2.2 一致性清扫四项全部落地并通过全文机械扫描（`docs/tools/m2_v2_2_sweep_check.py`）：非法 Failure Layer = 0（`response.sent.layer = UI_PRESENTATION`）、虚构旧复习端点写法 = 0（真实端点 `/api/review/session mode=DUE`）、旧门数计数表述 = 0（四项质量门，`quality_gate_scores` 表达全部四项）、recall_level 契约冲突当前态 = 0（已冻结 0–2 mastery，残留提及均带历史标记）、runtime auto-failover 已实现暗示 = 0（Repository abstraction 仅结构基础，无运行时自动故障转移）。设计层面零业务代码修改。
>
> **注意**：本 PASS 仅覆盖 Design。M2 整体完成另需 §6.3 所列七项 Implementation 落地并通过 §6.1 全部验收断言。
