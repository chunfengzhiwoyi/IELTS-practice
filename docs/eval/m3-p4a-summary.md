# M3-P4A Summary — Evaluation Coverage Closure

- TASK: `M3-P4A`（EVALUATION_COVERAGE_CLOSURE）
- PRODUCT_CHECKPOINT: `f117d85fe2916ecd8dca568aa1d75c536d3c4d4b`
- EVAL_BASE: `0b3b6fa`；EVAL_COMMIT: `eb9ee439dd5cd180f9b23a9ae7c7d08e2cf5fae1`（提交信息 m3-p4a）
- RUN_ID: `m3-20260910-094159`（docs/eval/runs/m3-20260910-094159/results.json）
- 本轮不是人工终审、不是 Product Fix。006/016/018/019 保持 MANUAL_REVIEW 等 M3-P4B。

## 1. Metrics（统一口径，真实执行）

| 指标 | 值 |
|---|---|
| TOTAL_GOLD_CASES | 39 |
| REGISTERED | 39（39/39 进入 Registry） |
| AUTO_ADJUDICATED（PASS+FAIL） | 31 |
| PASS | 30 |
| FAIL | **1（ELS-EVAL-030）** |
| TRUE_MANUAL_REVIEW | 4（006 / 016 / 018 / 019） |
| UNVERIFIED | 4（020 / 023 / 025 / 035） |
| BLOCKED | 0 |
| NOT_RUN | 0 |

- 10 Case 回归基线（008/009/010/011/012/022/032/035/037/038）无漂移（有意的 P4A 重新分类已写入基线，见 §5）。
- 026 / 033（VERIFIED_CLOSED）保持 PASS；034（PASS）保持 PASS；008/013/037/038/039 无回归。
- NEW_REGRESSIONS：无。

## 2. 13 个 Non-PASS Case 审计结果（逐 Case 分类）

| CASE_ID | M3-03 状态 | P4A 分类 | P4A 状态 | 依据 |
|---|---|---|---|---|
| 006 | MANUAL_REVIEW | TRUE_MANUAL_GOLD | MANUAL_REVIEW | Frozen [H] 调度合理性抽检；自动链全 PASS，packet 完整 |
| 016 | MANUAL_REVIEW | TRUE_MANUAL_GOLD | MANUAL_REVIEW | Frozen [H] actionability 语义；gate 已拦截（total=20→rule），拦截策略留人工 |
| 018 | MANUAL_REVIEW | TRUE_MANUAL_GOLD | MANUAL_REVIEW | Frozen [H] 改善显著度抽检；自动行全 PASS |
| 019 | MANUAL_REVIEW | TRUE_MANUAL_GOLD（RED FLAG S1_CANDIDATE） | MANUAL_REVIEW | Frozen B/S1 人工仲裁；packet 强化：响应体含幻觉断言 + UI 直接渲染证据链完整；**排人工仲裁第一位** |
| 010 | MANUAL_REVIEW | AUTOMATION_GAP（闭环） | **PASS** | Playwright 最小 E2E：空态文案「今天暂时没有需要复习的内容」+ 引导链接 /learn 实测可达 |
| 012 | UNVERIFIED | AUTOMATION_GAP（闭环） | **PASS** | 复用 013 replay-harness：replay(events) == snapshot 逐字段 0 diff；r1-r4 继续 PASS |
| 017 | MANUAL_REVIEW | AUTOMATION_GAP（闭环） | **PASS** | Frozen 无 [H] 标记；pass_criteria 两条均可机械断言（r-llm-repetition / r-no-high-fluency），移除人工 uncovered |
| 022 | MANUAL_REVIEW | AUTOMATION_GAP（闭环） | **PASS** | 确定性内容一致性 judge（r5）：词卡与 pt-topic-environment / lg-collocation-guidance 对齐且无冲突 |
| 030 | MANUAL_REVIEW | AUTOMATION_GAP → 真实执行 | **FAIL** | Playwright E2E 实证 CompareSection 无上周基线时渲染「新收表达 1 → 0 ▲ 1」编造 Δ，未进空态 → Frozen pass 行 2 违反（S1 确定性红线）→ 登记 BC-M3-003（OPEN） |
| 020 | MANUAL_REVIEW | PRODUCT_CAPABILITY_GAP | UNVERIFIED | 红线行为 PASS（gate 检出 band + 规则回退、响应 band-free）；但 Frozen required_trace_fields（band_leakage_flag/analysis_path/final_response_redacted）未埋点 → 硬性缺口（候选 BC-020-R1） |
| 023 | MANUAL_REVIEW | PRODUCT_CAPABILITY_GAP | UNVERIFIED | safe-miss 行为 PASS（trace 层 flag / 生成成功 / 不污染）；但 generationMeta 缺 knowledge_miss 标记（Frozen pass 行 2 硬性要求，与 035 同根因，BC-035-R2 覆盖） |
| 025 | UNVERIFIED | PRODUCT_CAPABILITY_GAP（移除 2 处 RUNNER_OVERCONSTRAINT） | UNVERIFIED | r-documented / r-content-clean PASS；Frozen pass 行 1「precision warning」产品缺失（候选 BC-025-R1）；M2 事件与"误匹配是否缺陷"两项 overconstraint 已删 |
| 035 | UNVERIFIED | PRODUCT_CAPABILITY_GAP（LEGITIMATE） | UNVERIFIED | BC-035 canonical 修复保持 PASS（r1/r2/r4）；r3 由 BLOCKED 改为如实记录缺口：trace flag=true / generationMeta 字段=null → 候选 BC-035-R2 |

