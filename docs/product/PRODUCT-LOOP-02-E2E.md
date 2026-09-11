# PRODUCT-LOOP-02-E2E — REAL LEARNING LOOP E2E

> TASK_ID: PRODUCT-LOOP-02-E2E
> TYPE: PRODUCT_INTEGRATION_E2E_VALIDATION（SERIAL_VALIDATION）
> Canonical: `D:\Codex\IELTS-practice` @ branch `repo/arch-consolidate`
> HEAD（验证时）: `1487e01d50f8b25b8659aad9d3b920837f2f01bb`（worktree clean，跑测试前）
> Reference mode: `DATA_PROVIDER=memory` / `AUTH_MODE=demo` / `LLM_PRIMARY_PROVIDER=mock`
> 验证日期: 2026-09-11

## 0. 结论

**PRODUCT_CLASSIFICATION: CONTINUOUS_LEARNING_SYSTEM**

同一个真实用户（demo-user-001）的状态沿
`Goal → Planner → Today → Learn → Review → Speaking → Report → Next Today`
全部 11 个连接点 **PASS**。服务端 Repository 是学习状态 SSOT；今日任务由服务端 Planner（planner-v1）生成而非页面重算；口语目标表达来自已学 learner state；Band 泄漏强制安全回退；Speaking 完成状态写入；报告读取真实活动；二次 Today 重新读取最新状态。

**本 E2E 以 MEMORY provider 验证产品闭环逻辑，不等于跨设备 / Supabase 持久化 PASS。**
Goal durability 冻结为 `MEMORY_REFERENCE_ONLY`（SUPABASE_NOT_IMPLEMENTED / ENV-SUPABASE-01 BLOCKED）。

## 1. 测试用户与初始状态

| 项 | 值 |
|---|---|
| 测试用户 | `demo-user-001`（AUTH_MODE=demo 注入，隔离，不触碰真实用户数据） |
| 数据提供者 | Memory（进程内，每次运行全新） |
| 初始学习状态 | 无任何 item / event / state / speaking session |
| Goal | 见 §2（E2E-01 设置成功） |

## 2. Goal（E2E-01）

| 字段 | 值 |
|---|---|
| examDate | `2026-10-26`（约 45 天后，YYYY-MM-DD） |
| dailyMinutes | 30 |
| weeklyWordTarget | 30 |
| targetBand | 7 |
| currentBand | 5 |
| setAt / plannedWeeks | null（V1 允许） |

PUT `/api/goal` → 200；GET `/api/goal` 回读一致。durable=false / storage=memory（响应显式携带）。

## 3. First TodayPlan（E2E-02）

GET `/api/today`（真实服务端 Planner，非页面重算）：

```json
{
  "date": "2026-09-11",
  "actions": [{ "type": "LEARN_NEW", "priority": "MEDIUM",
    "reason": "本周目标 30 词，进度偏慢，建议学 5 个新表达",
    "target": { "count": 5 }, "estimatedMinutes": 7.5, "href": "/learn" }],
  "primary": { "type": "LEARN_NEW", ... },
  "dailyBudgetMinutes": 30,
  "computedBy": "planner-v1",
  "inputsSnapshot": { "dueCount": 0, "speakingIdleDays": null,
    "weeklyProgress": 0, "feasibility": "atRisk", "recurringIssueCount": 0 }
}
```

- `computedBy=planner-v1` 证实计划来自服务端 Planner。
- 初始状态：无 due review、无 speaking session、本周未学 → Plan 合理为 LEARN_NEW。

## 4. Learning Object

`seed-003` — **"take something for granted"**（PHRASE，coreMeaning=把某事视为理所当然，topicTags=[daily, ielts-part1]，真实 seed 词条，非虚构）。

## 5. Learn 流程（E2E-03 / E2E-04）

| 步骤 | 结果 |
|---|---|
| POST `/api/learn/card` {term} | 200；itemId=`seed-003`、canonicalForm 正确、alreadyLearned=false |
| POST `/api/learn/submit` {itemId, taskType:MEANING_RECALL, answer:"视为理所当然"} | 200；**status=RECALLED_INDEPENDENTLY、recallLevel=1** |
| 写入验证（server repo） | UserItemState 创建；NEW event 创建，correctness=INDEPENDENT |

**LEARN_TO_STATE = PASS**：一次真实学习把同一事实写入 server 端 item + state + event。

## 6. Review 流程（E2E-05 / E2E-06）

