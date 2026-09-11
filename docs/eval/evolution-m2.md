# ELS Eval — Evolution（M2 Integration）

> 三个时间点：**A. PRE-M1 HISTORICAL**（run `phase0-20260909-055233`，commit `53f1b774`）→
> **B. CURRENT BEFORE FIX**（run `phase0-20260909-072521`，commit `3a65afc`）→
> **C. AFTER INTEGRATION**（run `phase0-20260909-115825`，commit `2a9e3834`，EVAL-RUN-02）。
> 分类：FIXED / UNCHANGED_FAIL / REGRESSION / UNCHANGED_PASS / MANUAL / UNVERIFIED。

## 1. Case 演变表

| Case | A. PRE-M1 | B. Before Fix | C. After Integration | 分类 |
|---|---|---|---|---|
| ELS-EVAL-008 | FAIL | FAIL | **PASS** | FIXED（BC-008） |
| ELS-EVAL-009 | PASS | PASS | PASS | UNCHANGED_PASS |
| ELS-EVAL-010 | UNVERIFIED | MANUAL_REVIEW | MANUAL_REVIEW | UNCHANGED（Phase 0.1 discipline：MANUAL_REVIEW） |
| ELS-EVAL-011 | PASS | PASS | PASS | UNCHANGED_PASS |
| ELS-EVAL-012 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNCHANGED（runner 缺 replay 重建能力） |
| ELS-EVAL-022 | UNVERIFIED | MANUAL_REVIEW | MANUAL_REVIEW | UNCHANGED（Phase 0.1 discipline） |
| ELS-EVAL-032 | PASS | PASS | PASS | UNCHANGED_PASS |
| ELS-EVAL-035 | FAIL | FAIL | **UNVERIFIED**（r1/r2/r4 PASS，r3 BLOCKED） | FIXED（BC-035 code-only，结构部分） |
| ELS-EVAL-037 | FAIL | PASS | PASS | FIXED（M1，B 点已修复） |
| ELS-EVAL-038 | UNVERIFIED | PASS | PASS | FIXED（M2 Phase 1/2，B 点已修复） |

## 2. 关键指标对比

| 指标 | A. PRE-M1 | B. Before Fix | C. After Integration |
|---|---|---|---|
| PASS | 5 | 5 | **6** |
| FAIL | 2（008, 035, 037=3） | 2（008, 035） | **0** |
| MANUAL_REVIEW | 0 | 2 | 2 |
| UNVERIFIED | 3 | 1 | 2 |
| BLOCKED | 0 | 0 | 0 |
| EVAL-M1 Pass Rate | 62.5%（5/8 executed） | 71.4%（5/7） | **100%（6/6）** |
| 行级 FAIL | 7 | 3 | **0** |

> A 点 FAIL 3 个（008/035/037）；B 点 037 已被 M1 修复（FAIL→PASS，分类 FIXED at B）；C 点 008（BC-008）与 035（BC-035 code-only）结构断言修复。A→B→C 无 REGRESSION（无 UNCHANGED_FAIL 残留）。

## 3. 重点 Case 演进

### ELS-EVAL-008：FAIL → FAIL → PASS（FIXED）

- A/B："" / "   " / "\n" 短路正确，但纯标点 "." 穿透 judgeAnswerWithLlm（llm_calls=1），8 行中 6 行通过。
- C（BC-008 合入）：4 变体 × 2 链路全部 `empty_answer_short_circuit` 触发、`llm_call_count=0`。前序 suspect 证据（llm.attempt 计数=1）消失，被 rule.applied 替代。

### ELS-EVAL-035：FAIL → FAIL → UNVERIFIED（FIXED，结构部分）

- A/B：漏检可复现（r1 PASS）；"wellbeing" 对照命中（r2 PASS）；generationMeta 无 knowledge_miss（r3 BLOCKED）；两张卡不同 itemId（r4 FAIL，Bad Case）。
- C（BC-035 code-only 合入）：canonicalKey 连字符不敏感 → r4 `itemAId===itemBId=item-yi9ukg`（deduplicated=true，PASS）；r2 修正为直调 retrieveKnowledge（命中 pt-topic-health + lg-collocation-guidance，PASS）；r1 漏检可复现保持（PASS）；r3 保持 BLOCKED（响应契约层能力边界，按 Frozen Gold 状态语义执行）。
- 剩余能力缺口（不是产品 FAIL）：generationMeta.knowledge_miss 响应字段（BLOCKED）；知识库检索路径连字符规范化（well-being → 命中 pt-topic-health，P0-4 检索升级）；notes 归一化建议输出。

### ELS-EVAL-037：FAIL → PASS → PASS（FIXED at M1，无回归）

- A：重复提交导致双推（state 推进 2 次、event 2 条）。
- B/C：M1 幂等跳过生效——event=1、state 单推、`duplicate_ignored`、响应返回既有 eventId/result；C 点复核 5/5 行 PASS。

### ELS-EVAL-038：UNVERIFIED → PASS → PASS（FIXED at M2 Phase 1/2，无回归）

- A：仅部分覆盖（UNVERIFIED）。
- B/C：服务端链路四字段级一致；C 点复核 4/4 行 PASS（未沿用旧文档，真实执行）。

## 4. Trace Evidence 摘要（C 点）

| Case | trace 证据要点 | suspect_layer |
|---|---|---|
| 008 | 8× `rule.applied(empty_answer_short_circuit)`，llm_call_count=0；state.write inserted | BUSINESS_RULE（已修复） |
| 035 | `retrieval.executed`：well-being miss_flag=true / wellbeing 直调命中 2 objects；r4 itemAId===itemBId | RETRIEVAL（去重已修复；miss 可复现保留） |
| 037 | 第二次 `state.write.idempotency_outcome=duplicate_ignored`；nextReviewAt 单次推进 | STATE_WRITE（幂等生效） |
| 038 | learn→DUE→review→report 服务端驱动一致 | STATE_WRITE/READ（已收敛） |

## 5. 判定口径说明

- BLOCKED 仅用于 Eval Infrastructure / 明确能力边界（035 r3），未用于隐藏任何产品 FAIL。
- 012 UNVERIFIED 明确标注 `MISSING_CAPABILITY`（runner 无 replay==snapshot 重建能力，非产品缺陷）。
- MANUAL_REVIEW（010/022）保持 Phase 0.1 冻结 discipline，不写 PASS。
- 本表只覆盖 Phase-0 subset 10 个 case，不外推 39 Case 总体分数。
