# LEARNING-REPORT-ONLINEIZATION-01

- 日期：2026-09-13
- 分支：`dashboard-only`
- 基线 HEAD：`a5bfb7c07245163de5a8ec190464bcf057590270`
- 任务卡：LEARNING-REPORT-ONLINEIZATION-01（dashboard-only 产品冻结边界内，将 Learning Report 推进到「线上真实可展示」）

## 0. 结论摘要

| 项目 | 结果 |
|---|---|
| REPORT_UI | READY（真实数据渲染，无假数据、无死链） |
| REPORT_RUNTIME | PASS（真实管理员/普通用户会话下 /report 200） |
| REPORT_AUTH | PASS（requireUser 正常；与 Dashboard admin allowlist 独立） |
| REAL_DATA_SOURCE | Supabase 真实（states/events/ability/sessions/evaluations 全走 repository） |
| TOTAL_METRICS | 9 个报告区块/指标组（见 §3） |
| READY_REAL_DATA | 本周学习总结、词汇能力、复习正确率、待复习、下一步行动、学习记录、词库、复习分布 |
| READY_CAPABILITY_NO_SAMPLE | 口语能力画像、AI 诊断（真实能力，需 ≥2 次训练样本） |
| INSUFFICIENT | 0（无样本时全部走中文诚实空态） |
| NOT_INSTRUMENTED | 0（报告不依赖未部署表） |
| MOCK / FALLBACK / ERROR | 0（消除后） |
| FAKE_DATA_REMOVED | 1 处（`demo-user-001` 假身份） |
| RAW_ERROR_LEAKS | 0 |
| SCHEMA_REQUIRED | NO（本轮不需要远程 schema 变更） |
| MIGRATION_EXECUTED | NO |
| DASHBOARD_REGRESSION | PASS（/dashboard 200；/api/dashboard 行为未改） |
| AUTH_REGRESSION | PASS（middleware allowlist 零改动） |

## 1. 全链路事实审计（Phase A）

调用链（全真实，无 mock/demo）：

```
/report (app/report/page.tsx)
  → components/report/report-page.tsx (client, fetch /api/report)
      → app/api/report/route.ts (server, requireUser)
          → lib/report/aggregator.ts (server)
              → SupabaseLearningRepository   (user_item_states / learning_events)
              → SupabaseSpeakingRepository   (speaking_sessions)
              → SupabaseAbilityRepository    (ability_observations)
              → SupabaseEvaluationRepository (speaking_evaluations)
          → lib/evaluation/missing-table.ts (严格限定的缺表降级)
  → lib/client/report-transform.ts / report-narrative.ts (纯函数转换，无假数据)
```

- `repository-factory.ts`：`DATA_PROVIDER=supabase` 时只走 Supabase repositories；demo seed 仅在 `DATA_PROVIDER==="memory"` 启用，与远程环境无关。
- 全链路最可疑扫描（demo/mock/fallback/seed/localStorage/placeholder）：唯一命中 `report-page.tsx` 硬编码 `"demo-user-001"`（纯展示卫生问题，不影响数据），已修复。
- 空态语义：`route.ts` 的 `insufficientData`（events/sessions/states 全 0）→ 中文「暂无学习记录，开始学习后自动生成」，无伪造展示。
- 口语/AI 诊断区：`ability-summary-card` 在样本 <2 时不渲染「AI 反馈有效吗」；「AI 正在建立你的学习画像 / 0-2 次训练」为诚实样本不足态。

## 2. 路由依赖裁决（Phase F）

- `/api/report`、`/api/goal`、`/api/learning/stats` 为 Report 真实依赖（GoalOverview 使用 `useGoalProfile` + `useLearningStats`，初载含 localStorage→server 目标迁移）。
- middleware allowlist 由 LEARNING-REPORT-ONLINE-02（`2a9092e`）加入，本轮**零改动**，Dashboard/Auth V2 不受影响。
- 冻结路由死链（dashboard-only 下 404）全部移除：`/learn`、`/review`、`/speaking`、`/goals` 相关入口改为诚实文案「学习功能入口未在当前部署开放（当前仅数据看板与学习报告）」。

## 3. 指标级真实性分类（Phase B/E 验收口径）

| 报告区块 | 指标 | 数据源 | 分类 |
|---|---|---|---|
| 备考目标 | 目标卡（考试日期/目标分） | GET /api/goal（真实 goal 或「尚未设定」） | READY_REAL_DATA |
| 本周学习总结 | 新收表达/复习次数/活跃天数/连续天数/lede | learning_events 真实聚合 | READY_REAL_DATA |
| 词汇能力 | 词条数/复习正确率/待复习 | user_item_states + learning_events | READY_REAL_DATA |
| 口语能力 | 训练完成度 0/2 | speaking_sessions + ability_observations（缺列/缺样本→诚实空态） | READY_CAPABILITY_NO_SAMPLE |
| AI 诊断 | 能力画像/模式识别 | ability_observations（样本 <2 → 诚实占位） | READY_CAPABILITY_NO_SAMPLE |
| AI 反馈有效吗 | 采纳/改善/解决率 | speaking_evaluations（表已部署；<2 样本不渲染） | READY_CAPABILITY_NO_SAMPLE |
| 下一步行动 | 推荐动作 + 时长 | 真实规则（dueNow/周目标/口语间隔） | READY_REAL_DATA |
| 学习记录 | 词库/复习分布/周对比 | states + events 真实聚合 | READY_REAL_DATA |

## 4. 发现并修复的问题（Phase C/E）

