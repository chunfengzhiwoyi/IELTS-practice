# PRODUCT-LOOP-02-INTEGRATION

> 记录 PRODUCT-LOOP-02 三个产品 slice（02B Goal Planner V1 / 02C Vocab→Speaking V1 / 02D Band Safety）正式集成进入 canonical 的过程与验证结果。
> 日期：2026-09-11。

## 1. Start / End

- START_HEAD：`669a03763cb4ad183a16116ffc5cda6f549d5fd3`（PRODUCT-LOOP-02A-INTEGRATE 之后）
- FINAL_HEAD：见 `git rev-parse HEAD`（本记录提交后 = `35b0b03` 之上的 integration doc commit）
- Worktree：`D:\Codex\IELTS-practice`（canonical，branch `repo/arch-consolidate`）

## 2. Integrated Commits（cherry-pick，非 merge）

| # | Source commit | 内容 | 落成 commit |
|---|---|---|---|
| 1 | `b4347be`（feature/product-loop-02b-goal-planner） | Goal Planner V1：GET/PUT /api/goal、GET /api/today、planner-v1（18 files） | `6a8369d` |
| 2 | `a957e98`（feature/product-loop-02c-vocab-speaking） | Vocab→Speaking V1：suggestedExpressions、target-selection、question-matching（9 files） | `63119ad` |
| 3 | `e961bf4`（fix/product-loop-02d-band-safety） | 020 Band Safety：BAND_SCORE_LEAK 强制安全回退 + trace 字段（4 files） | `e66d4d3` |
| 4 | `775154c`（fix/product-loop-02d-band-safety） | 02D handoff 记录（1 file） | `35b0b03` |

- 三个产品 commit 均以 `669a037` 为 parent（同基线）；文件集合正交，**cherry-pick 全程 0 冲突**。
- 集成 commit（本记录 + handoff 更新）：`chore(product): integrate product-loop-02 slices`。

## 3. Gate 验证（代码级）

### 3.1 Goal Planner Gate
- `GET /api/goal`（app/api/goal/route.ts:41）、`PUT /api/goal`（:59）、`GET /api/today`（app/api/today/route.ts:27）均存在。
- Planner 不调用 LLM：`lib/planner/planner-v1.ts` 仅 import `PLANNER_CONFIG` / `localDayKey` / `GoalProfile` 类型，无任何 LLM import；planner-v1.ts 注释明确“纯函数、确定性、可测试；不调用 LLM”。
- targetBand/currentBand 不参与决策：planner-v1.ts 注释明确“Band 不参与任何数量/优先级计算”；`lib/planner/config.ts` 为纯参数（无 band 字段）。
- Goal durability：`lib/goal/repository.ts` 明确“Supabase goal persistence is not implemented (ENV-SUPABASE-01 BLOCKED)… Falling back to non-durable MemoryGoalRepository: goal profile is NOT durable and NOT synced across devices”。**GOAL_DURABILITY = MEMORY_REFERENCE_ONLY / SUPABASE_NOT_IMPLEMENTED**，文档按此记录。

### 3.2 Vocab→Speaking Gate
- `suggestedExpressions` 在 session response 中返回（app/api/speaking/session/route.ts:142 `{ session, questionData, suggestedExpressions }`）。
- 上限：`MAX_TARGET_EXPRESSIONS = 2`（lib/speaking/target-selection.ts:26），`candidates.slice(0, 2)`。
- 无匹配：`suggestedExpressions = []`，普通 Speaking（route.ts 注释 SAFE FALLBACK）。
- 长期状态无新增写回：target-selection.ts 只读 UserItemState，注释明确绝不写入 applicationLevel/recallLevel/status/nextReviewAt/currentIntervalDays/consecutiveCorrect；session route 不触碰这些字段。**NO_LONG_TERM_WRITEBACK**。

### 3.3 Band Safety Gate
- 任何 BAND_SCORE_LEAK（1 条及以上）→ 确定性强制规则引擎安全回退（analyze-speaking.ts bandRedline + FAIL 分支合并）。
- trace 字段：band_leakage_flag / analysis_path / final_response_redacted（validator=speaking_quality_gate）。
- “X 分钟”误报修复：BAND_SCORE_PATTERNS `\d\.?\d?\s*分(?!钟)`。

### 3.4 02A 保留
- masthead/goal stats 仍走 server SSOT（/api/learning/stats）；speaking completeSession 显式完成流程未被 02B/02C/02D 改动影响（focused 02A tests 通过）。

## 4. 验证结果

| 项 | 结果 |
|---|---|
| Focused（mock env） | **112/112 PASS**（goal-api 8 + goal-client-migration 14 + planner-v1 10 + today-plan-view 4 + 02a + 02c + 02d 6 + badcase-019 26 + badcase-033 14） |
| Full unit（mock env） | **465 PASS / 6 FAIL**（见 §5） |
| typecheck | `npx tsc --noEmit` PASS |
| Web build | `npx next build` PASS |
| Worktree | clean |

## 5. Test Debt Rebaseline（§9 动作）

历史 24 个预存在失败为 **HISTORICALLY_OBSERVED / NOT_CURRENTLY_REPRODUCED**（不宣称被产品代码修复；机制已澄清，见下）。

**当前 integrated tree 实测**（canonical 本机、`LLM_PRIMARY_PROVIDER=mock` 标准测试 env）：`CURRENT_REPRODUCIBLE_TEST_DEBT = 6`

| 失败 | 数量 | 类型 | 复现性 |
|---|---|---|---|
| badcase-026 learn/card e2e（401） | 2 | auth 环境依赖：card 路由 `requireUser`（lib/auth/session），本机 .env.local 开启真实鉴权 → 无 session 401 | 干净环境（worktree 无 .env.local）0 复现 |
| badcase-035 learn/card e2e（401） | 2 | 同上 | 干净环境 0 复现 |
| env.test Supabase 占位识别 | 1 | .env.local 含真实 Supabase URL → 占位识别 false | 干净环境 0 复现 |
| llm-safety 静态检查 | 1 | `ModelSettingsPanel.tsx` imports `@/lib/llm`（组件未改） | 全环境复现（确定性） |

机制澄清（历史 24 的构成）：
- badcase-019/033 “LLM mock 5s/例超时”：canonical `.env.local` 设 `LLM_PRIMARY_PROVIDER=deepseek` → 测试请求真实 provider（latency 5–7s）→ 5s 超时。mock env 下 **全过**（019 26/26、033 14/14、02d 6/6）。
- 02A/02B/02D 独立 worktree（无 .env.local）下这些测试通过，原因即默认 `LLM_PRIMARY_PROVIDER="mock"`（lib/env.ts:43）。
- int-m3-01-combined-path / 其余：本次 integrated tree **全部通过**（未复现）。
- 结论：剩余 6 个失败中 5 个为本机 .env.local 环境依赖（非产品缺陷），1 个为确定性静态检查债（llm-safety）。

## 6. M3 Boundary

- M3 = PAUSED。
- 020：PRODUCT_BEHAVIOR_FIXED / FORMAL_EVAL_PENDING（trace 已埋点，020 lifecycle 更新留由正式 Eval 规则决定，本任务未改）。
- 019/030：FIXED_PENDING_REGRESSION 1/3（未动）。
- 023/025/035：UNVERIFIED（未动）。
- 未创建新 Eval run；Frozen Gold 未动。

## 7. READY_FOR_PRODUCT_LOOP_02_E2E

**YES** — 三个 slice 已入 canonical 且各 Gate 验证通过；下一步为真实 E2E（Goal→Planner→Today / Vocab→Speaking 建议表达 / Band 安全回退的用户流程验证）。
