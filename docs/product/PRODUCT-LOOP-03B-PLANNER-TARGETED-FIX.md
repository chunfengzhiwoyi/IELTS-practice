# PRODUCT-LOOP-03B — PLANNER TARGETED FIX（Planner V1 定向修复）

> TASK_ID: PRODUCT-LOOP-03B
> TYPE: ADAPTIVE_PLANNER_TARGETED_FIX（IMPLEMENT）
> Canonical: `D:\Codex\IELTS-practice` @ branch `repo/arch-consolidate`
> Base HEAD: `6fb560c3c2c07a4ebfa5e00e6af711949d062d08`（03A 审计已集成）
> Worktree: `D:\Codex\_worktrees\IELTS-practice\PRODUCT-LOOP-03B` @ branch `fix/product-loop-03b-planner-targeted`
> 完成日期: 2026-09-12
> 范围声明: 保留现有 deterministic planner 架构（Goal + State → Planner → TodayPlan），**不做 Planner V2 重构**；无 LLM / 无 Multi-Agent / 无 RL / 无动态权重。

---

## 0. 结论（TL;DR）

03A 审计确认的 **2 个 P1 与相关 P2/P3 已全部修复**：

| 03A 发现 | 等级 | 03B 处置 | 状态 |
|---|---|---|---|
| `dueCount>=5` 绝对闸门（悬崖 / 振荡 / 新学饿死 / REVIEW 垄断日） | P1-1 | 删除闸门；Review 改为预算感知 count；Learn 用剩余预算 | **FIXED** |
| 静默超预算（6 场景 0 说明） | P1-2 | `budgetStatus` + `overloadReason`；普通情况保证 sum≤budget | **FIXED** |
| `speakingIdleDays=null` 使 cadence floor 失效 | P2-2 | null = NO_COMPLETED_SPEAKING_HISTORY = cadence overdue | **FIXED** |
| `weeklyWordTarget=0` 不可表达（钳制为 1） | P2-3 | 0 合法；不参与 targetSoFar；learn 可为 0 | **FIXED** |
| learn reason 压缩后不刷新（20 vs 18） | P2-4 | reason 在最终 count 确定后生成 | **FIXED** |
| examDate/feasibility DEAD_GOAL_SIGNAL | P2-1 | 契约改为 contextOnly（snapshot-only），不再声称驱动决策 | **FIXED（契约修正）** |
| `REVIEW_BUDGET_CAP_RATIO` 死配置 | P3-1 | 激活：Review 建议量至多占预算 70% | **FIXED** |
| 兜底 LEARN 自身超预算（budget=1 → 1.5） | P3-2 | 兜底改为：预算足够才 LEARN×1，否则 REST | **FIXED** |

**无 P0；`targetBand/currentBand` 继续冻结不参与决策（未改变）；examDate/feasibility 明确不再参与决策。**

---

## 1. Before / After（按 03A finding 逐条）

### 1.1 P1-1：绝对闸门 → 预算感知分配

**Before**（`planner-v1.ts`）：
```
dailyNewBase = min(20, ceil(weeklyWordTarget/7))
dueCount >= REVIEW_PRESSURE_DUE_COUNT(5)  →  learnCount = 0   # 不看预算
```
- due 4→5 悬崖：weekly=30 时 learn 5→0（total 9.5→3）；weekly=140 时 learn 18→0（total 29→3）。
- NORMAL 7 天模拟：LEARN×5 / REVIEW 仅 / LEARN×5 / REVIEW 仅 … 机械交替。
- REVIEW_HEAVY：7/7 天无新学（即使预算还有大量空闲）。

**After**：
```
reviewBudgetCapMinutes = floor(budget × REVIEW_BUDGET_CAP_RATIO(0.7))
reviewCapacity       = floor(reviewBudgetCapMinutes / REVIEW_MINUTES_PER_ITEM(0.5))
reviewCount          = min(dueCount, max(1, reviewCapacity))     # 预算内建议量
reviewEffort         = max(1, ceil(reviewCount × 0.5))
learnRemaining       = budget - reviewEffort - (cadenceSpeaking? 5 : 0) - (optionalSpeaking? 5 : 0)
learnCount           = max(0, min(dailyNewBase, floor(learnRemaining / 1.5)))
```
- 可选口语放不下剩余时先放弃可选口语，学习再占用全部剩余；Learn 永远 ≤ 剩余预算。
- **due 4→5 不再悬崖**：weekly=30/budget=30 时 learn 恒 5；weekly=140 时 learn 恒 18（回归测试断言）。

### 1.2 P1-2：静默超预算 → 显式预算状态

**Before**：`TodayPlan` 无任何 overload 字段；B10（due=50/budget=10 → 25min）、D6（due=20/budget=5 → 15min）等 6 个场景静默超预算。