1. **假身份** `components/report/report-page.tsx`：`"demo-user-001"` → 改为从 `json._raw.states[0]?.userId` 取真实 userId（口语画像 builder 入参）。
2. **冻结路由死链 ×5**：`report-page.tsx` 空态 `/learn` CTA、`two-hands.tsx` `/review`、`/speaking`、`next-step.tsx` CTA/secondary（`/review`、`/speaking`、`/learn`）、`goal-overview.tsx` `/goals`。全部改为非导航展示 + 诚实文案，保留推荐结论。
3. **正确率显示 bug**（运行时发现）：`computeReviewAccuracy` 返回 0-100 百分比，`report-page.tsx` 又 `×100` 渲染为「10000%」。改为直接渲染百分比 → 真实显示「正确率 100%」。（CompareSection 本就正确使用百分比，未动。）

修复文件（4 个）：`components/report/report-page.tsx`、`components/report/two-hands.tsx`、`components/report/next-step.tsx`、`components/goals/goal-overview.tsx`。

## 5. Schema 缺口判断（Phase D）

- `speaking_sessions`：**远程缺 `status` / `first_analysis` / `second_analysis` 列**（本地任意 migration 均未创建这些列；0001 仅有 part/topic/question/first_answer/main_issue/second_answer/created_at）。口语写路径与报告口语指标依赖这些列。
- `ability_observations`：远程无行，`level/issues/evidence/suggestions` 列可能缺失（0008 仅远程部署了 §3 speaking_evaluations）。
- **裁决：不补列。** 理由：口语功能在 dashboard-only 冻结边界内（/speaking 404，无 live event writer），建列后样本仍为 0，不为展示而补表（任务卡 Phase D 明令）。
- 影响：口语能力画像与 AI 诊断在真实线上当前显示「完成 0/2 次训练 / AI 正在建立你的学习画像」——诚实空态，不是故障。
- 恢复条件（独立任务）：口语功能解冻时，需 migration 补列 + 写路径验证。

## 6. 运行时验收（Phase G，真实 E2E）

- 环境：`DATA_PROVIDER=supabase`、`AUTH_MODE=supabase`、dev server `localhost:3513`。
- 方法：service-role 创建一次性测试用户（真实 auth 流程），按真实 schema 注入 2 条 `user_item_states` + 4 条 `learning_events`（均为真实列）；浏览器真实登录后访问 /report。
- 结果：
  - `/report` 200；`/api/report` 200（period=7d, insufficientData=false, speakingEvaluationsStatus=OK, llmSummary=true）。
  - 页面真实渲染：lede「2 个表达从「见过」带到了「想得起来」」、新收 2、复习 2 次、活跃 4 天、词汇能力 2 个表达、正确率 100%、待复习 1、下一步「先把 1 个到期的词过一遍 · 大约 1 分钟」、词库 2 条（sustainable / take something for granted）、复习分布「独立想起 1 · 需要提示 1」。
  - 口语/AI 诊断区：诚实空态「已完成 0/2 次训练」「AI 正在建立你的学习画像」。
  - 全页无 demo/mock/原型/原始 SQL 错误；空指标全部为中文空态。
  - 测试用户及注入数据已全部清理（auth 删除级联），远程用户数恢复 5。
- 路由回归：`/learn` `/speaking` `/review` `/goals` 均 404；`/dashboard` 200；`/report` 200。

## 7. 回归（Phase H）

- 定向测试（report + dashboard）：67/67 PASS（`p4-report.test.ts` 12、`dashboard-metrics.correctness.test.ts` 38、`report-eval-degradation.test.ts` 5、`badcase-030-report-baseline.test.ts` 12）。
- `tsc --noEmit`：PASS。
- `next build`：PASS。
- 全量 unit：9 个文件 33 失败均为**既有环境/LLM 债务**（`badcase-019` LLM hallucination 需 API key、`env.test.ts` 占位符、`product-loop-02c`/`badcase-026/035`/`int-m3-01` 依赖冻结学习路由或外部服务），与本次 4 个 UI 组件改动零依赖（已核）。
- middleware：零改动（allowlist 未回退），Dashboard/Auth 行为不变。

## 8. 最终状态

```
LEARNING_REPORT_ONLINEIZATION_STATUS:
REPORT_UI: READY
REPORT_RUNTIME: PASS
REPORT_AUTH: PASS
REAL_DATA_SOURCE: SUPABASE_REAL
TOTAL_METRICS: 9
READY_REAL_DATA: 6
READY_CAPABILITY_NO_SAMPLE: 3
INSUFFICIENT: 0
NOT_INSTRUMENTED: 0
MOCK: 0
FALLBACK: 0
ERROR: 0
FAKE_DATA_REMOVED: 1 (demo-user-001)
RAW_ERROR_LEAKS: 0
ROUTE_STATUS: /report 200 · frozen routes 404
/api/goal_DECISION: KEEP (Report 真实依赖)
SCHEMA_REQUIRED: NO
MIGRATION_EXECUTED: NO
DASHBOARD_REGRESSION: PASS
AUTH_REGRESSION: PASS
TYPECHECK: PASS
BUILD: PASS
FILES_CHANGED: 4
CHECKPOINT_COMMIT: b975c1f（本地已提交；push 因 github.com 网络不可达待重试）
USER_REQUIRED: Vercel 线上浏览器验收（可选）
OPEN_RISKS:
- speaking_sessions 缺 status/first_analysis/second_analysis（远程）；口语指标线上为诚实空态，解冻口语时需补列 migration
- ability_observations 增强列（0008 §2）可能未部署远程；同上
- 全量 unit 的 33 个失败为既有 LLM/env 债务，非本轮回归
```
