# PRODUCT-LOOP-03A — PLANNER QUALITY AUDIT（Planner 学习策略质量审计）

> TASK_ID: PRODUCT-LOOP-03A
> TYPE: ADAPTIVE_PLANNING_PRODUCT_AUDIT（READ_ONLY_STRATEGY_VALIDATION）
> Canonical: `D:\Codex\IELTS-practice` @ branch `repo/arch-consolidate`
> HEAD（审计时）: `d32ee8eb61c66324cf9ce4631478107ad8a26a29`（worktree clean）
> Audit worktree: `D:\Codex\_worktrees\IELTS-practice\PRODUCT-LOOP-03A` @ branch `audit/product-loop-03a-planner-quality`
> 审计日期: 2026-09-12
> 数据出处: 真实 `planner-v1.ts` 通过临时 vitest harness 执行（75 次场景执行 / 36 组 counterfactual pairs / 3×7 天模拟），原始输出留存 `D:\Codex\_tmp\planner-03a\`（worktree 外）。临时测试文件已删除，未提交。

## 0. 结论（TL;DR）

**PLANNER_DECISION: PLANNER_V1_NEEDS_TARGETED_FIXES**

Planner V1 的**骨架是健康的**：Memory floor（Review 永不删除）、Speaking cadence floor（口语不被积压饿死）、Band 正确隔离、确定性、REVIEW/SPEAKING 的 reason 全部真实（53/53 校验通过）。没有 P0。

但存在 **2 个明确 P1**，且它们共享同一个根因：

1. **P1-1 `REVIEW_PRESSURE_DUE_COUNT=5` 绝对闸门**：dueCount ≥ 5 → 新学直接归零，**完全不看剩余预算**。后果：
   - due 4→5 悬崖：weekly=30 时 learn 5→0；weekly=140 时 learn 18→0（27 分钟学习量瞬间消失，仅因多了 1 个到期词条、0.5 分钟复习）。
   - 7 天模拟中普通学习者出现 **LEARN↔REVIEW 机械交替**（PLANNER_OSCILLATION）。
   - 持续积压（due≥5）期间**新学被长期饿死**（REVIEW_HEAVY 模拟 7/7 天无新学），即使预算还有 27 分钟空闲（due=5 时 REVIEW 仅 3 分钟）。
2. **P1-2 静默超预算（SILENT_OVER_BUDGET）**：Review floor（+受保护口语）超过 dailyBudgetMinutes 时，Plan 原样输出且**没有任何 TODAY_OVERLOAD / 超预算说明**。6 个场景实测超预算（如 due=50/budget=10 → 计划 25 分钟；due=20/budget=5 → 计划 15 分钟），用户拿到一份自己根本做不完且不被告知的计划。

**建议**：先做 **PRODUCT-LOOP-03B（PLANNER-TARGETED-FIX）**——把绝对闸门改成按复习耗时/预算的比例式分配，加上超预算显式信号；随后再进入 SPEAKING_TO_VOCAB_V1_1。

---

## 1. Planner V1 当前真实规则摘要（从代码重读，非文档转述）

输入（`planner-v1.ts planToday`）：`goal{dailyMinutes, weeklyWordTarget, examDate, targetBand, currentBand}` + `dueCount` + `speakingIdleDays` + `abilityNextFocusDimension` + `recurringIssueCount` + `learnedThisWeek` + `daysElapsedThisWeek` + `feasibility`（仅快照）。

实际决策链（`lib/planner/planner-v1.ts`）：

| 步骤 | 规则 | 参数（`lib/planner/config.ts`） |
|---|---|---|
| 1 Review floor | `dueCount>0` → REVIEW 必排，永不压缩 | `REVIEW_MINUTES_PER_ITEM=0.5`（向上取整） |
| 2 Speaking | `speakingIdleDays>=2`（cadence floor，受保护，不可压缩）；或 `recurringIssueCount>=2 且 nextFocus 非空`（薄弱定向，可压缩） | `SPEAKING_MAX_IDLE_DAYS=2`、`SPEAKING_SLOT_MINUTES=5`、`WEAKNESS_RECURRING_MIN=2` |
| 3 Learn New | 仅周目标落后时；`dailyNewBase=min(20, ceil(weeklyWordTarget/7))`；**`dueCount>=5` → 直接 0** | `LEARN_MAX_COUNT=20`、`LEARN_WEEKLY_DIVISOR=7`、`REVIEW_PRESSURE_DUE_COUNT=5` |
| 4 预算压缩 | 先逐个减 learn（可到 0）→ 再删可选（薄弱）Speaking；Review 与 cadence Speaking 永不删 | 无 TODAY_OVERLOAD 输出 |
| 5 REST | 仅当 actions 空 且 due=0 且周目标达成 且 idle<2 且 recurring<2 | — |
| 6 兜底 | actions 空 → 强塞 LEARN_NEW 1 个「保持节奏」 | — |

关键实现事实（审计新增确认）：
- `feasibility`（来自 examDate）只进 `inputsSnapshot`，**不参与任何决策**。
- `REVIEW_BUDGET_CAP_RATIO=0.7` 在 config 中定义，**全仓库无任何使用点**（死配置）。
- `weeklyTarget=max(1, round(weeklyWordTarget))`：**weeklyWordTarget=0 不可表达**，被钳制为 1。
- `speakingIdleDays=null`（从未练过口语）：`overMaxIdle` 为 false，**cadence floor 永不触发**。
- learn reason 文本在压缩前生成：reason 里的数量可能 ≠ 压缩后 `target.count`。

---

## 2. 审计方法

- **判断三档**：CLEARLY_REASONABLE / CLEARLY_PROBLEMATIC / DEBATABLE_NEEDS_EVIDENCE。
- 用真实 `planToday` 批量执行：**62 个主场景（A–H 八组）+ 13 个定向探针 = 75 次执行**；28+8=**36 组 counterfactual pairs**；**3 个学习者 × 7 天确定性模拟**。
- 未修改任何产品代码；临时 harness 已删除；既有 `planner-v1.test.ts` 10/10 通过（基线完好）。
- 数据原始输出：`D:\Codex\_tmp\planner-03a\scenarios.json`、`probes2.json`、`probe_budget1.json`。
---

## 3. Scenario Groups A–H 结果（≥30 scenarios 汇总，全部已执行）

### Group A — Normal Learning（CLEARLY_REASONABLE）

| ID | 状态 | Plan | total/budget | 判断 |
|---|---|---|---|---|
| A1 | due=0 idle=0 周落后 | LEARN_NEW×5 | 7.5/30 | 合理 |
| A2 | due=2 idle=0 | REVIEW + LEARN×5 | 8.5/30 | 合理 |
| A3 | due=0 idle=3 | SPEAKING(HIGH) + LEARN×5 | 12.5/30 | 合理（cadence 优先） |
| A4 | due=3 idle=3 | REVIEW + SPEAKING + LEARN×5 | 14.5/30 | 合理 |

普通用户得到自然、可理解的安排。✓

### Group B — Review Backlog（关键发现，B1–B12）

| ID | due | budget | Plan | total | 判断 |
|---|---|---|---|---|---|
| B1–B3 | 5 | 10/20/30 | REVIEW 仅 | 3 | **CLEARLY_PROBLEMATIC**：budget=30 时 REVIEW 仅 3 分钟，新学却被 due≥5 绝对闸门全杀 |
| B4–B6 | 10 | 10/20/30 | REVIEW 仅 | 5 | 同上 |
| B7–B9 | 20 | 10/20/30 | REVIEW 仅 | 10 | 同上 |
| B10–B11 | 50 | 10/20 | REVIEW 仅 | **25 > 预算** | **SILENT_OVER_BUDGET** |
| B12 | 50 | 30 | REVIEW 仅 | 25 | 预算内，但只复习、无口语无新学（idle=0） |

结论：Review floor 没有造成"口语垄断"（cadence floor 保住了口语），但造成了**"新学垄断"**——任何 due≥5（仅 2.5 分钟复习量）就冻结新学，与预算余量无关。P1-1。

### Group C — Speaking Starvation（CLEARLY_REASONABLE，C1–C6）

due=10 固定，idle 递增：

| idle | Plan | 判断 |
|---|---|---|
| 0 / 1 | REVIEW 仅 | 未到 cadence 阈值，可接受 |
| 2 / 3 / 5 / 7 | REVIEW + SPEAKING(MEDIUM) | **cadence floor 生效且随 idle 保持**，口语优先级不下降（MONO-03 ✓） |

有 Review 积压时，超过 cadence 阈值后 Speaking 仍获得受保护 slot。**口语不被饿死。**✓

### Group D — Time Budget（D1–D10）

| ID | budget | 状态 | total | 判断 |
|---|---|---|---|---|
| D1 | 5 | due=0 | 4.5 | 合理（learn 压缩 5→3） |
| D2–D5 | 10–60 | due=2 | 8.5 | 合理 |
| D6–D7 | 5/10 | due=20 idle=5 | **15 > 预算** | **SILENT_OVER_BUDGET**（review 10 + 受保护口语 5，静默超 1.5–3 倍） |
| D8–D10 | 15/30/60 | due=20 idle=5 | 15 | 预算内，但仍无新学（P1-1 同根因） |

### Group E — Weekly Goal Pressure（E1–E10）

| ID | weeklyTarget | progress | Plan | 判断 |
|---|---|---|---|---|
| E1 | **0** | 0% | LEARN×1（理由「本周目标 1 词」） | **CLEARLY_PROBLEMATIC**：目标=0 被钳成 1，用户无法表达"本周不学新" |
| E2–E3 | 7/30 | 0% | LEARN×1 / ×5 | 合理 |
| E4–E5 | 30 | 50% / 90% | LEARN×5 | 合理（落后则补） |
| E6–E7 | 30 | 100% / 120% | **REST** | 合理：**周目标达成不强制学新** ✓ |
| E8–E9 | 70/140 | 0% | LEARN×10 / ×20（30 分钟） | DEBATABLE：单日 20 新词需教学证据（NPE-2） |

### Group F — Goal Counterfactual（F1–F8，同一状态 only 改 goal）

| 变更 | Plan 变化 | 结论 |
|---|---|---|
| dailyMinutes 30→60 | 无变化 | budget 未触顶时合理 |
| weeklyWordTarget 30→140 | learn 5→18 | 正确参与（MONO-04 ✓） |
| **examDate → null / 明天** | **无变化** | **DEAD_GOAL_SIGNAL**：契约声称 examDate 参与调度，实际决策零影响 |
| targetBand 7→8 / 5、currentBand 5→7 | 无变化 | **正确**（Band 隔离原则 D ✓） |

### Group G — Ability Weakness（G1–G8）

| ID | recurring | dimension | Plan | 判断 |
|---|---|---|---|---|
| G1–G3 | 0/1 | — | REST | 阈值=2 合理 |
| G4–G5 | 2/3 | lexical_resource | SPEAKING（定向） | 合理：weakness 能真正改变任务 |
| G6 | 2 | **null** | LEARN×1「保持节奏」 | P3：路径存在但生产不可达（builder 保证 recurring≥2 时 nextFocus 非空） |
| G7 | 2 | dim | REVIEW + SPEAKING | 合理 |
| G8 | 2 | dim + idle=5 + budget=10 | REVIEW + SPEAKING=10 | 预算内；cadence reason 优先（可接受） |

### Group H — Rest Logic（H1–H4，CLEARLY_REASONABLE）

| ID | 状态 | Plan | 判断 |
|---|---|---|---|
| H1 | 全清 | REST | 正确 |
| H2 | idle=4 | SPEAKING(HIGH) | 正确（cadence 覆盖 REST） |
| H3 | recurring=2 | SPEAKING（定向） | 正确 |
| H4 | 周目标未完成 | LEARN | 正确 |

**只有真正"没有必须任务"才 REST。**✓

### 定向探针（probes，13 项）

| 探针 | 结果 | 用途 |
|---|---|---|
| cliff_due4/5 (w30) | learn 5 → 0，total 9.5→3 | P1-1 悬崖量化 |
| cliff_due4/5 (w140) | learn 18 → 0，total 29→3 | P1-1 悬崖放大版 |
| idle_null ×2 | 从未口语 + 周完成 → REST（无口语提示） | P2-2 |
| weekly_0/1/2 | 三者均 learn=1 | P2-3 语义不可表达 |
| budget_7/8 | learn 4 → 5（平滑压缩） | 阈值可接受 |
| budget8_due20_weak2 | REVIEW 10 > 8，薄弱口语被压缩掉，静默超预算 | P1-2 |
| budget10/15_due2 | 同 learn=5 | budget 未触顶不变 |
| budget1 兜底 | fallback LEARN×1 = 1.5 > 1，reason「保持节奏」 | P1-2 + P2-4 |
---

## 4. Monotonicity Matrix（§15，counterfactual pairs 汇总）

| 编号 | 属性 | 验证（pairs） | 结果 |
|---|---|---|---|
| MONO-01 | due↑ → learn 不增 | B3→B6→B9→B12（due 5→50） | ✓（learn 恒 0；但 4→5 有悬崖，见 §5） |
| MONO-02 | budget↓ → 计划总任务不增 | D4→D5、D6→D10（budget 5→60） | ✓（total 恒 15；但 budget=5/10 时静默超预算） |
| MONO-03 | idle↑ → 口语优先级不降 | C1→C2→C3→C6 | ✓（0/1 无口语，≥2 有且保持） |
| MONO-04 | weeklyTarget↑ → learn 不降 | E3(30)→E9(140)、E2(7)→E1(0) | ✓（learn 5→20；0 与 1 相同=钳制，语义错误但非单调性破坏） |
| MONO-05 | targetBand 变 → Plan 不变 | F6/F7/F8 | ✓（完全一致） |
| MONO-06 | 周 progress↑ → learn 压力不增 | E3→E7（0%→120%） | ✓（learn 5→5→5→0） |

**NON_MONOTONIC_PLANNER_BEHAVIOR = 0**（严格单调性全部成立）。但 §5 的 due 4→5 悬崖是"单调但断崖式"，仍构成产品问题。

---

## 5. Threshold Cliff Audit（§16）

| 阈值 | 变化 | 行为变化 | 分类 |
|---|---|---|---|
| **dueCount 4→5** | learn 5→0（w30）/ 18→0（w140），total 9.5→3 / 29→3 | 多 1 个到期词条（+0.5min 复习）→ 27 分钟学习量消失 | **PRODUCT_RISK（P1-1 表现）** |
| speakingIdle 1→2 | 无口语 → 口语（受保护） | 设计内 cadence floor | ACCEPTABLE_THRESHOLD |
| recurringIssue 1→2 | REST → SPEAKING 定向 | 设计内 weakness 阈值 | ACCEPTABLE_THRESHOLD |
| weeklyProgress 90%→100% | LEARN×5 → REST（learned 12→13） | 目标达成切换 | ACCEPTABLE_THRESHOLD |
| budget 7→8 | learn 4→5 | 1 个新词的平滑压缩 | ACCEPTABLE_THRESHOLD |
| weeklyWordTarget 0/1/2 | 全部 learn=1 | 0 不可表达 | TUNING_CLIFF（语义缺陷） |

---

## 6. Oscillation / 7-Day Simulation（§17）

确定性状态更新模型：完成 Plan 后 review 清空 due；learn 项次日进入 due；`incomingDuePerDay` 为外部到达率。

**NORMAL 学习者**（budget=30, weekly=30, incoming=0）:

| Day | Plan | due | learn | 观察 |
|---|---|---|---|---|
| 1 | LEARN×5 | 0 | 5 | — |
| 2 | **REVIEW 仅**（3min） | 5 | 0 | learn 5 次日到期 → due=5 → 绝对闸门触发 |
| 3 | SPEAKING + LEARN×5 | 0 | 5 | due 清零恢复 |
| 4 | **REVIEW 仅** | 5 | 0 | 再次被闸门冻结 |
| 5 | LEARN×5 | 0 | 5 | — |
| 6 | REVIEW + SPEAKING | 5 | 0 | — |
| 7 | LEARN×5 | 0 | 5 | — |

→ **PLANNER_OSCILLATION 确认**：LEARN-heavy ↔ REVIEW-only 逐日机械交替。30 分钟预算用户在 REVIEW-only 日只拿到 3 分钟任务。根因：`REVIEW_PRESSURE_DUE_COUNT=5` 与"新词次日到期"节奏碰撞。

**REVIEW_HEAVY 学习者**（budget=15, weekly=20, incoming=15, startDue=20）：due 稳定在 15–20（复习量与到达率持平，未螺旋），**7/7 天无新学**（due≥5 闸门），口语每 ~2 天出现一次（cadence floor 正常）。→ 新学饿死确认；本配置未触发 BACKLOG_SPIRAL，但见 D6/D7：**budget < 复习分钟数时静默超预算 → 清不完 → 积压必然增长（结构上会螺旋）**。

**SPEAKING_NEGLECT 学习者**（跳口语）：idle 逐日增长 0→6，系统**持续提供受保护口语 slot**（7 天中 4 天给出），不因用户忽略而放弃；learn 仍随 due 5 阈值闪烁（day3 due=8→learn 0，day4 due=3→learn 5）。→ 口语无饿死；learn 闪烁同 P1-1。
---

## 7. Budget Integrity（§19）

统计全部执行：**6 个场景静默超预算**，**0 个带说明超预算**。

| 场景 | 计划 total | budget | 分类 |
|---|---|---|---|
| B10 due=50 | 25 | 10 | **SILENT_OVER_BUDGET** |
| B11 due=50 | 25 | 20 | **SILENT_OVER_BUDGET** |
| D6 due=20 idle=5 | 15 | 5 | **SILENT_OVER_BUDGET** |
| D7 due=20 idle=5 | 15 | 10 | **SILENT_OVER_BUDGET** |
| probe budget=8 due=20 | 10 | 8 | **SILENT_OVER_BUDGET** |
| probe budget=1 兜底 | 1.5 | 1 | **SILENT_OVER_BUDGET**（兜底项自身超预算） |

Planner 输出无任何 overload/explanation 字段（`TodayPlan` 只有 actions/budget/inputsSnapshot）。违反 §10 原则：**Memory floor 超预算时必须明确告知 TODAY_OVERLOAD，而非静默给出做不完的计划**。→ P1-2。

---

## 8. Dead Input Audit（§20）

| 输入 | 声明/期望 | 实际 | 分类 |
|---|---|---|---|
| examDate | `goal/types.ts` 注明"参与调度的 Goal 信号" | 决策零影响（F4/F5 完全一致）；仅派生 feasibility 供展示 | **DEAD_GOAL_SIGNAL（P2）** |
| feasibility | PlannerInput 字段 | 仅写入 inputsSnapshot | DEAD_INPUT（P2，同族） |
| targetBand / currentBand | 明确不参与（原则 D） | 不参与 | **正确，非缺陷** |
| REVIEW_BUDGET_CAP_RATIO | config 注释宣称"复习超 70% 预算只复习" | **全仓库无使用点** | DEAD_CONFIG（P3） |
| weeklyWordTarget=0 | 应表达"不学新" | 钳制为 1，强制 learn 1/天 | 语义不可表达（P2） |
| speakingIdleDays=null | 从未练口语 | cadence floor 失效（永不满阈值） | 边界缺陷（P2） |

---

## 9. Reason Fidelity（§18）

- REVIEW / SPEAKING reason 抽查 **53/53 通过**（reason 数字与 dueCount/idle 完全对应；无泛化装饰）。
- **1 处不忠实**：learn reason 在压缩前生成。probe `cliff_due4_w140`：reason「建议学 **20** 个新表达」但 `target.count=**18**`（预算压缩后）。P2。
- 兜底 reason「保持节奏，学一个新表达」在压缩触达时出现（budget=1），但此时用户实际处于**周目标落后**状态——reason 未反映真实触发原因。P2（与上同族：压缩后 reason 未刷新）。
---

## 10. Findings & Risk Ranking（§21）

### P0 — 0 项
无系统性"安排明显错误学习任务"或长期 harm 的证据。

### P1 — 2 项（HIGH_VALUE_FIX）
- **P1-1 绝对闸门 `dueCount>=5 → learn=0`（不看预算）**：导致 due 4→5 悬崖、NORMAL 学习者 LEARN↔REVIEW 振荡、持续积压期新学饿死（即使预算大量空闲）。
- **P1-2 静默超预算**：Review floor（+受保护口语）超预算时无 TODAY_OVERLOAD 说明，用户拿到不可完成的计划而不自知。

### P2 — 5 项（TUNING / 边界）
- P2-1 examDate/feasibility DEAD_GOAL_SIGNAL（契约声称参与，实际零作用）。
- P2-2 `speakingIdleDays=null` 使 cadence floor 对"从未练口语"用户失效（新用户反而永不被提示口语）。
- P2-3 `weeklyWordTarget=0` 不可表达（钳制 ≥1，强制每天学 1 个）。
- P2-4 learn reason 压缩后不刷新（20 vs 18；「保持节奏」掩盖"周目标落后"）。
- P2-5 idle<2 且 due≥5 时"REVIEW 垄断日"：budget=30 只排 3 分钟任务（体验割裂，随 P1-1 修复自动消失，并入 P1-1 验证）。

### P3 — 3 项（OBSERVATION）
- P3-1 `REVIEW_BUDGET_CAP_RATIO` 死配置（实现或删除二选一）。
- P3-2 兜底 LEARN「保持节奏」在压缩路径可达且自身超预算（budget=1 场景）；G6 的"weakness 无 dimension"路径生产不可达（builder 保证 nextFocus 非空）。
- P3-3 周目标完成 → REST 的 12→13 词跳变（可接受，仅记录）。

### NEEDS_PEDAGOGY_EVIDENCE（下一轮 targeted research，不脑补结论）
- NPE-1：learn/review 交替 vs 比例式并行的学习效果（dailyNewBase 与 due≥5 闸门孰优）。
- NPE-2：单日 20 个新词（weekly=140）的词汇摄入上限是否合理。
- NPE-3：`SPEAKING_MAX_IDLE_DAYS=2` 的口语节奏是否符合 IELTS 备考实践。
- NPE-4：`REVIEW_MINUTES_PER_ITEM=0.5` 的复习耗时模型是否准确。

---

## 11. Planner V2 Decision Gate（§23）

**PLANNER_V1_NEEDS_TARGETED_FIXES**

理由：骨架（floor 机制、Band 隔离、确定性、reason 真实性）成立；无 P0；2 个 P1 都是**局部规则调整可解**，不需要重排决策顺序或引入 LLM/复杂模型。V1 决策顺序本身（Review → Speaking → Learn → 压缩）是健康的。

## 12. Next Product Decision（§24）

**先做 PRODUCT-LOOP-03B（PLANNER-TARGETED-FIX），再进入 SPEAKING_TO_VOCAB_V1_1。**

TOP-3 推荐变更（按性价比）：
1. **P1-1 修复**：把 `dueCount>=5` 绝对闸门替换为按"复习分钟数 vs 预算余量"的比例式分配——例如 `learnCount` 随 `budget - reviewMinutes` 缩水而非直接归零；或把闸门从"数量"改为"复习占用预算比例"（顺带激活已死的 `REVIEW_BUDGET_CAP_RATIO`）。此一项同时解决悬崖、振荡、新学饿死、REVIEW 垄断日。
2. **P1-2 修复**：`TodayPlan` 增加 `overload` 显式信号（如 `total>budget` 时 reason 前缀或独立字段 `TODAY_OVERLOAD`），UI 如实告知"今天超预算，优先完成复习"。
3. **P2 打包小修**：`speakingIdleDays=null` 按 `>=SPEAKING_MAX_IDLE_DAYS` 处理；`weeklyWordTarget` 允许 0（仅在 >0 时参与）；压缩后刷新 learn reason；修正 `goal/types.ts` 关于 examDate 参与调度的契约注释（或真正接线）。

**V1.1（Speaking→Vocabulary correctness evidence）维持 PAUSED**，待 03B 合入后再启动。

---

## 13. 边界与审计声明

- `PRODUCT_CODE_MODIFIED: NO`——未改 planner-v1/config//api/today/UI/GoalRepository 任何代码。
- `NEW_EVAL_RUN: NO`——未创建任何 eval case；仅临时 harness（已删除）。
- `M3_STATUS: PAUSED`（未触碰）。
- 既有 `planner-v1.test.ts` 10/10 通过；canonical 保持 `d32ee8e` clean。
- 审计基于真实代码执行，非文档转述；全部原始数据在 `D:\Codex\_tmp\planner-03a\`（scenarios.json / probes2.json / probe_budget1.json）。