**After**：
```
budgetStatus: "WITHIN_BUDGET" | "OVERLOADED"
overloadReason?: string   # 仅 OVERLOADED 时存在
```
- **普通情况（WITHIN_BUDGET）必须保证 `sum(actions.estimatedMinutes) <= dailyBudgetMinutes`**（测试 case 11 断言；学习项按 `floor(remaining/1.5)` 分配 + 0.1 精度取整不放大）。
- **OVERLOADED 仅当 mandatory floors（Review + cadence Speaking）本身装不进预算**——此时允许总 effort > budget，但必须给出 `overloadReason`（如「今天到期复习较多，同时口语已超期未练。计划略超出你的时间预算。」），UI 渲染提示块，**绝不静默**。
- 兜底路径不再制造超预算：预算 ≥1.5min 才 LEARN×1（1.5min）；否则 REST（0min）。

### 1.3 P2-2：null speakingIdleDays

**Before**：`overMaxIdle = speakingIdleDays >= 2`；null → false → cadence floor 永不触发 → 从未练口语的新用户永不被提示口语，甚至直接 REST。

**After**：冻结语义 `null = NO_COMPLETED_SPEAKING_HISTORY`：
- `cadenceOverdue = (idleDays == null) || (idleDays >= SPEAKING_MAX_IDLE_DAYS)`。
- null 时 Speaking reason 为「你还没有完成过口语训练，今天安排一次短练习」（不伪造具体天数）。
- null 时**不得 REST**（REST 条件含 `!cadenceOverdue`）。

### 1.4 P2-3：weeklyWordTarget=0

**Before**：`weeklyTarget = max(1, round(weeklyWordTarget))` → 0 被钳制为 1，每天强制学 1 个。

**After**：`weeklyTarget = max(0, round(...))`：
- `weeklyTarget==0` → `behindWeekly=false`、`weeklyProgress=1`（视为已达成）→ 不产生 LEARN_NEW；REST 文案为「本周不安排新词学习，今天可以休息」。
- 有 due 时仍先复习（memory floor 与 weekly=0 正交）。

### 1.5 P2-4：reason 压缩后刷新

**Before**：learn reason 在 count 计算前生成（「建议学 20 个」但 count=18）；兜底「保持节奏」掩盖真实原因。

**After**：`learnCount` 确定后才构建 reason（`本周目标 ${weeklyTarget} 词，进度偏慢，建议学 ${learnCount} 个新表达`）；Review reason 在 `reviewCount` 确定后生成，且 backlog 时真实说明：「今天有 N 个到期复习，按 M 分钟预算先完成 K 个」。测试断言 reason 数字与 target.count 一致。

### 1.6 P2-1 / §13：examDate / feasibility → context-only

**Before**：`goal/types.ts` 契约注释声称 examDate「参与调度的 Goal 信号」，实际决策零影响（DEAD_GOAL_SIGNAL）。

**After**：
- `goal/types.ts` / `planner-v1.ts` 契约注释明确 `examDate`、`feasibility` 为 **contextOnly（snapshot-only）**：不参与任何决策，仅写入 `inputsSnapshot` 供展示。
- 本轮**未**添加任何「距考试 7 天就怎样」式未经验证教学规则（03A NPE 未解决前不允许）。
- 测试断言：examDate null / 明天 → Plan 完全一致（toEqual）；targetBand 变化 → Plan 完全一致。

---

## 2. Frozen Priority Model（03B 冻结，V1.1 前不改）

时间不足时的舍弃顺序：
1. **LEARN_NEW 先压缩**（可到 0；高负载日允许 Review + Speaking 不学新）
2. **可选 Speaking（薄弱定向）次之**（剩余放不下时放弃）
3. **Review（memory floor）与 cadence Speaking（cadence floor）不因压缩被删除**；两者若本身超预算 → `OVERLOADED` + 原因

| 底线 | 规则 | 参数 |
|---|---|---|
| MEMORY_FLOOR | dueCount>0 → 必排 REVIEW（count 预算感知，但至少 1 个） | `REVIEW_MINUTES_PER_ITEM=0.5`、`REVIEW_BUDGET_CAP_RATIO=0.7` |
| SPEAKING_CADENCE_FLOOR | null 或 ≥2 天 → 必排短口语（受保护） | `SPEAKING_MAX_IDLE_DAYS=2`、`SPEAKING_SLOT_MINUTES=5` |
| REST | 仅无 due + 周目标达成（或 weekly=0）+ cadence 已满足 + recurring<2 | `WEAKNESS_RECURRING_MIN=2` |

