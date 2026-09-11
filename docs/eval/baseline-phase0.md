# ELS Eval Runner — Phase 0 Baseline

> Deterministic Phase-0 subset: 6/10（另有 4 个 UNVERIFIED、0 个 BLOCKED 不计入判定；spec 全集 39 cases，本 baseline 不推算总分）

## Run Snapshot

| 字段 | 值 |
|---|---|
| run_id | `phase0-20260909-055233` |
| spec | ELS_EVALUATION_V1_1 v1.1（case_set ELS-EVAL-V1.1） |
| git | `53f1b774` @ `feature/eval-runner-phase0`（dirty） |
| worktree | `D:\Codex\ielts-eval-runner` |
| node / vitest | v22.22.2 / v2.1.9 |
| data provider | memory（memory 实现，非 Supabase） |
| auth | demo（demo user） |
| llm | scripted mock（mock，无真实 LLM 调用） |
| started_at | 2026-09-09T05:52:36.096Z |

## 结果总览

| 状态 | 数量（case 级） |
|---|---|
| 执行（PASS+FAIL） | 6 |
| ✅ PASS | 3 |
| ❌ FAIL | 3 |
| ◐ UNVERIFIED（覆盖不完整，不当 PASS） | 4 |
| ⛔ BLOCKED（含基础设施/缺能力） | 0 |
| SKIPPED | 0 |

## Metrics（§3 口径）

| 指标 | 定义 | 值 |
|---|---|---|
| M1 Eval Pass Rate | case 级 PASS / (PASS+FAIL) | 50% |
| M2 Bad Case Rate | 行级 FAIL / 已执行行 | 15% |
| M3 Critical Failure Rate | S1 FAIL 行 / 已执行行 | 7.5% |
| M10 Release-Blocking Rate | (S1 + 阻断型 S2) FAIL 行 / 已执行行 | 7.5% |

> 行级分母：已执行 40 行（PASS 34 / FAIL 6）。
> Phase 0 阻断型 S2 Registry 为空（size=0）→ **M10 == M3**。
> SKIPPED / UNVERIFIED / BLOCKED 均不计入任何分母，不允许被当 PASS。

## Case 明细

| Case | Category | 状态 | Severity | Failure Layer | Rows (P/F) | 延迟 ms | Spec current_expected |
|---|---|---|---|---|---|---|---|
| ELS-EVAL-008 | ANSWER_JUDGEMENT | ❌ FAIL | S3 | BUSINESS_RULE | 6/2 | 50.7 | PASS |
| ELS-EVAL-009 | REVIEW_SCHEDULING | ✅ PASS | S2 | STATE_READ | 3/0 | 29.65 | PASS |
| ELS-EVAL-010 | REVIEW_SCHEDULING | ◐ UNVERIFIED | S2 | STATE_READ | 1/0 | 3.55 | PASS |
| ELS-EVAL-011 | REVIEW_SCHEDULING | ✅ PASS | S2 | BUSINESS_RULE | 4/0 | 6.08 | PASS |
| ELS-EVAL-012 | REVIEW_SCHEDULING | ◐ UNVERIFIED | S2 | BUSINESS_RULE | 4/0 | 5.76 | PASS |
| ELS-EVAL-022 | RETRIEVAL_KNOWLEDGE | ◐ UNVERIFIED | S2 | RETRIEVAL | 4/0 | 7.15 | PASS |
| ELS-EVAL-032 | FALLBACK_FAILURE | ✅ PASS | S3 | FALLBACK | 4/0 | 3.16 | PASS |
| ELS-EVAL-035 | FALLBACK_FAILURE | ❌ FAIL | S3 | RETRIEVAL | 2/1 (+1B) | 4.89 | PASS |
| ELS-EVAL-037 | CROSS_MODULE_STATE | ❌ FAIL | S1 | STATE_WRITE | 2/3 | 4.95 | PASS |
| ELS-EVAL-038 | CROSS_MODULE_STATE | ◐ UNVERIFIED | S1 | STATE_WRITE | 4/0 | 7.18 | FAIL |

## 发现的 Bad Case（只记录，不修复）

#### ELS-EVAL-008（S3 · BUSINESS_RULE）

