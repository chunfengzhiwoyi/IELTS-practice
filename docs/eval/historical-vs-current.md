# Eval Runner — Historical vs Current Baseline

> 对比对象：`PRE_M1_HISTORICAL_BASELINE`（旧运行，永久保留）vs CURRENT（checkpoint b0ff1bf = M1 Final + M2 Phase 1 + Phase 2）。
> 同一冻结 Gold：`ELS_EVALUATION_V1_1`（未修改）。每个 Case 均重新真实执行，未继承旧 run 状态。

## Run 对照

| 字段 | PRE_M1_HISTORICAL_BASELINE | CURRENT |
|---|---|---|
| run_id | `phase0-20260909-055233` | `phase0-20260909-072521` |
| product commit | `53f1b774`（pre-M1） | `b0ff1bf095e04e1b1d2ddc1ead502b9cb54f1f1f`（M1 + M2P1 + M2P2） |
| eval infra commit | `782a9e5` | `3a65afc`（compat patch：`_resetRepositories` + trace 证据 + MANUAL_REVIEW） |
| spec | ELS_EVALUATION_V1_1（同） | ELS_EVALUATION_V1_1（同，未修改） |
| 标记 | `pre-m1-historical-baseline` tag | — |
| EVAL-M1（case 级 PASS/(PASS+FAIL)） | 50%（3/6） | 71.43%（5/7） |
| EVAL-M2（行级 FAIL/已执行行） | 15%（6/40） | 7.5%（3/40） |
| EVAL-M3（S1 FAIL 行/已执行行） | 7.5%（3/40） | 0%（0/40） |
| EVAL-M10（Release-Blocking） | 7.5%（==M3，阻断 S2 为空） | 0%（==M3） |

> 行级分母：旧 40 行（PASS 34 / FAIL 6）；新 40 行（PASS 37 / FAIL 3）。MANUAL_REVIEW / UNVERIFIED / BLOCKED 不计入分母，不当 PASS。

## 状态迁移（10 case）

| Case | PRE_M1 | CURRENT | 分类 |
|---|---|---|---|
| ELS-EVAL-008 | ❌ FAIL（punct 触发 LLM） | ❌ FAIL（punct 触发 LLM） | **CURRENT_BAD_CASE**（UNCHANGED） |
| ELS-EVAL-009 | ✅ PASS | ✅ PASS | UNCHANGED |
| ELS-EVAL-010 | ◐ UNVERIFIED | 🔎 MANUAL_REVIEW | 状态精度改进（过程性） |
| ELS-EVAL-011 | ✅ PASS | ✅ PASS | UNCHANGED |
| ELS-EVAL-012 | ◐ UNVERIFIED | ◐ UNVERIFIED | **STILL_UNVERIFIED**（capability_missing） |
| ELS-EVAL-022 | ◐ UNVERIFIED | 🔎 MANUAL_REVIEW | 状态精度改进（过程性） |
| ELS-EVAL-032 | ✅ PASS | ✅ PASS | UNCHANGED |
| ELS-EVAL-035 | ❌ FAIL（归一失败+缺 knowledge_miss） | ❌ FAIL（去重失败 + r3 capability） | **CURRENT_BAD_CASE**（UNCHANGED） |
| ELS-EVAL-037 | ❌ FAIL（route 无幂等跳过 → 双推） | ✅ PASS | **FIXED_SINCE_HISTORICAL** |
| ELS-EVAL-038 | ◐ UNVERIFIED（localStorage leg 缺） | ✅ PASS | **FIXED_SINCE_HISTORICAL** |

## Case 明细

### ELS-EVAL-037 — FIXED_SINCE_HISTORICAL（S1，CROSS_MODULE_STATE）

| 维度 | PRE_M1 actual | CURRENT actual |
|---|---|---|
| event count | 1（repo 层去重已生效） | **1**（`evt-1788256800000-vieh9q` 两次响应同 eventId） |
| state advance | 2 次（route 无幂等跳过，recall 双推 1→3） | **1 次**（recall 1→2，trace1 `user_item_state` 仅一次写入） |
| nextReviewAt | 双推（以重放时刻重算） | **仅 +72h 一次**（09-01T09:00 → 09-04T10:00，自 T0 起算） |
| 第二次响应 | 含第二次副作用 | **与首次一致**（同 eventId/result/nextReviewAt，`x-idempotent-replay: true`） |
| M2 Trace（第二次） | 无 | `state.write.idempotency_outcome = "duplicate_ignored"`（learning_event，无第二次 user_item_state 写入） |
| r1–r5 断言 | 3 FAIL | **5/5 PASS** |

### ELS-EVAL-038 — FIXED_SINCE_HISTORICAL（S1，CROSS_MODULE_STATE）

