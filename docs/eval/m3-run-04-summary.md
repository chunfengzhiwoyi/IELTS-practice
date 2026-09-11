# EVAL-RUN-M3-04 — Independent Full Regression Summary

**TASK_ID**: EVAL-RUN-M3-04（INDEPENDENT_FULL_REGRESSION, BLOCKING）
**Status**: COMPLETED（JUDGE ONLY — 产品零修改）

## 0. Frozen Inputs（实况）

| 项 | 值 | 验证 |
|---|---|---|
| PRODUCT_CHECKPOINT | `496ae3104c1731b0b30b5ae3acd41ca8d1ff1e6c` | `git cat-file -t` commit ✓ |
| PRODUCT_HANDOFF_COMMIT | `9fb1d54`（仅 Integration 文档，**未作 SUT**） | — |
| EVAL_BASE（预期/实际） | `2df0749` / `2df0749`（无 DIFF_REASON） | ✓ |
| EVAL_COMMIT（本轮产出） | `d58a196`（eval/m3-run-04 最终记录 commit；`f651580`=docs/output commit，`7ed2f15`=runner commit） | ✓ |
| RUN_ID | `m3-20260910-125036` | `docs/eval/runs/m3-20260910-125036/results.json` |
| 隔离 | branch `eval/m3-run-04` / worktree `D:\Codex\IELTS-eval-m3-run-04` | 产品树 checkout `496ae31`（SUT overlay；`git diff 496ae31 -- app components lib supabase` = 空） |

Fix provenance（全部存在）：
- 019 core fix：`0e367ca`（= integration `8dd22d6` evidence sanitization gate）
- 019 safety patch：`eaeb236`（= integration `9481974` public boundary / grounding SSOT / issues sanitization）
- 019 doc-only：`622ee322`（= integration `73a694f`）
- 030 fix：`9940b69`（= integration `3a45d36` report baseline）
- Integration checkpoint：`496ae31`

## 1. Eval Isolation

- `git worktree add -b eval/m3-run-04 D:\Codex\IELTS-eval-m3-run-04 2df0749`
- `git checkout 496ae31 -- app components lib supabase data` → `git diff 496ae31 -- app components lib supabase` = **0 行**
- `node_modules` junction → 主仓库；`npx next build` **PASS**（.next/BUILD_ID 生成，E2E 前置满足）

## 2. Full 39-Case Run（本轮真实执行）

```
TOTAL_GOLD_CASES  39
REGISTERED        39
AUTO_ADJUDICATED  32   （= RUN_AUTO_PASS 32 + RUN_AUTO_FAIL 0）
  PASS            32
  FAIL             0
MANUAL_REVIEW      3   （006 / 016 / 018 — TRUE_MANUAL_GOLD，见 §4 双口径）
UNVERIFIED         4   （020 / 023 / 025 / 035 — PRODUCT_CAPABILITY_GAP 未变）
BLOCKED            0
NOT_RUN            0
```

全部 39 Case 在本轮 496ae31 SUT 上重新执行；状态由真实运行生成，未继承任何上一轮状态。

## 3. ELS-EVAL-019 — BC-M3-004（S1）回归

**PASS**（human-gold-backed regression adapter，7/7 行断言全绿）：

| 断言 | 结果 | 证据摘要 |
|---|---|---|
| r-gate-ran | PASS | evidenceConsistencyCheck=60 / total=65 |
| r-detected | PASS | EVIDENCE_MISMATCH×3 + mainIssue 关联缺失 |
| r-public-api-safe | PASS | public factual 字段无任何 fixture 幻觉断言（hits=[]）；sanitization applied=true, evidenceRemoved=4, replacedFields=[fluency.issues, mainIssue.description, candidateIssues.description, summary] |
| r-metadata-safe | PASS | 响应全文无 raw claim（rawLeak=[]）；qualityWarning.sanitization 仅安全摘要 |
| r-ui-contained | PASS | SpeakingFeedback 真实组件 renderToStaticMarkup（渲染字段=API 字段）无幻觉文本（uiHits=[]） |
| r-trace-diagnosable | PASS | validation.result 含 evidence_sanitization 诊断（labels-only，diagRawLeak=[]）；Frozen required llm_raw_output/quality_gate_scores/quality_warning 存在 |
| r-legitimate-preserved | PASS | 合法 which 从句+比较级（“The book which I bought yesterday was better than the old one.”）保留；真正 ungrounded 被动语态断言被移除 |

**False-positive guard**：合法 `which`/`better` 断言未被错删，同时 ungrounded 断言（被动语态）被精确移除——grounding SSOT 有效区分 grounded/ungrounded。

**UI hallucination visible**: false（已消除）。**CASE_019_FALSE_POSITIVE_GUARD**: PASS。

## 4. ELS-EVAL-030 — BC-M3-003（S1）回归

**PASS**（4/4 行断言全绿）：

