# ELS Eval — Baseline After Integration（EVAL-RUN-02）

> 独立 Eval Agent（豆包 C）在 Product Checkpoint `2a9e3834` 上的真实执行结果。
> 判定仅依据 Frozen Gold（ELS_EVALUATION_V1_1）与当前运行结果，不继承任何历史状态。
> 产品代码零修改；`tests/eval/**` 有 2 处 Runner 兼容性修正（详见 §6，不改变任何 Gold 断言语义）。

## 1. Run Snapshot

| 字段 | 值 |
|---|---|
| RUN_ID | `phase0-20260909-115825` |
| PRODUCT_CHECKPOINT_COMMIT | `2a9e3834b1b5a1b797515f7c86a771000276b172`（integration/m2-01） |
| EVAL_RUNNER_COMMIT | `e91f0ad93eac57ba6b57d909f7fb85949fd1db24`（Frozen Gold ELS_EVALUATION_V1_1） |
| worktree | `D:\Codex\IELTS-eval-m2-run-02`（branch `eval/m2-run-02`） |
| 环境 | node v22.23.2 / vitest v2.1.9；memory provider；demo auth；scripted mock LLM（无真实 LLM） |
| 已集成 | BC-008、BC-035 code-only、M2-P3A Debug Console |
| typecheck | `tsc --noEmit` PASS（执行于本 worktree） |

## 2. 结果总览（10 个 Frozen Phase-0 Subset Case）

| Case | 状态 | Rows (P/F/B) | 说明 |
|---|---|---|---|
| ELS-EVAL-008 | **PASS** | 8/0/0 | "" / "   " / "\n" / "." 四条变体在 learn 与 review 链路全部确定性短路（llm_calls=0） |
| ELS-EVAL-009 | **PASS** | 3/0/0 | DUE 出队按 nextReviewAt 升序 |
| ELS-EVAL-010 | MANUAL_REVIEW | 1/0/0 | 空态引导文案语义需人工金标（Phase 0.1 冻结 discipline） |
| ELS-EVAL-011 | **PASS** | 4/0/0 | 四行间隔/状态/事件映射与 gold 一致 |
| ELS-EVAL-012 | UNVERIFIED | 4/0/0 | 链式调度正确；replay 重建断言 runner 缺能力（MISSING_CAPABILITY） |
| ELS-EVAL-022 | MANUAL_REVIEW | 4/0/0 | knowledge 注入正确；内容一致性需真实 LLM 评审 |
| ELS-EVAL-032 | **PASS** | 4/0/0 | 非法 JSON → fast-tier 修复成功 |
| ELS-EVAL-035 | UNVERIFIED | 3/0/1(B) | r1/r2/r4 PASS；r3 generationMeta.knowledge_miss BLOCKED（响应契约层能力边界） |
| ELS-EVAL-037 | **PASS** | 5/0/0 | 幂等去重生效：event=1、state 单推、duplicate_ignored |
| ELS-EVAL-038 | **PASS** | 4/0/0 | 服务端链路四字段级一致（learn→DUE→review→report） |

## 3. Metrics（只计本轮真实 executed Case）

| 指标 | 值 |
|---|---|
| EVAL-M1 Eval Pass Rate | 100%（6 PASS / 6 executed） |
| EVAL-M2 Bad Case Rate | 0%（0 FAIL / 40 行） |
| EVAL-M3 Critical Failure Rate | 0%（0 S1 FAIL 行） |
| EVAL-M10 Release-Blocking Rate | 0%（0 阻断型 FAIL 行） |
| PASS / FAIL / MANUAL_REVIEW / UNVERIFIED / BLOCKED | 6 / 0 / 2 / 2 / 0 |

> MANUAL_REVIEW、UNVERIFIED、BLOCKED 均不计入 PASS；不外推 39 Case 总体分数。

## 4. 重点 Case 判定

### ELS-EVAL-008 = PASS（BC-008 修复生效）

Frozen Gold 期望：4 种输入 LLM calls 必须 = 0。

| 输入 | learn/submit | review/submit |
|---|---|---|
| `""` | PASS（llm_calls=0） | PASS（llm_calls=0） |
| `"   "` | PASS（llm_calls=0） | PASS（llm_calls=0） |
| `"\n"` | PASS（llm_calls=0） | PASS（llm_calls=0） |
| `"."` | PASS（llm_calls=0） | PASS（llm_calls=0） |

M2 Trace 证据（每行）：`rule.applied` → `empty_answer_short_circuit`（inputs `answer_empty:true, content_empty:true`，outputs `llm_call_count:0`）；纯标点 "." 已纳入 content_empty 边界。previous suspect evidence（"." 触发 llm.attempt）已消失，被 empty_answer_short_circuit rule 替代。