**目标不再是「今天完成全部 due」**：`REVIEW action.target.count` 表示预算内建议完成量；`inputsSnapshot.dueCount` 保留总到期量；backlog 时 reason 如实说明。

---

## 3. Budget Integrity（Before/After 实测）

### 03A 原 6 个静默超预算场景 → 03B 复测

| 场景 | budget | 03A total（静默） | 03B 行为 |
|---|---|---|---|
| B10 due=50 | 10 | 25 | REVIEW×14（7min）+ LEARN×2（3min）= 10，**WITHIN_BUDGET** |
| B11 due=50 | 20 | 25 | REVIEW×28（14min）+ LEARN×4（6min）= 20，**WITHIN_BUDGET** |
| D6 due=20 idle=5 | 5 | 15 | Review floor(3min)+Speaking(5min)=8 > 5 → **OVERLOADED + reason** |
| D7 due=20 idle=5 | 10 | 15 | Review floor(7min)+Speaking(5min)=12 > 10 → **OVERLOADED + reason** |
| probe budget=8 due=20 idle=0 | 8 | 10 | REVIEW×14（7min）+ LEARN×0（剩余 1 < 1.5）= 7，**WITHIN_BUDGET** |
| probe budget=1 兜底 | 1 | 1.5（learn） | 预算 <1.5 → **REST（0min）** |

新增回归测试覆盖：B10/B11、D6/D7、budget=1 兜底、budget=8 场景。

### Overload 语义

- `OVERLOADED` 的充要条件：`mandatory floors（Review + cadence Speaking）> dailyBudgetMinutes`。
- 触发时 `overloadReason` 由触发项拼接：「今天到期复习较多，同时口语已超期未练。计划略超出你的时间预算。」（或仅含其中一项）。
- UI：`TodayPlanView` 在 OVERLOADED 时渲染 `<p class="today-zone__overload" data-today-overload>{plan.overloadReason}</p>`；WITHIN_BUDGET 不渲染。

---

## 4. Threshold Cliff Fix（due 4→5）

回归测试断言（weekly=30 / budget=30、due=4/5/6 其它固定）：

| due | 03A learn | 03B learn | total |
|---|---|---|---|
| 4 | 5 | 5 | 2+7.5=9.5 |
| 5 | **0**（悬崖） | **5** | 3+7.5=10.5 |
| 6 | 0 | **5** | 3+7.5=10.5 |

- learn 不再因 4→5 硬跳变；允许随预算余量逐渐减少。
- 放大版（weekly=140）：due=4/5 → learn 均 18（03A: 18→0）。

---

## 5. 7-Day Regression（三类学习者）

### NORMAL（budget=30, weekly=30, incoming=0）

| Day | 03A Plan | 03A learn | 03B Plan | 03B learn |
|---|---|---|---|---|
| 1 | LEARN×5 | 5 | LEARN×5 | 5 |
| 2 | **REVIEW 仅** | 0 | REVIEW + LEARN×5 | **5** |
| 3 | SPEAKING + LEARN×5 | 5 | SPEAKING + LEARN×5 | 5 |
| 4 | **REVIEW 仅** | 0 | REVIEW + LEARN×5 | **5** |
| 5 | LEARN×5 | 5 | REVIEW + LEARN×5 | 5 |
| 6 | REVIEW + SPEAKING | 0 | REVIEW + SPEAKING + LEARN×5 | **5** |
| 7 | LEARN×5 | 5 | SPEAKING + LEARN×5 | 5 |

→ learn = `[5,5,5,5,5,5,0]`；**LEARN↔REVIEW-only 机械振荡消除**（REVIEW 日不再被闸门冻结为 3 分钟任务）。

### REVIEW_HEAVY（budget=15, weekly=20, incoming=15, startDue=20）

- 03A：7/7 天无新学（饿死）。
- 03B：7/7 天 learn=3（review 15 项 8min + learn 3 项 4.5min = 12.5 ≤ 15）；due 稳定 15（清得完，不螺旋）。
- 断言：`learnByDay.every(n > 0)` 且 `dueByDay ≤ 20`。

### SPEAKING_NEGLECT（due 逐日波动、idle 0→6）

- 03A：口语 7 天中 4 天出现；learn 随 due=8 闪烁（day3 learn=0）。
- 03B：口语 7 天中 5 天出现（idle≥2 全部给出）；day3 due=8 → **learn=5**（learn 不再被 due 阈值清零）。
- 断言：speaking 天数 ≥5、`learnByDay[2] > 0`。

---

## 6. Contract Changes