- due 构造：repository-level test setup 将 seed-003 的 `nextReviewAt` 置为过去（未修改任何产品调度代码）。
- POST `/api/review/session` {mode:"DUE"} → 200，`totalDue=1`，tasks 含 `seed-003`。
- POST `/api/review/submit` {itemId, taskType:MEANING_RECALL, answer:"视为理所当然", skipped:false} → 200；**recallLevel 1→2，nextReviewAt 推到 2026-09-14**（约 3 天后，间隔增长）。

**STATE_TO_REVIEW / REVIEW_TO_STATE = PASS**：复习模块读取到 Learn 写入的同一 state，复习结果真实更新该 state。

## 7. Vocabulary → Speaking（E2E-07）

POST `/api/speaking/session` {part:"P1", topic:"daily"} → 200：

```json
[{ "itemId": "seed-003", "canonicalForm": "take something for granted",
   "meaning": "把某事视为理所当然",
   "reason": "近期新学，尚未巩固；还未在口语中用过",
   "matchedTopic": "Daily Routine" }]
```

- ≤2 个 targets（实际 1 个）✓
- 目标表达来自**已学 learner state**（资格：已学 + 可口语化 + 口语 tag；评分：近期新学+3）✓
- OPTIONAL 提示，非强制使用（session 创建不依赖使用该表达）✓

**STATE_TO_SPEAKING = PASS**（PERSONALIZED_FROM_STATE）。

## 8. SAFE FALLBACK（E2E-08）

POST `/api/speaking/session` {part:"P3"}（P3 题库 Education and Technology 等与 seed-003 的 daily/ielts-part1 标签无自然匹配）→ 200：

- `suggestedExpressions = []` ✓
- session 正常创建（questionId=sp-p3-001，pickQuestion 兜底）✓

**无自然匹配时 targets=[] 且 Speaking 不受阻——SAFE FALLBACK PASS。**

## 9. Speaking Completion（E2E-11）

POST `/api/speaking/complete` {sessionId} → 200，`status=COMPLETED`；重复调用幂等仍 COMPLETED。

**SPEAKING_COMPLETION = PASS**（显式 Finish 事件，非 mount/unmount 猜测）。

## 10. NO REVERSE STATE POLLUTION（E2E-12）

Speaking analyze + complete 前后，seed-003 长期词汇学习状态逐字段相等：

| 字段 | Speaking 前 | Speaking 后 |
|---|---|---|
| status | RECALLED_INDEPENDENTLY | RECALLED_INDEPENDENTLY（不变）|
| recallLevel | 2 | 2（不变）|
| applicationLevel | 0 | 0（不变）|
| consecutiveCorrect | 2 | 2（不变）|
| currentIntervalDays | 2 | 2（不变）|
| nextReviewAt | 2026-09-14T15:21:45Z | 2026-09-14T15:21:45Z（不变）|

**SPEAKING_NO_STATE_POLLUTION = PASS** —— V1 冻结边界：suggestedExpressions 不修改长期词汇状态（V1.1 反向写回是已知后续项）。

## 11. BAND SAFETY（E2E-10）

注入含单条 Band 泄漏的 LLM 响应（summary="这大概是 Band 6 水平，内容有一定深度，但流利度需要加强。"）：

- quality gate：score=75，issues=[EVIDENCE_MISMATCH, EVIDENCE_MISMATCH, **BAND_SCORE_LEAK**]
- **forcedFallback=true**：public response 为规则引擎 shape（candidateIssues/mainIssue/microDrill/metrics/summary），**无 ieltsAnalysis**
- 全字段扫描 public response：**band-free**（无 band 数字 / 分数泄漏）

**BAND_SAFETY = PASS**：任何 BAND_SCORE_LEAK 不得进入最终用户可见反馈（020 产品修复在 E2E 层再次实证）。020 lifecycle 不推进。

## 12. Report（E2E-13）

GET `/api/report?period=7d` → 200：

| 项 | 值 |
|---|---|
| memory.totalItems | 1（seed-003）|
| review.totalReviews | 1 |
| speakingObservations | 1（COMPLETED session 可见，未因状态遗漏）|

**STATE_TO_REPORT = PASS**：报告读取真实 server 端 states/events/sessions，不是 UI 侧数据。

注：报告 summary LLM 调用在本 harness 中因 mock provider 返回 Speaking 分析 shape（非 ReportSummary schema：overallAssessment/keyInsight/actionableSuggestion/encouragement）走 `llm.report_summary.failed` → summary=null。这是产品设计的 LLM fallback（不崩、数据段正常），非产品 bug；真实 provider 场景由正式 report summarizer schema 约束。