- PRE_M1：UNVERIFIED（localStorage 收敛性 leg 缺失；服务端链路为 spec current_expected=FAIL 所指的双路径未收敛期）。
- CURRENT：**PASS（coverage full）**。V1.1 FIX-07 后 localStorage 已非必须 Gold leg，断言集 1–3 不依赖其存在性：
  - r1 learn/submit：api_result 与 server_state 字段级一致（EXPOSED / FAIL / +2h / recall=0）✅
  - r2 DUE 队列：3h 后到期词入队（服务端状态驱动，totalDue=1）✅
  - r3 review/submit：CORRECT_INDEPENDENT / recall 0→1 / +72h（自 T1）✅
  - r4 报告聚合：`report == repo 直读投影`（totalItems/reviewedCount/totalReviews/correctIndependent/llmSummary 非空）✅

### ELS-EVAL-008 — CURRENT_BAD_CASE（UNCHANGED，S3，ANSWER_JUDGEMENT）

| 输入 | PRE_M1 | CURRENT | 说明 |
|---|---|---|---|
| `""` / `"   "` / `"\n"` | PASS（llm=0） | PASS（llm=0） | M2 trace：`rule.applied(empty_answer_short_circuit)` 触发，`llm_call_count=0` |
| `"."`（纯标点） | FAIL（llm=1） | **FAIL（llm=1）** | trace：无 `empty_answer_short_circuit` 事件，`learning_branch_map` 记 `llm_call_count=1` |

- CURRENT Bad Case 登记（只记录不修复）：`judgeAnswerWithLlm` 仅对 trim 后为空短路，纯标点 `"."` 仍进入 LLM（learn 与 review 两条链路各 1 次）。
- M2 规则 `empty_answer_short_circuit` 已存在，但触发条件为 `answer.trim()===""`；`"."` 不满足 → 属于规则覆盖边界缺口，非 Trace 缺失。

### ELS-EVAL-035 — CURRENT_BAD_CASE（UNCHANGED，S3，RETRIEVAL）

| 维度 | 观测（CURRENT 实际运行） |
|---|---|
| query_raw / query_normalized | `"well-being"` → `"well-being"`（连字符未归一）；`"wellbeing"` → `"wellbeing"` |
| canonical / item identity | `item-yi9ukg` vs `item-2ld3db`（**两词两张卡，未归一**）→ r4 FAIL |
| knowledge_miss_flag | M2 trace `retrieval.executed.knowledge_miss_flag=true`（trace 层存在）；响应 `generationMeta` 无该字段 → r3 **BLOCKED（capability_missing）** |
| duplicate behavior | `deduplicated=false`（FAIL，CURRENT Bad Case） |
| conflict detection | `conflict_detected=false` / `conflict_resolution="capability_missing"`（按冻结能力边界记录，不伪造 PASS） |
| 对照行 | `"wellbeing"` 响应 generationMeta 命中 `pt-topic-health + lg-collocation-guidance`（Knowledge Layer 命中）；seed 目录无该词条（22 seeds） |

- 登记：normalizeTerm 不去连字符 + 无 canonical 去重 + 响应层无 knowledge_miss 字段，均不修复。

### ELS-EVAL-012 — STILL_UNVERIFIED（S2，REVIEW_SCHEDULING）

- 确定性断言全部通过（三轮 nextReviewAt 链式 72h/4h/72h、降档、事件数=3、终态 recall=2），但 coverage partial。
- **capability_missing（明确）**：`replay==snapshot` 状态快照与事件重放一致性断言依赖 Eval Runner 侧事件重放重建能力（产品已提供 events + state，runner 未实现重建）；重放幂等由 ELS-EVAL-037 单独承接。

### ELS-EVAL-010 / ELS-EVAL-022 — 状态精度改进（过程性，非产品变化）

- 010：deterministic API 断言自动通过（tasks=[]、totalDue=0）；空态 UI copy 需人工 → **MANUAL_REVIEW**（不再笼统 UNVERIFIED）。
- 022：structural retrieval 断言自动通过（mitigate → pt-topic-environment + lg-collocation-guidance，注入 2 ≤ 5，prompt 注入成功，词卡生成）；内容质量需人工 → **MANUAL_REVIEW**。

## 汇总

- **FIXED_SINCE_HISTORICAL**：ELS-EVAL-037（M1 route 幂等跳过）、ELS-EVAL-038（M1 Server SSOT 收敛）
- **CURRENT_BAD_CASE**（只记录不修复）：ELS-EVAL-008（纯标点触发 LLM）、ELS-EVAL-035（well-being/wellbeing 未归一 + 响应层无 knowledge_miss）
- **UNCHANGED**：ELS-EVAL-009 / 011 / 032（PASS→PASS）
- **NEW_REGRESSION**：无
- **STILL_UNVERIFIED**：ELS-EVAL-012（capability_missing：runner 无 replay 重建）
- **MANUAL_REVIEW**（过程性精度改进）：ELS-EVAL-010、ELS-EVAL-022

> 说明：metrics 统一使用 EVAL-M1…EVAL-M10 命名，与项目 milestone（M1/M2 Phase 1/2）无混淆；只基于真实执行 Case 计算；MANUAL_REVIEW / UNVERIFIED 不计 PASS；不推算 39 Case 总分。