| 断言 | 结果 | 证据摘要 |
|---|---|---|
| r-api-no-progress-claim | PASS | 仅本周数据（无基线）→ API 全文无进步/提升/突破（hits=[]） |
| r-ui-compare-empty | PASS | Playwright 真实 E2E：`暂无历史对比数据` 空态可见；fabricatedDeltaVisible=false；deltaTexts 无 ▲/▼ |
| r-ui-true-zero-guard | PASS | REGRESSION_GUARD：上周 hasActivity=true 且 newItems=0（TRUE ZERO）→ 仍正常显示 `▲ 1`（修复未把 lastV===0 一律隐藏） |
| r-ui-per-row-null | PASS | REGRESSION_GUARD：上周有活动但该指标 reviewAccuracy=null → 该行 delta `—`（无 ▲/▼）；其他有 baseline 行正常 `▼ 1` |

**CASE_030_FABRICATED_DELTA_VISIBLE**: false。**CASE_030_TRUE_ZERO_GUARD**: PASS。

## 5. 其他回归

| Case | 状态 | 备注 |
|---|---|---|
| 026 / 033 | PASS | VERIFIED_CLOSED 保持（regression #4 通过，run 已 append） |
| 034 | PASS | CAPABILITY_VERIFIED 保持（audio_metadata trace 实测：503 CONFIG_ERROR / 502 MODEL_ERROR 路径均含 trace_id + audio_metadata） |
| 008 / 013 / 037 / 038 / 039 | PASS | 无漂移（008 punctuation short-circuit / 013 replay / 037 duplicate 不二次推进 / 038 Server SSOT / 039 trace context） |
| 010 / 012 / 017 / 022 | PASS | P4A 收口项保持 |
| 020 | UNVERIFIED | 红线行为（band 检测 + band-free 响应）PASS，但 Frozen required_trace_fields（band_leakage_flag / analysis_path / final_response_redacted）仍缺 → PRODUCT_CAPABILITY_GAP（候选 BC-020-R1），**不得因 sanitizer 修复顺手判 PASS** |
| 023 / 025 / 035 | UNVERIFIED | generationMeta.knowledge_miss / retrieval precision warning 能力未随 496ae31 变化，依据本轮 evidence 保持 |

**NEW_REGRESSIONS**: 0

## 6. Runner Patches（tests/eval/**，均不涉产品/Frozen Gold）

1. `tests/eval/cases/els-eval-019.eval.ts` — MANUAL_REVIEW-only → **human-gold-backed regression adapter**（A–F 六组确定性断言 + false-positive control）。
   RUNNER_PATCH_REASON：Human arbitration 已冻结 failure semantic（幻觉证据直达 UI = S1）；修复后回归可机械验证红线是否仍存在，不再永久要求人工重复裁决。另：F 断言初版误将 “serialized trace 无 raw claim” 作为硬约束，与 Frozen Gold `required_trace_fields`（含 `llm_raw_output`）冲突——raw claims 唯一合法位置是 provider 转录（llm.attempt.raw_output），已按 Gold 修正为“sanitizer 诊断面无 raw leak”。
2. `tests/eval/cases/els-eval-030.eval.ts` — 复用 P4A E2E + 新增 r-ui-true-zero-guard / r-ui-per-row-null（react-dom/server 渲染实际 CompareSection 组件，验证 496ae31 真实行为）。
3. `tests/eval/tools/ui-e2e.ts` — 空态文案正则兼容新文案（`暂无历史对比数据|还没有可对比的数据`）。
4. `tests/eval/vitest.config.ts` — `esbuild.jsx = "automatic"`：产品组件以 react-jsx 编译（无显式 React import），启用 automatic runtime 使 eval 内 renderToStaticMarkup 可渲染真实组件。

## 7. Dual Accounting

```
A. RUN_AUTOMATED_RESULT（本轮自动执行，真实运行生成）：
   PASS 32 / FAIL 0 / MANUAL_REVIEW 3（006/016/018）/ UNVERIFIED 4（020/023/025/035）/ BLOCKED 0 / NOT_RUN 0
B. FINAL_CASE_STATUS_WITH_FROZEN_HUMAN_GOLD（并入仍有效的 006/016/018 Human Decisions；019 用本轮修复后独立回归结果）：
   FINAL_PASS 35（32 auto + 006/016/018 frozen human PASS，行为语义未变，Human Decision 未被 invalidate）
   FINAL_FAIL 0
   FINAL_UNVERIFIED 4（020/023/025/035 —— PRODUCT_CAPABILITY_GAP 未随 496ae31 变化）
   FINAL_MANUAL_REVIEW 0
   账目：35 + 4 = 39 ✓
```

**AUTO_ADJUDICATED_PASS_RATE** = RUN_AUTO_PASS / (RUN_AUTO_PASS + RUN_AUTO_FAIL) = 32 / 32 = **100%**。
不得表述为 39-case overall pass rate（Human PASS 不计入自动裁决分母；UNVERIFIED 不参与该比率）。

## 8. Bad Case Registry

