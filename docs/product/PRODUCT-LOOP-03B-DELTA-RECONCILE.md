# PRODUCT-LOOP-03B-DELTA-RECONCILE — Revised Planner Regression Coverage

> TASK_ID: PRODUCT-LOOP-03B-DELTA-RECONCILE
> TYPE: SERIAL_DELTA_RECONCILIATION
> Canonical: `D:\Codex\IELTS-practice` @ branch `repo/arch-consolidate`
> 完成日期: 2026-09-12

## 0. 结论

**STATUS = PASS**

- **PRODUCT_CODE_DELTA = NONE**：revised 03B（db91cc5）相对已集成版本（e4b2eee）在全部产品路径（lib/planner、lib/goal、app/api/today、components/home、app/globals.css）零差异。
- 仅补入 **测试 + 文档** 增量：`tests/unit/planner-v1.test.ts`（+151 行：TEST-01..16 + MONO-01..06）与 `docs/product/PRODUCT-LOOP-03B-PLANNER-TARGETED-FIX.md`（revised 文档 + reconcile 记录）。
- PLANNER_PRODUCT_LOGIC = **UNCHANGED_AFTER_03B_INTEGRATION**；PLANNER_STATUS = **V1_1_STABLE_FOR_CURRENT_PRODUCT_STAGE**。

## 1. Canonical Preflight

| 项 | 实测 |
|---|---|
| CANONICAL_HEAD_BEFORE | `f4e63eaff6e1cf14de9a27cbfdbb729b84dfea5b` |
| Branch | `repo/arch-consolidate` |
| Working tree | clean |
| `f4e63ea` | = 当前 HEAD |

## 2. Revised Commit 核对

| 项 | 实测 |
|---|---|
| REVISED_03B | `db91cc5969da627ae184f4d3e01cab91c24108dc`（fix(product): stabilize planner budget allocation） |
| Parent | `d5d3d72`（rebase 到 03A final canonical 后） |
| 文件集 | 与 467bdf0 相同 11 文件；`planner-v1.test.ts` 232→355 行、文档 255→271 行 |

## 3. 核心比较（e4b2eee vs db91cc5）

`git diff --name-status e4b2eee db91cc5`：

```
M  docs/product/PRODUCT-LOOP-03B-PLANNER-TARGETED-FIX.md   (+24 行)
M  tests/unit/planner-v1.test.ts                           (+151 行)
```

| 分类 | 结果 |
|---|---|
| PRODUCT_CODE_DIFF | **NONE**（lib/planner、lib/goal、app/api/today、components/home、app/globals.css 全零 diff） |
| TEST_DIFF | `tests/unit/planner-v1.test.ts`（TEST-01..16 + MONO-01..06） |
| DOC_DIFF | `docs/product/PRODUCT-LOOP-03B-PLANNER-TARGETED-FIX.md`（revised 文档） |
| STATE/HANDOFF_DIFF | NONE（db91cc5 从 d5d3d72 生出，不含 canonical 最新 state 文件；未被回退） |

E2E 测试：`tests/unit/product-loop-02-e2e.test.ts` 在 e4b2eee 与 db91cc5 间**无 diff** → **E2E_TEST_SEMANTICS_CHANGED = NO**。

## 4. 应用方式

逐文件提取（非整 commit cherry-pick）：`git restore --source=db91cc5 -- tests/unit/planner-v1.test.ts docs/product/PRODUCT-LOOP-03B-PLANNER-TARGETED-FIX.md`。文档额外追加 reconcile 记录段（区分 implementation branch base `d5d3d72` / canonical integration `e4b2eee`+`f4e63ea` / revised delta = 本任务），未改写原文档结论。

## 5. Revised Coverage 确认

- **TEST-01..16**：due 3–7 cliff（4→5 无 cliff、7 时 Learn 减少必须预算驱动非 threshold）、预算感知 review、极低 budget、OVERLOADED+原因、null idle→Speaking、weekly=0→Learn=0、reason 刷新、band 隔离、examDate contextOnly、budget invariant、REST、3×7-day（NORMAL/REVIEW_HEAVY/SPEAKING_NEGLECT）。
- **MONO-01..06**：dueCount↑→Learn 不增；dailyMinutes↓→effort 不反向增（OVERLOADED mandatory exception 除外）；speakingIdleDays↑→Speaking priority 不降；weeklyWordTarget↑→Learn pressure 不减；targetBand 变→Plan 不变；weekly progress↑→Learn pressure 不增。
- **band 6/7/8/9 invariant**、**Speaking completion cadence reset 模拟**：均含于 revised planner-v1 用例集。
- **due 3/4/5/6/7** 全覆盖（§10 回归矩阵）。

## 6. Validation

| 项 | 结果 |
|---|---|
| Focused（planner-v1 + 03a-regression + today-api + today-plan-view + 02-E2E） | **59/59 PASS**（= revised handoff 目标） |
| product-loop-02-e2e.test.ts | 16/16 PASS（CONTINUOUS_LEARNING_SYSTEM 保持） |
| Full unit（标准 mock env，AUTH_MODE=demo） | **514 PASS / 2 FAIL**（36 files） |
| `npx tsc --noEmit` | **PASS** |
| `npx next build` | PASS（41/41） |

**CURRENT_REPRODUCIBLE_TEST_DEBT = 2**（与集成前一致，无 delta 回归）：
1. `llm-safety.test.ts`（1）：ModelSettingsPanel 静态债 —— 确定性，全环境复现。
2. `env.test.ts`（1）：Supabase 占位 URL 识别 —— **ENVIRONMENT_DEPENDENT**（canonical `.env.local` 含真实 Supabase URL；revised branch 干净环境 515/1 即因此项通过）。不修无关 debt。

## 7. Planner Freeze

- PLANNER_PRODUCT_LOGIC: **UNCHANGED_AFTER_03B_INTEGRATION**
- PLANNER_TEST_COVERAGE: **REVISED_AND_STRENGTHENED**
- PLANNER_STATUS: **V1_1_STABLE_FOR_CURRENT_PRODUCT_STAGE**
- 不再继续修改 Planner（除非 Control Plane 明确指派）。

## 8. M3 Boundary

M3 = PAUSED；020 = PRODUCT_FIXED_FORMAL_EVAL_PENDING；019/030 = FIXED_PENDING_REGRESSION_1_OF_3；023/025/035 = UNVERIFIED。本任务未创建新 Eval run、未推进 lifecycle。

## 9. Commit

`test(product): reconcile revised planner regression coverage`（仅 tests + docs + state record；无 fix(product)）。

FINAL_HEAD = 见 `git rev-parse HEAD`。