### `lib/planner/planner-v1.ts`
- 新增 `BudgetStatus`、`budgetStatus`（必填）、`overloadReason?`（仅 OVERLOADED）。
- `NextAction.reason` 注释：压缩完成后生成，数量与 target.count 一致。
- `PlannerInput.feasibility` / `TodayPlan.inputsSnapshot.feasibility` 注释：contextOnly。
- 删除绝对闸门；激活 `REVIEW_BUDGET_CAP_RATIO` 预算感知 Review count；null idle → cadence overdue；weekly=0 → 无新学；兜底不超预算。

### `lib/planner/config.ts`
- **删除** `REVIEW_PRESSURE_DUE_COUNT`。
- **激活** `REVIEW_BUDGET_CAP_RATIO: 0.7`（03A P3-1 死配置）。
- 参数注释更新 null-idle 语义。

### `lib/goal/types.ts`
- 契约注释：`examDate` = contextOnly（snapshot-only），不参与调度决策。
- `weeklyWordTarget: 0` 注释 = 本周不学新。

### `components/home/today-plan-view.tsx` + `app/globals.css`
- OVERLOADED 渲染 overload 提示块（`data-today-overload`）；WITHIN_BUDGET 不渲染。
- UI 仍按 planner 顺序渲染，不重新排序。

### `app/api/today/route.ts`
- 未改（沿用 02B 服务端入口）；`GET /api/today` 返回含 `budgetStatus` / `overloadReason` / `inputsSnapshot` 的 TodayPlan。

---

## 7. Tests & Validation

### 新增 / 更新测试（50/50 通过）

| 文件 | 数量 | 覆盖 |
|---|---|---|
| `tests/unit/planner-v1.test.ts`（重写） | 17 | §18 全部 12 项 + 确定性 / 薄弱定向 / 周目标落后 / 全清 REST / 7 天 NORMAL |
| `tests/unit/planner-03a-regression.test.ts`（新增） | 9 | B1–B3 垄断日消除、放大版悬崖、B10–B11 / D6–D7 预算、E1 weekly=0、F4/F5 examDate、NORMAL / REVIEW_HEAVY / SPEAKING_NEGLECT 7 天 |
| `tests/unit/today-plan-view.test.tsx`（重写） | 6 | 顺序 / primary / REST / reason / OVERLOADED 渲染 / WITHIN 不渲染 |
| `tests/unit/today-api.test.ts`（新增） | 2 | GET /api/today 契约（computedBy / budgetStatus / dueCount 透传 / null idle → SPEAKING / 服务端 Goal 生效） |
| `tests/unit/product-loop-02-e2e.test.ts`（冻结测试） | 16 | 最小类型修复（goalProfile 窄化 + feasibility literal），语义未改，**通过** |

### 验证结果

| 项 | 结果 |
|---|---|
| Focused（planner+UI+api+regression） | **25/25 + 9/9 通过** |
| Frozen e2e（02） | **16/16 通过** |
| 全量 unit | **506 passed / 1 failed**（唯一失败 = `llm-safety` 静态检查：`ModelSettingsPanel.tsx` import `@/lib/llm`，**基线既有债务，03B Do-Not-Touch 范围，未触碰**） |
| Typecheck `tsc --noEmit` | **TSC_EXIT:0**（另修复 e2e 冻结测试自身 5 处既有类型错误——d32ee8e 引入、03A 只读未捕获，最小化修复不改语义） |
| Web build `next build` | **BUILD_EXIT:0** |
| M3 eval run | **未创建**（遵守边界） |
| 新增 DB schema / LLM 调用 | **NO / NO** |

---

## 8. Remaining Pedagogy Questions（不脑补，下一轮 targeted research）

- NPE-1：learn/review 交替 vs 比例式并行的学习效果（03B 采用比例式并行；教学证据仍待）。
- NPE-2：单日 20 个新词（weekly=140）的词汇摄入上限是否合理（未改）。
- NPE-3：`SPEAKING_MAX_IDLE_DAYS=2` 口语节奏是否符合 IELTS 备考实践（未改）。
- NPE-4：`REVIEW_MINUTES_PER_ITEM=0.5` 复习耗时模型是否准确（未改）。
- 新问题：backlog 提示「今天有 N 个到期复习，按 M 分钟预算先完成 K 个」的文案体验待真实用户验证。

---

## 9. 边界与审计声明

- `PRODUCT_CODE_MODIFIED: YES`（planner/config/goal-types/UI/CSS + 测试；全部位于 03B worktree 分支 `fix/product-loop-03b-planner-targeted`，canonical 未写）。
- `NEW_DATABASE_SCHEMA: NO`、`NEW_LLM_CALL: NO`、`NEW_EVAL_RUN: NO`、`SUPABASE_GOAL_PERSISTENCE: NOT_IMPLEMENTED`（ENV-SUPABASE-01 仍 BLOCKED，未触碰）。
- 03A 场景回归以测试形式保留（`planner-03a-regression.test.ts`），非一次性 harness。