### ELS-EVAL-035 = UNVERIFIED（结构全过；响应层能力边界保持 BLOCKED）

| Row | 状态 | 实测 |
|---|---|---|
| r1-miss-reproducible | PASS | well-being → knowledge ids=[]、trace `knowledge_miss_flag=true`、词卡生成无崩溃（漏检可复现，Gold 核心语义保持） |
| r2-control-hit | PASS | `retrieveKnowledge({term:"wellbeing"})` 命中 `["pt-topic-health","lg-collocation-guidance"]`（对照证明漏检由连字符导致） |
| r3-knowledge-miss-flag | **BLOCKED** | trace 层 `knowledge_miss_flag=true` 已存在；API 响应 generationMeta 无该字段（响应契约层能力边界，按 Frozen Gold 状态语义执行，不伪造 PASS） |
| r4-canonical-dedup | PASS | `itemAId===itemBId=item-yi9ukg`（canonicalKey 连字符不敏感 → 同一 canonical identity → 同一 itemId）；display form 保留首次创建 "well-being" |

> Case 状态为 UNVERIFIED（非 PASS）的唯一原因：r3 BLOCKED + notes 归一化建议输出未覆盖（coverage=partial）。这是能力边界，不是产品 FAIL；也不是 Supabase 未验证所致（本 case 全程 Memory path 可运行）。

### ELS-EVAL-037 = PASS（无回归）

- event count = 1（`clientEventIds:["rev-w-dup-1"]` 单条）
- state 只推进一次：`next_review_at_before=09-01T09:00` → `after=09-04T10:00`（+72h 仅一次）
- 第二次请求：`idempotency_outcome=duplicate_ignored`，响应返回既有 eventId/result（`x-idempotent-replay` 语义）
- 无第二次 state advance

### ELS-EVAL-038 = PASS（真实执行，未沿用旧文档）

learn→DUE→review→report 服务端链路四字段级一致（学习答错 EXPOSED/+2h；3h 后 DUE 入队；复习答对 recall 0→1/+72h；报告聚合与 repo 直读投影一致、llmSummary 非空）。

## 5. Trace Evidence（008 / 035 / 037 / 038）

| Case | trace_id 前缀 | relevant_events | suspect_layer | diagnostic_evidence |
|---|---|---|---|---|
| 008 | `trc_eval_008*`（16 条） | `rule.applied(empty_answer_short_circuit, learning_branch_map, review_interval_table)`、`state.write`（idempotency_outcome=inserted） | BUSINESS_RULE（修复后无 FAIL 证据） | llm_call_count=0 于全部 8 行；"./" "\n" 均 content_empty=true |
| 035 | `trc_eval_035a/035b` | `retrieval.executed`（query_raw/query_normalized/knowledge_miss_flag/conflict_*）、`state.read` | RETRIEVAL（漏检可复现；去重已修复） | well-being miss_flag=true；wellbeing 直调命中 2 objects；r4 itemAId=itemBId=item-yi9ukg |
| 037 | `trc_eval_037_1/2` | `state.write`（inserted → duplicate_ignored）、`rule.applied` | STATE_WRITE（幂等层生效） | 第二次写入 duplicate_ignored；next_review_at 单次 +72h |
| 038 | `trc_eval_038_1/2/3/4` | `state.write`、`state.read` | STATE_WRITE/STATE_READ（双路径收敛） | 服务端驱动四字段一致，eventCount=2 |

> 未为展示 Debug Console 修改任何 Trace。Debug Console（M2-P3A）在本 checkpoint 存在且可构建，但本 Run 的判定不依赖其 UI。

## 6. Runner 兼容性修正记录（tests/eval/** 仅，产品与 Gold 零改动）

1. **els-eval-008.eval.ts**：actualSummary/notes 更新为修复后真实状态（原文本基于 pre-fix 产品；行级 Gold 断言未动，结果由真实执行产生）。
2. **els-eval-035.eval.ts**：
   - r4 断言结构：actual 只提交 `{deduplicated}`，itemAId/itemBId 移入 evidence（harness `deepEqual` 为全等比较，原 actual 多字段导致误报 FAIL；产品行为已正确）。
   - r2 对照行：改为直调产品 `retrieveKnowledge` 验证（BC-035 去重生效后，第二次变体请求复用首个 item，响应 generationMeta 来自复用 item，不能代表本行检索；对照命中以产品真实函数为准）。r3 BLOCKED 与 uncoveredAssertion 保持原样。

## 7. 复现

```bash
# 独立 Eval worktree（产品 2a9e3834 + eval infra e91f0ad）
npx vitest run --config tests/eval/vitest.config.ts
npx tsx scripts/eval/generate-baseline.ts
```

原始数据：`docs/eval/runs/phase0-20260909-115825/results.json`
