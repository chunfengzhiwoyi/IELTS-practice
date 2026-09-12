# PRODUCT-LOOP-03B-INTEGRATION — Planner Targeted Fix Integration

> TASK_ID: PRODUCT-LOOP-03B-INTEGRATE
> TYPE: SERIAL_PRODUCT_INTEGRATION
> Canonical: `D:\Codex\IELTS-practice` @ branch `repo/arch-consolidate`
> 集成日期: 2026-09-12

## 0. 结论

**STATUS = PASS**

PLANNER_V1_1 = **STABLE_FOR_CURRENT_PRODUCT_STAGE**（不存在当前已知 P0/P1 产品逻辑缺陷；教学策略本身仍标 NEEDS_PEDAGOGY_EVIDENCE，不视为已被科学证明最优）。

## 1. Canonical Preflight / Version Discrepancy

| 项 | 实测 |
|---|---|
| ACTUAL HEAD（集成前） | `d5d3d724dface81f39b05963b8d781317b1e9945` |
| Branch | `repo/arch-consolidate` |
| Working tree | clean |
| `6fb560c`（03A audit docs commit）in ancestry | **YES**（HEAD 的直接 parent） |
| `d5d3d72`（03A state update） | **= 当前 HEAD 本身** |

**VERSION_DISCREPANCY_RESOLUTION = CASE A**：Control Plane 记录的 canonical final HEAD（d5d3d72）就是当前 HEAD；03B agent 报告 base=6fb560c 属实（03B 分支 `fix/product-loop-03b-planner-targeted` 从 6fb560c 分叉）。两版本描述不冲突，无历史缺口，正常继续。

## 2. Source Commit Verification

| 项 | 实测 |
|---|---|
| SOURCE_COMMIT | `467bdf014121718aa22800f9cf874455e6987352`（fix(product-loop-03b): planner v1 targeted fixes） |
| 范围 | 11 files：`lib/planner/{config.ts,planner-v1.ts}`、`lib/goal/types.ts`（contract comment）、`components/home/today-plan-view.tsx`、`app/globals.css`、4 个测试文件（planner-v1 17 / planner-03a-regression 9 / today-api 2 / today-plan-view 6）、冻结 E2E 最小类型修复（product-loop-02-e2e.test.ts ±10 行）、文档 `docs/product/PRODUCT-LOOP-03B-PLANNER-TARGETED-FIX.md` |
| 越界检查 | 无 Supabase migration / 无 Speaking→Vocab V1.1 / 无 Eval lifecycle / 无 M3 assets / 无 unrelated cleanup ✓ |

## 3. Cherry-pick

`git cherry-pick 467bdf0` → **0 冲突**，INTEGRATED_COMMIT = `e4b2eee`（11 files changed, 894 insertions(+), 148 deletions(-)）。

## 4. Functional Gates（代码核对 + 测试实证）

| Gate | 判定 | 证据 |
|---|---|---|
| A. 绝对 due>=5 Learn gate 已删除 | **FIXED** | planner-v1 中 `dueCount>=5` 仅存在于注释（"03B：移除绝对闸门"）；LEARN_NEW 由 weeklyTarget/剩余预算驱动 |
| B. REVIEW_BUDGET_CAP_RATIO 真正使用 | **YES** | config `REVIEW_BUDGET_CAP_RATIO: 0.7`；planner 内 `reviewBudgetCapMinutes = floor(budget*0.7)` → `reviewCapacity` → `reviewCount = min(dueCount, max(1, capacity))` |
| C. Review target.count 预算感知 | **YES** | 同上（count 受预算 cap 约束，不再"必须完成全部 due"） |
| D. inputsSnapshot.dueCount 保留总 backlog | **YES** | 注释明确"总到期数量（非建议完成数）"，仍原样写入 snapshot |
| E. weeklyWordTarget=0 → 无 LEARN_NEW | **SUPPORTED** | `behindWeekly = weeklyTarget>0 && learned<targetSoFar`；LEARN 分支由 weeklyTarget 驱动，=0 不生成 |
| F. speakingIdleDays=null = NO_COMPLETED_SPEAKING_HISTORY | **FIXED** | config 注释 + 决策原则 B："null（从未完成口语）→ cadence overdue，必须安排 Speaking（受保护 slot）" |
| G. null idle 不允许 REST | **FIXED** | null 视为 overdue → Speaking floor 受保护，REST 不出现 |
| H. targetBand/currentBand 不参与决策 | **YES** | planner-v1 中 Band 仅出现在注释（"不参与任何数量/优先级计算"），0 处计算引用 |
| I. examDate/feasibility CONTEXT_ONLY | **YES** | 仅注释 + inputsSnapshot；0 处决策引用 |
| J. 普通 Plan 不 silent over-budget | **FIXED** | budgetStatus 字段 + 注释"绝不静默"；B10–B11 回归通过（due=50 预算 10/20） |
| K. mandatory floor 超预算 → OVERLOADED + overloadReason | **YES** | `budgetStatus: WITHIN_BUDGET/OVERLOADED`、`overloadReason?`；D6–D7 回归通过（due=20 idle=5 预算 5/10） |

