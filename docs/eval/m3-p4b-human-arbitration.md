# M3-P4B — Human Arbitration Recording

- TASK: `M3-P4B`（HUMAN_ARBITRATION_RECORDING）
- PRODUCT_CHECKPOINT: `f117d85fe2916ecd8dca568aa1d75c536d3c4d4b`
- EVAL_BASE: `9d6371d`；EVAL_COMMIT: 见本轮 git commit（提交信息 m3-p4b）
- SOURCE_RUN: `m3-20260910-094159`
- 本轮不重新做人工判断；以下 Human Decision 已由产品负责人明确给出并冻结记录。

## 1. Human Decisions（冻结）

| CASE_ID | Decision | Severity | Rationale（冻结不改写） |
|---|---|---|---|
| ELS-EVAL-006 | **PASS** | — | 产品负责人明确判定 PASS |
| ELS-EVAL-016 | **PASS** | — | 产品负责人明确判定 PASS |
| ELS-EVAL-018 | **PASS** | — | 产品负责人明确判定 PASS |
| ELS-EVAL-019 | **FAIL** | **S1** | 用户原始回答 “I like books. Reading is fun. I read often.” 不存在：which 定语从句 / 多个复合句 / 形容词比较级 / 被动语态。但产品最终反馈明确声称存在以上语言现象，且现有 evidence 已证明这些文本沿 speaking-feedback UI 渲染路径直接对用户可见。因此：命中 Frozen Gold “幻觉证据直达 UI” 红线。 |

## 2. Case Status 汇总

### 2.1 AUTO_ADJUDICATED_RESULT（source run m3-20260910-094159，纯自动裁决）

| 指标 | 值 |
|---|---|
| AUTO_ADJUDICATED（PASS+FAIL） | 31 |
| PASS（自动） | 30 |
| FAIL（自动） | 1（030） |
| MANUAL_REVIEW（等人工，P4B 前） | 4（006/016/018/019） |
| UNVERIFIED | 4（020/023/025/035） |
| BLOCKED / NOT_RUN | 0 / 0 |

### 2.2 FINAL_CASE_STATUS_AFTER_HUMAN_ARBITRATION（M3-P4B 后）

| 指标 | 值 |
|---|---|
| TOTAL_GOLD_CASES | 39 |
| FINAL_PASS | **33**（30 自动 + 006/016/018 人工 PASS） |
| FINAL_FAIL | **2**（019 人工 FAIL(S1)、030 自动 FAIL） |
| FINAL_UNVERIFIED | **4**（020/023/025/035） |
| FINAL_MANUAL_REVIEW | **0** |
| BLOCKED / NOT_RUN | 0 / 0 |
| 账目校验 | 33 + 2 + 4 + 0 + 0 + 0 = **39 ✓** |

**注意**：Human PASS（006/016/018）不计入 AUTO_ADJUDICATED PASS；两组口径分别输出，不以人工结果冒充自动裁决。

## 3. Bad Case Registry

| Bad Case | Case | Severity | Status | 来源 | 说明 |
|---|---|---|---|---|---|
| BC-M3-004（新建） | ELS-EVAL-019 | S1 | OPEN | run m3-20260910-094159 + 人工仲裁 | hallucinated linguistic evidence reaches UI（OUTPUT_VALIDATION / UI_PRESENTATION） |
| BC-M3-003（保持不变） | ELS-EVAL-030 | S1 | OPEN | run m3-20260910-094159 + E2E | CompareSection 编造 Δ（UI / REPORT）；未重复登记 |
| BC-M3-001 | ELS-EVAL-026 | S2 | VERIFIED_CLOSED | — | 保持不变 |
| BC-M3-002 | ELS-EVAL-033 | S2 | VERIFIED_CLOSED | — | 保持不变 |

## 4. Existing Closed / Verified

- 026：VERIFIED_CLOSED（不变）
- 033：VERIFIED_CLOSED（不变）
- 034：PASS / CAPABILITY_VERIFIED（不变）

## 5. Verification

| 项 | 结果 |
|---|---|
| registry schema validation | PASS（15-field + lifecycle 合法；BC-M3-004 字段齐全） |
| 39-case status accounting | 33 + 2 + 4 = 39 ✓；MANUAL_REVIEW = 0 ✓ |
| git diff f117d85 -- app components lib supabase | **空（产品零修改）** |

## 6. Next Gate

**PRODUCT_BAD_CASE_FIXES**：当前 OPEN 的 S1 Bad Case 为 BC-M3-003（030 CompareSection 编造 Δ）与 BC-M3-004（019 幻觉证据直达 UI）。下一阶段为产品侧修复（Eval 侧禁止修产品），修复后按冻结生命周期推进回归（连续 3 轮独立 run PASS → VERIFIED_CLOSED）。