## 13. SECOND Today Plan（E2E-14）

| inputsSnapshot | BEFORE | AFTER |
|---|---|---|
| dueCount | 0 | 0（review 已完成，无到期）|
| speakingIdleDays | null（从未口语） | **0**（刚完成 speaking session）|
| weeklyProgress | 0 | **0.05**（本周已学 1/30）|
| feasibility | atRisk | atRisk |
| recurringIssueCount | 0 | 0 |

`inputsSnapshot` 发生合理变化（speakingIdleDays null→0、weeklyProgress 0→0.05），证明 **GET /api/today 重新读取最新 learner state**。

**REPORT_STATE_TO_NEXT_PLAN = PASS**：下一次 Today 决策基于最新状态（含刚完成的 Speaking 活动），闭环未在 Report 处终止。

## 14. GOAL INFLUENCE（E2E-15，deterministic 对照）

同一 Learner State（learnedThisWeek=1, daysElapsed=2, feasible, now 固定）：

| 变更 | 结果 |
|---|---|
| dailyMinutes 30→60 | actions / dailyBudgetMinutes **改变**（minutesChanged=true）|
| weeklyWordTarget 30→60 | actions **改变**（wordsChanged=true）|
| targetBand 7→9 | actions / dailyBudgetMinutes / primary **完全相等**（band9ActionsEqual=true）|

**GOAL_TO_PLAN 允许输入影响 Plan = PASS；targetBand 不参与核心数量/优先级 = PASS**（Planner 不因 Band 改变训练量）。

## 15. FULL LOOP TRUTH TABLE

| 环节 | 判定 |
|---|---|
| GOAL_TO_PLAN | **PASS** |
| PLAN_TO_TODAY | **PASS** |
| TODAY_TO_LEARN | **PASS** |
| LEARN_TO_STATE | **PASS** |
| STATE_TO_REVIEW | **PASS** |
| REVIEW_TO_STATE | **PASS** |
| STATE_TO_SPEAKING | **PASS** |
| SPEAKING_COMPLETION | **PASS** |
| SPEAKING_NO_STATE_POLLUTION | **PASS** |
| STATE_TO_REPORT | **PASS** |
| REPORT_STATE_TO_NEXT_PLAN | **PASS** |

判定标准达成情况：Goal→Planner PASS、Learn→State PASS、State→Review PASS、State→Speaking PASS、Speaking completion PASS、State→Report PASS、Next Today 重新读取最新状态 PASS → **CONTINUOUS_LEARNING_SYSTEM**（允许的例外：Speaking→Vocabulary 长期写回未实现，属已知 V1.1）。

## 16. E2E_FINDING

**无产品 bug。** 本任务中 6 个测试失败全部为 harness 对 API 响应契约的假设错误（Goal schema 缺 required 字段 currentBand/setAt/plannedWeeks；review session 响应为 `{tasks,totalDue}`；report 响应为 `{memory,review,speakingObservations}`；无匹配 fallback 用 P3 构造而非 topic 过滤——topic 过滤空池会回落全题库属既有设计），修正 harness 后 16/16 通过。未发现需要记录为 PL02-E2E-xxx 的真实产品缺陷。

## 17. Remaining Gaps（非本任务 blocker）

- **Goal 持久化**：MEMORY_REFERENCE_ONLY，未实现 Supabase 跨设备持久化（ENV-SUPABASE-01 BLOCKED）。Memory E2E PASS ≠ cross-device PASS。
- **Speaking→Vocabulary V1.1**：suggestedExpressions 不反向写回长期词汇状态（V1 冻结边界，已知后续项）。
- **M3**：PAUSED。020/023/025/035 UNVERIFIED；019/030 lifecycle FIXED_PENDING_REGRESSION 1/3。本任务未创建新 Eval run、未推进 lifecycle、未改 Frozen Gold。
- 已知测试债（另有生命周期）：6 个 reproducible test debt（badcase-026/035 auth 环境差异 ×4、env.test Supabase 配置 ×1、llm-safety ModelSettingsPanel static ×1），本任务不修。

## 18. Harness

`tests/unit/product-loop-02-e2e.test.ts`（16 用例）——E2E 验证专用最小测试代码（任务允许的新增范围），不新增产品能力。运行方式：

```powershell
cd D:\Codex\IELTS-practice
npx vitest run tests/unit/product-loop-02-e2e.test.ts
```

产品代码修改：**0**（本任务仅新增上述 harness + 本文档）。