## 5. Regression Matrix（planner-03a-regression.test.ts 9/9 PASS）

| 用例 | 覆盖 | 结果 |
|---|---|---|
| B1–B3: due=5 预算 10/20/30 | 无"仅复习"垄断日 | PASS |
| weekly=140 放大版悬崖消失（due 4→5 不再 18→0） | **DUE_4_TO_5_CLIFF: REMOVED** | PASS |
| B10–B11: due=50 预算 10/20 | 不静默超预算 | PASS |
| D6–D7: due=20 idle=5 预算 5/10 | OVERLOADED + 原因 | PASS |
| E1: weeklyWordTarget=0 | 不强制 learn=1 | PASS |
| F4/F5: examDate null/明天 | context-only 决策一致 | PASS |
| NORMAL 7-day | 不再 LEARN↔REVIEW-only 机械交替（cliff 不再由 due=5 门槛制造） | PASS |
| REVIEW_HEAVY 7-day | 持续积压下新学不饿死（7/7 天有新学） | PASS |
| SPEAKING_NEGLECT 7-day | 口语不 starvation；learn 不因 due 闪烁 | PASS |

## 6. PRODUCT-LOOP-02 E2E Preservation

`tests/unit/product-loop-02-e2e.test.ts` → **16/16 PASS**（CONTINUOUS_LEARNING_SYSTEM 未被 03B 打破）。

## 7. Focused / Full Validation

| 项 | 结果 |
|---|---|
| planner-v1.test.ts | 17/17 PASS |
| planner-03a-regression.test.ts | 9/9 PASS |
| today-api.test.ts | 2/2 PASS |
| today-plan-view.test.tsx | 6/6 PASS |
| product-loop-02-e2e.test.ts | 16/16 PASS |
| **Focused 合计** | **50/50 PASS** |
| Full unit（标准 mock env，AUTH_MODE=demo） | **505 PASS / 2 FAIL**（36 files：34 pass / 2 fail） |
| `npx tsc --noEmit` | **PASS** |
| `npx next build` | **PASS**（Compiled 24.5s；41/41 static pages） |

**CURRENT_REPRODUCIBLE_TEST_DEBT = 2（均为 PRE_EXISTING，非 03B 回归）**：
1. `llm-safety.test.ts`（1）：ModelSettingsPanel 静态检查 —— 确定性静态债，全环境复现（历史已记录）。
2. `env.test.ts`（1）：Supabase 占位 URL 识别 —— 环境依赖（canonical `.env.local` 含真实 Supabase URL；干净环境通过）。
3. 说明：历史 canonical 本机观测的 4×auth-401（badcase-026/035 learn/card e2e）在本次 `AUTH_MODE=demo` 标准 env 下不出现（env 配置正确，非产品变化）。无 03B 引入的新失败。

## 8. Planner Phase Freeze

**PLANNER_V1_1: STABLE_FOR_CURRENT_PRODUCT_STAGE**

这不代表"教学策略已被科学证明最优"，仅代表不存在当前已知 P0/P1 产品逻辑缺陷。以下继续标 **NEEDS_PEDAGOGY_EVIDENCE**：
- learn/review 比例式并行是否最优
- 20 words/day cap 是否合理
- 2-day Speaking cadence 是否合理
- 0.5min/review item 是否准确

不得继续给 Planner 增加规则（除非 Control Plane 明确指派）。

## 9. M3 Boundary

M3 = PAUSED；020 = PRODUCT_FIXED_FORMAL_EVAL_PENDING；019/030 = FIXED_PENDING_REGRESSION_1_OF_3；023/025/035 = UNVERIFIED。本任务未创建新 Eval run、未推进 lifecycle、未改 Frozen Gold。

## 10. Commits

| commit | 说明 |
|---|---|
| `e4b2eee` | fix(product-loop-03b): planner v1 targeted fixes（cherry-pick 467bdf0） |
| 本集成记录 commit | chore(product): integrate planner targeted fixes（状态文档 + 本记录） |

FINAL_HEAD = 本集成记录 commit（见 `git rev-parse HEAD`）。