## 3. 本轮计数

- **AUTOMATION_GAPS_CLOSED = 5**：010（UI 空态 E2E）、012（replay 复用）、017（语义标记自动裁决）、022（确定性内容一致性）、030（前端 CompareSection E2E——执行后暴露真实 FAIL）
- **RUNNER_OVERCONSTRAINTS_FIXED = 3**：025×2（M2 检索事件非 required；子串误匹配无需人工金标）、017×1（人工抽检并非 Frozen 要求）
- **PRODUCT_CAPABILITY_GAPS_FOUND = 4**：020（band trace 埋点缺失，BC-020-R1 候选）、023+035（generationMeta.knowledge_miss，BC-035-R2 候选）、025（retrieval precision warning，BC-025-R1 候选）
- **NEW_PRODUCT_BAD_CASES = 1**：**BC-M3-003 / ELS-EVAL-030**（OPEN，S1，UI/REPORT，f117d85，run m3-20260910-094159）
- **NEW_REGRESSIONS = 0**

## 4. Product Boundary

- 产品代码零修改：`git diff f117d85 -- app components lib supabase` **为空**（见 §7 验证）。
- 允许修改范围仅 tests/eval/**、scripts/eval/**、docs/eval/**。

## 5. Runner Patches（RUNNER_PATCH_REASON）

| 文件 | 改动 | RUNNER_PATCH_REASON |
|---|---|---|
| tests/eval/cases/els-eval-010.eval.ts | 新增 r2-ui-empty-state（Playwright E2E） | Frozen 010 空态引导属确定性 UI 红线，非 [H]；Playwright 最小真实旅程自动裁决 |
| tests/eval/cases/els-eval-012.eval.ts | 新增 r5-replay-eq-snapshot（复用 replay-harness） | 013 工具即可覆盖全部 Gold，不复制新框架；037 幂等专项从 012 移除 |
| tests/eval/cases/els-eval-017.eval.ts | 删除「人工抽检」uncovered → coverage full | Frozen 017 无 [H] 标记；pass_criteria 为响应级机械断言，与 021/031/032/036 同口径 |
| tests/eval/cases/els-eval-020.eval.ts | 状态 MANUAL_REVIEW→UNVERIFIED；新增 r-probe-band-detection | Frozen required_trace_fields 硬性缺口 → PRODUCT_CAPABILITY_GAP（非人工可裁）；probe 实证 gate 独立检出 band |
| tests/eval/cases/els-eval-022.eval.ts | 新增 r5-content-consistent → PASS | Frozen 022 无 [H]；内容一致性以确定性 judge 裁决（scripted fixture 语义固定） |
| tests/eval/cases/els-eval-023.eval.ts | MANUAL_REVIEW→UNVERIFIED；FUTURE_TARGET 不再阻塞 | 当前 Gold 行 2 行为满足但 generationMeta 缺 knowledge_miss 标记（硬性缺口）；行 1 为未来目标注释 |
| tests/eval/cases/els-eval-025.eval.ts | 删除 2 处 overconstraint | ①M2 事件非 Frozen required_trace_fields；②误匹配是否缺陷由 failure_criteria 决定（内容未污染即非缺陷） |
| tests/eval/cases/els-eval-030.eval.ts | 新增 r-ui-compare-empty（Playwright E2E）→ 真实 FAIL | Frozen pass 行 2「无上周数据进空态而非编造 Δ」为确定性 UI 红线；E2E 实证编造 Δ → 登记 Bad Case |
| tests/eval/cases/els-eval-035.eval.ts | r3 BLOCKED→gap check；UNVERIFIED（LEGITIMATE） | 以 check 如实记录缺口（不伪造 PASS 也不以 BLOCKED 掩盖）；BC-035-R2 候选 |
| tests/eval/cases/index.ts | FROZEN_10_CASE_BASELINE 更新 | P4A 有意重新分类（010/012/022→PASS）非漂移；基线锁定新状态防未来回归 |
| tests/eval/runner/registry.ts | MISSING_CAPABILITY 刷新 | 按真实能力移除已实现项（017/030），登记 4 个 PRODUCT_CAPABILITY_GAP |
| tests/eval/tools/ui-e2e.ts | 新增（010 空态 / 030 CompareSection） | 复用 speaking-e2e 的 next start 基础设施；deterministic / isolated / resettable / evidence-producing |
| docs/eval/manual-review/els-eval-019.md | packet strengthening | 补「response body 存在」+「UI 渲染路径」确定性证据；S1_CANDIDATE 排人工第一 |
| 删除 | tests/eval/_probe-020.test.ts / _probe-020.eval.ts | 临时 probe 已完成使命（gate band 检测实证），防 vitest include 误匹配 |

Frozen Gold 语义未改变：所有断言口径均来自 `docs/eval/spec/ELS_EVALUATION_V1_1.json` 原文（pass_criteria / failure_criteria / required_trace_fields），未改写任何 Gold。

## 6. Evolution（对比 M3-03 run m3-20260910-085726）

| Case | M3-03（Before） | M3-P4A（After） |
|---|---|---|
| 006 | MANUAL_REVIEW | MANUAL_REVIEW（TRUE_MANUAL_GOLD，等 P4B） |
| 016 | MANUAL_REVIEW | MANUAL_REVIEW（TRUE_MANUAL_GOLD，等 P4B） |
| 018 | MANUAL_REVIEW | MANUAL_REVIEW（TRUE_MANUAL_GOLD，等 P4B） |
| 019 | MANUAL_REVIEW | MANUAL_REVIEW（TRUE_MANUAL_GOLD，RED FLAG S1_CANDIDATE，排第一） |
| 010 | MANUAL_REVIEW | **PASS**（UI 空态 E2E 闭环） |
| 012 | UNVERIFIED | **PASS**（replay 复用闭环） |
| 017 | MANUAL_REVIEW | **PASS**（自动裁决） |
| 020 | MANUAL_REVIEW | UNVERIFIED（PRODUCT_CAPABILITY_GAP：trace 埋点） |
| 022 | MANUAL_REVIEW | **PASS**（确定性内容一致性） |
| 023 | MANUAL_REVIEW | UNVERIFIED（PRODUCT_CAPABILITY_GAP：generationMeta.knowledge_miss） |
| 025 | UNVERIFIED | UNVERIFIED（PRODUCT_CAPABILITY_GAP：precision warning） |
| 030 | MANUAL_REVIEW | **FAIL**（真实红线：CompareSection 编造 Δ → BC-M3-003 OPEN） |
| 035 | UNVERIFIED | UNVERIFIED（PRODUCT_CAPABILITY_GAP：generationMeta.knowledge_miss，BC-035-R2） |
| 008/013/037/038/039 | PASS | PASS（无回归） |
| 026/033 | PASS（VERIFIED_CLOSED） | PASS（VERIFIED_CLOSED 保持） |
| 034 | PASS | PASS（保持） |

## 7. Verification（真实执行）

| 项 | 结果 |
|---|---|
| tsc --noEmit | PASS |
| Eval Runner suite（vitest） | **44/44 PASS**（含 §3 10 Case 回归、E2E 010/030/034） |
| 39 Case Registry 完整性 | 39/39 REGISTERED，0 NOT_RUN |
| Playwright | 010 空态 E2E PASS；030 CompareSection E2E 执行成功（暴露真实 FAIL） |
| Registry schema 校验 | 15-field schema + lifecycle 合法；BC-M3-003 字段齐全 |
| git diff f117d85 -- app components lib supabase | **空（产品零修改）** |

## 8. M3-P4B 准备

- 仅 4 个 TRUE_MANUAL_GOLD 保留人工仲裁：**019（第一）→ 006 → 016 → 018**。
- Human Review Cards：`docs/eval/p4a-human-review-cards.md`（每张仅含 GOLD_QUESTION / USER_INPUT / PRODUCT_OUTPUT / KEY_EVIDENCE / RED_FLAG / HUMAN_DECISION）。

---

# AGENT_HANDOFF

```json
{
  "TASK_ID": "M3-P4A",
  "STATUS": "COMPLETED",
  "PRODUCT_CHECKPOINT": "f117d85",
  "EVAL_BASE": "0b3b6fa",
  "EVAL_COMMIT": "eb9ee43",
  "RUN_ID": "m3-20260910-094159",
  "PASS": 30,
  "FAIL": 1,
  "TRUE_MANUAL_REVIEW": 4,
  "UNVERIFIED": 4,
  "BLOCKED": 0,
  "CASE_010": "PASS",
  "CASE_012": "PASS",
  "CASE_017": "PASS",
  "CASE_020": "UNVERIFIED",
  "CASE_022": "PASS",
  "CASE_023": "UNVERIFIED",
  "CASE_025": "UNVERIFIED",
  "CASE_030": "FAIL",
  "CASE_035": "UNVERIFIED",
  "TRUE_MANUAL_CASES": ["006", "016", "018", "019"],
  "CASE_019_RISK": "S1_CANDIDATE",
  "AUTOMATION_GAPS_CLOSED": 5,
  "RUNNER_OVERCONSTRAINTS_FIXED": 3,
  "PRODUCT_CAPABILITY_GAPS_FOUND": 4,
  "NEW_PRODUCT_BAD_CASES": ["BC-M3-003 / ELS-EVAL-030 (OPEN, S1, UI)"],
  "NEW_REGRESSIONS": [],
  "PRODUCT_CODE_MODIFIED": "NO",
  "TYPECHECK": "PASS",
  "EVAL_SUITE": "44/44 PASS",
  "PLAYWRIGHT": "010 PASS / 030 executed (FAIL finding) / 034 PASS",
  "REGISTRY_VALIDATION": "PASS",
  "NEXT_GATE": "M3-P4B Human Arbitration"
}
```