- **BC-M3-004 / 019**：OPEN → **FIXED_PENDING_REGRESSION**（regression_runs=[m3-20260910-125036]，count **1/3**）。未 VERIFIED_CLOSED——冻结生命周期要求连续 regression evidence。
- **BC-M3-003 / 030**：OPEN → **FIXED_PENDING_REGRESSION**（regression_runs=[m3-20260910-125036]，count **1/3**）。
- **BC-M3-001/002（026/033）**：VERIFIED_CLOSED 保持，regression_runs append 本轮 run（regression #4）。
- notes 已记录：Builder fix + Integration checkpoint（496ae31）+ Independent Eval run。

## 9. Verification

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | PASS（EXIT 0） |
| Eval Runner full suite（44 tests） | PASS（38.32s） |
| 39-case registry completeness | 39/39 registered |
| FROZEN_10_CASE_BASELINE（008/009/010/011/012/022/032/037/038 PASS、035 UNVERIFIED） | PASS（无漂移） |
| Playwright（019 UI containment / 030 empty-state / 034 speaking journey） | 019: 组件级真实渲染；030: E2E 空态实测；034: 既有 E2E |
| next build | PASS |
| Registry schema validation | PASS（15-field entries，lifecycle 合法） |
| `git diff 496ae31 -- app components lib supabase` | **空（0 行）** |

## 10. Flaky Discipline

本轮无 flaky test。Integration 曾有的 transient failure 未在本轮复现，未定性 load-induced。

## 11. 禁止项确认

- 未修改产品代码；未修改 Frozen Gold；未伪造执行；未把 Integration test 当 Eval 判定。
- 未自行声明 M3 COMPLETE（026/033 已 VERIFIED_CLOSED 属既有生命周期；019/030 仅 FIXED_PENDING_REGRESSION 1/3，等待后续 regression 轮次）。

## AGENT_HANDOFF

```json
{
  "TASK_ID": "EVAL-RUN-M3-04",
  "STATUS": "COMPLETED",
  "PRODUCT_CHECKPOINT": "496ae3104c1731b0b30b5ae3acd41ca8d1ff1e6c",
  "EVAL_BASE": "2df0749",
  "EVAL_COMMIT": "d58a196",
  "RUN_ID": "m3-20260910-125036",
  "TOTAL_GOLD_CASES": 39,
  "REGISTERED": 39,
  "RUN_AUTO_PASS": 32,
  "RUN_AUTO_FAIL": 0,
  "RUN_AUTO_MANUAL_REVIEW": 3,
  "RUN_AUTO_UNVERIFIED": 4,
  "RUN_AUTO_BLOCKED": 0,
  "FINAL_PASS": 35,
  "FINAL_FAIL": 0,
  "FINAL_UNVERIFIED": 4,
  "FINAL_MANUAL_REVIEW": 0,
  "CASE_006": "PASS(human,frozen)",
  "CASE_016": "PASS(human,frozen)",
  "CASE_018": "PASS(human,frozen)",
  "CASE_019": "PASS",
  "CASE_019_UI_HALLUCINATION_VISIBLE": "false",
  "CASE_019_FALSE_POSITIVE_GUARD": "PASS",
  "CASE_030": "PASS",
  "CASE_030_FABRICATED_DELTA_VISIBLE": "false",
  "CASE_030_TRUE_ZERO_GUARD": "PASS",
  "CASE_020": "UNVERIFIED(PRODUCT_CAPABILITY_GAP)",
  "CASE_023": "UNVERIFIED(PRODUCT_CAPABILITY_GAP)",
  "CASE_025": "UNVERIFIED(PRODUCT_CAPABILITY_GAP)",
  "CASE_035": "UNVERIFIED(PRODUCT_CAPABILITY_GAP)",
  "BC_M3_004_STATUS": "FIXED_PENDING_REGRESSION",
  "BC_M3_004_REGRESSION_COUNT": "1/3",
  "BC_M3_003_STATUS": "FIXED_PENDING_REGRESSION",
  "BC_M3_003_REGRESSION_COUNT": "1/3",
  "BC_026_STATUS": "VERIFIED_CLOSED",
  "BC_033_STATUS": "VERIFIED_CLOSED",
  "BC_034_STATUS": "PASS/CAPABILITY_VERIFIED",
  "NEW_REGRESSIONS": "none",
  "RUNNER_PATCHES": "4 (019 adapter upgrade, 030 guards, ui-e2e regex, vitest esbuild jsx)",
  "PLAYWRIGHT": "030 empty-state E2E PASS; 019 component-render containment; 034 E2E PASS",
  "EVAL_SUITE": "44/44 PASS",
  "TYPECHECK": "PASS",
  "BUILD": "PASS",
  "REGISTRY_VALIDATION": "PASS",
  "PRODUCT_CODE_MODIFIED": "NO",
  "NEXT_GATE": "M3-P5（或 Control Board 冻结下一 RUN）：BC-M3-003/004 需连续 regression（2/3、3/3）后才可 VERIFIED_CLOSED；020/023/025/035 的 PRODUCT_CAPABILITY_GAP 处置需 Control Plane 决策。未声明 M3 COMPLETE。"
}
```