- 实况：8 行中 6 行通过；"."（纯标点）在 learn 与 review 两条链路均穿透 judgeAnswerWithLlm 触发 1 次 LLM 调用（llm_call_count=1），违反确定性短路 gold。
- 违反行：
  - `learn-punct` learn/submit answer="." → FAIL / EXPOSED / llm_calls=0 — expected={"httpStatus":200,"correctness":"FAIL","status":"EXPOSED","llmCalls":0,"eventCount":1,"eventCorrectness":"FAIL","nextReviewAt":"2026-09-01T12:00:00.000Z"} | actual={"httpStatus":200,"correctness":"FAIL","status":"EXPOSED","llmCalls":1,"eventCount":1,"eventCorrectness":"FAIL","nextReviewAt":"2026-09-01T12:00:00.000Z"}
  - `review-punct` review/submit answer="." → INCORRECT / llm_calls=0 — expected={"httpStatus":200,"result":"INCORRECT","llmCalls":0,"eventCount":1,"eventCorrectness":"FAIL","nextReviewAt":"2026-09-01T14:00:00.000Z"} | actual={"httpStatus":200,"result":"INCORRECT","llmCalls":1,"eventCount":1,"eventCorrectness":"FAIL","nextReviewAt":"2026-09-01T14:00:00.000Z"}
- 备注：Bad Case（只记录不修复）：judgeAnswerWithLlm 仅对 trim 后为空的答案短路，纯标点答案会进入 LLM。spec current_expected=PASS，实际 FAIL，属审计缺口。

#### ELS-EVAL-035（S3 · RETRIEVAL）

- 实况：漏检可复现（well-being → ids=[]），对照行 wellbeing 命中 pt-topic-health + lg-collocation-guidance；generationMeta 无 knowledge_miss 字段（BLOCKED）；两张卡无归一、itemId 不同（FAIL，Retrieval miss Bad Case）。
- 违反行：
  - `r4-canonical-dedup` "well-being" 与 "wellbeing" 应归一为同一 learning item（canonical 冲突去重） — expected={"deduplicated":true} | actual={"deduplicated":false,"itemAId":"item-yi9ukg","itemBId":"item-2ld3db"}
- 缺能力行（BLOCKED_BY_CAPABILITY）：
  - `r3-knowledge-miss-flag` generationMeta 记录 knowledge_miss 标记（HEAD GenerationMeta 无该字段）
- 备注：Bad Case 只记录不修复。normalizeTerm 连字符缺陷 + 缺 knowledge_miss 标记 + 缺归一化，均指向 P0-4 规范化升级与 M1 修复项。

#### ELS-EVAL-037（S1 · STATE_WRITE）

- 实况：事件去重生效（repo 层 clientEventId 唯一）；但 route 无幂等跳过：重放触发第二次判题 + 第二次状态推进（recallLevel 双推、nextReviewAt 以重放时刻重算），响应含第二次副作用 → S1 发布阻断。
- 违反行：
  - `r2-recall-level` recallLevel 仅按一次提交推进（1 → 2） — expected={"recallLevel":2} | actual={"recallLevel":3}
  - `r3-next-review-at` nextReviewAt 仅按一次提交推进（T0 + 72h） — expected={"nextReviewAt":"2026-09-04T10:00:00.000Z"} | actual={"nextReviewAt":"2026-09-04T10:03:20.000Z"}
  - `r4-idempotent-response` 第二次响应与首次结果一致（返回既有 eventId 与调度结果） — expected={"eventId":"evt-1788256800000-zzubxc","result":"CORRECT_INDEPENDENT","nextReviewAt":"2026-09-04T10:00:00.000Z"} | actual={"eventId":"evt-1788256800000-zzubxc","result":"CORRECT_INDEPENDENT","nextReviewAt":"2026-09-04T10:03:20.000Z"}
- 备注：Bad Case 只记录不修复。工作树另有未提交 M1 改动（createLearningEvent 返回 {event, created} 契约 + route 幂等跳过），合入后本 Case 需重跑验证转绿；SupabaseLearningRepository 路径未在 Phase 0（memory provider）覆盖。


## 未覆盖断言（依赖下一阶段能力）

- **M2 Trace**：trace 级 `llm_raw_output` / `repair_attempts` / `knowledge_object_ids` 等字段核验依赖 M2 Trace 基建；Phase 0 以 scripted provider 的调用记录等效覆盖 llm_call_count / tier / temperature。
- **真实 LLM 内容质量**：词卡/判题解释的内容一致性（022 等）需真实 LLM 或人工金标 → UNVERIFIED。
- **localStorage 收敛性（038）**：需浏览器环境。
- **Supabase 仓库路径（037）**：Phase 0 仅 memory provider。
- **未选入 subset 的 29 个 case**：含需真实 LLM / 浏览器 / M2 Trace 的场景，Phase 1+ 逐步接入。

## 复现

```bash
npm run eval:phase0   # vitest run --config tests/eval/vitest.config.ts && tsx scripts/eval/generate-baseline.ts
```

原始数据：`docs/eval/runs/phase0-20260909-055233/results.json`
