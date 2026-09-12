# DASHBOARD-RECOVERY-01 — Dashboard / Learning Report 当前状态审计

**STATUS: AUDIT COMPLETE（只读，PRODUCT_CODE_MODIFIED: NO）**

本审计回答三个问题：Dashboard / Report 做到哪里了、现在能否正常运行、离线上部署还差什么。基于 canonical `5b4d2a4` 真实代码与本地 runtime 实测，不基于旧文档推测。

---

## 1. 最终状态表（Control Plane 一览）

| 项 | 状态 | 说明 |
|---|---|---|
| Dashboard UI | **DONE** | `/dashboard` 真实完成页面（产品数据看板），dev 200，无布局破坏/空白/JSON debug/mock 标识 |
| Learning Report UI | **DONE** | `/report` 真实完成页面（学习报告），dev 200，模块齐全 |
| Dashboard Real API | **DONE** | `/api/dashboard?range=7d/30d/all` 全部 200，sourceMode=real，聚合真实 |
| Report Real API | **DONE** | `/api/report?period=7d` 200，完整数据契约 |
| Supabase Read Connectivity | **PASS** | dev 环境 service-role 实读远程成功（非仅探测） |
| Required Remote Data | **PARTIAL** | 核心表可用；3 张依赖表从未部署（见 §9） |
| Local Typecheck | **PASS** | `npx tsc --noEmit` exit 0 |
| Local Build | **PASS** | `npx next build` 41/41 静态页，仅非阻塞 ESLint warning |
| Preview Deploy | **READY** | 代码可部署；缺 Vercel 项目配置（见 §10） |
| Production Deploy | **NOT_READY** | 无 Vercel 配置 / 无在线 URL / 静态托管下 API 不可用 |

## 2. Dashboard 资产清单

| path | role | status |
|---|---|---|
| `app/dashboard/page.tsx` | client 入口，注入 ApiDashboardRepository | OK |
| `components/dashboard/DashboardPage.tsx` | 主页面（range 切换 + 5 section + Overlay） | OK |
| `components/dashboard/dashboard.css` | 视觉样式（lxdb- 命名空间） | OK |
| `components/dashboard/components/*` | ProductHealth/Lifecycle/LearningImpact/ProductDiagnosis/SystemKnowledge + OverlayHost/MetricValue | OK |
| `app/api/dashboard/route.ts` | 主 API（range 参数） | OK |
| `app/api/dashboard/{bad-cases,lifecycle/[stageId],modules/[moduleId],traces/[traceId]}/route.ts` | 详情 API | OK |
| `lib/dashboard/dashboard.repository.ts` | repository 接口 | OK |
| `lib/dashboard/api-repository.ts` | 浏览器端实现（生产不回退 Mock） | OK |
| `lib/dashboard/real-repository.ts` | service-role 读 Supabase + 离线 eval runs → 纯聚合 | OK |
| `lib/dashboard/aggregate.ts` | 纯聚合（health/lifecycle/impact/diagnosis） | OK |
| `lib/dashboard/types.ts` | 唯一数据契约（Metric<T> 判别联合） | OK |
| `lib/dashboard/eval-reader.ts` / `layer-labels.ts` | 离线 eval run 读取 / 中文 label | OK |
| `lib/dashboard/mock/*` | MockDashboardRepository + fixtures | 仅测试/fixture |
| `lib/auth/dashboard-access.ts` | requireDashboardAccess（email allowlist） | OK |
| tests | P5 oracle、P6B report re-entry、dashboard 相关 | PASS 基线 |

## 3. Learning Report 资产清单

| path | role | status |
|---|---|---|
| `app/report/page.tsx` | server 入口（标题「学习报告」） | OK |
| `components/report/report-page.tsx` | client 主组件（fetch /api/report，纯展示转换） | OK |
| `components/report/*` | report-lede / lexicon-section / compare-section / two-hands / milestone-line / next-step / speaking-growth-card / ability-summary-card / ai-recommendation-card | OK |
| `components/goals/goal-overview` | 目标总览 | OK |
| `app/api/report/route.ts` | 服务端聚合（learning+speaking+ability+evaluation+LLM summary） | OK |
| `lib/report/{aggregator,index,recommendations,types}.ts` | 聚合/推荐/类型 | OK |
| `lib/client/report-transform` / `report-narrative` / `lib/ability/profile-builder` | client 纯展示转换 | OK |
| `lib/repository-factory.ts` | DATA_PROVIDER=memory/supabase 分支 | OK |
| `lib/llm/tasks/generate-report-summary` | LLM 总结（mock/真实 provider） | OK（mock schema mismatch 见 §12） |
| tests | M1 transform、M2-P3B report、ELS-EVAL-038 | PASS 基线 |

## 4. 数据链路（实测确认，非推测）

```
/dashboard ── client DashboardPage ── ApiDashboardRepository.getDashboard(range)
  → GET /api/dashboard?range=7d|30d|all
  → requireDashboardAccess（AUTH_MODE=demo 放行；生产 email allowlist）
  → RealDashboardRepository（service-role client，lib/db/server）
  → Supabase: learning_events + speaking_sessions（+ docs/eval/runs 离线 eval）
  → 纯聚合 lib/dashboard/aggregate.ts → JSON（Metric<T> 状态机）
  生产不回退 Mock；mock 仅供测试。

/report ── client ReportPage ── GET /api/report?period=7d
  → requireUser（AUTH_MODE=demo 放行）
  → repository-factory（DATA_PROVIDER=memory|supabase）
  → aggregateReportData + generateRecommendations + LLM summary
  → client 纯展示转换（buildClientReportFromRaw 等）
  SSOT = 服务端；client 不维护第二套业务事实。
```

## 5. Dashboard 指标清单与状态分类（range=7d 实测）

| 指标 | UI 位置 | API field | 来源表 | 状态 |
|---|---|---|---|---|
| 有效闭环学习人数 | ProductHealth | health.metrics[0] | learning_events+speaking_sessions | READY(0) — EMPTY_BUT_VALID |
| 活跃学习人数 | ProductHealth | health.metrics[1] | learning_events | READY(0) — EMPTY_BUT_VALID |
| 首次激活率 | ProductHealth | health.metrics[2] | learning_events | INSUFFICIENT（无 cohort） |
| 7日留存率 | ProductHealth | health.metrics[3] | learning_events | INSUFFICIENT |
| 首次使用/激活/再次学习/7日留存/稳定学习 | Lifecycle | lifecycle.stages | learning_events | READY(0)+rate INSUFFICIENT |
| 口语反馈后改善率 | LearningImpact | impact.metrics[0] | speaking_evaluations（远程缺失） | INSUFFICIENT（表缺失降级，见 §9） |
| 无提示独立回忆率 | LearningImpact | impact.metrics[1] | learning_events | INSUFFICIENT |
| 72小时后独立回忆率 | LearningImpact | impact.metrics[2] | learning_events | INSUFFICIENT |
| 新情境迁移 | LearningImpact | impact.metrics[3] | 待埋点 | NOT_INSTRUMENTED（真实缺埋点） |
| 学习/复习/口语/报告模块指标 | Diagnosis | diagnosis.features | learning_events/speaking_sessions | READY(0) 为主 |
| 报告后回流率 | Diagnosis | features[3] | **report_views（从未部署）** | **ERROR — SCHEMA_BLOCKER** |
| 内容复用命中率 | Diagnosis + System | reuseStatus / system.capabilities[2] | **content_reuse_events（从未部署）** | **ERROR — SCHEMA_BLOCKER** |
| 链路持久化 | System | capabilities[3] | trace 进程内 | NOT_CONNECTED（真实状态） |
| 检索可追踪/模型时延 | System | capabilities[1]/[4] | trace 进程内 | TRACEABLE |
| 学习记忆 | System | capabilities[0] | learning_events/user_item_states | READY（已接入） |

**状态分布（7d/30d/all 一致）**：ready(0)=若干、insufficient=7、not_instrumented=1、error=3、not_connected=1、traceable=2。`meta.dataStatus=ready`、`failedSections=[]` —— 主链路无 section 级失败。

## 6. 缺失数据 vs 坏数据（严格区分）

- **EMPTY_BUT_VALID**：health/lifecycle/impact 大量 0 与 insufficient —— 接口正确，远程无真实用户学习活动（demo/memory 数据不写入远程）。
- **SCHEMA_BLOCKER（error=3）**：`report_views`、`content_reuse_events` 两表**从未被任何 active migration 创建**——仅存在于 `docs/deferred/supabase/0009_p6_instrumentation.sql`（deferred，未激活）。dashboard 代码正确查询，但表不存在。属 SCHEMA/发布决策问题，非查询代码 bug。
- **降级路径**：`speaking_evaluations` 远程缺失（0008 未完整部署，PRODUCTION-PERSISTENCE-01 已证实）→ speaking_feedback 指标显示 insufficient 而非 error（unwrap 降级），未阻塞页面。
- **NOT_INSTRUMENTED（真实）**：context_transfer 缺 source→target 埋点，如实展示。
- **NOT_CONNECTED（真实）**：trace 仅进程内，未持久化。
- **MOCK**：无。生产路径 Zero mock；mock 仅测试。

## 7. Report 数据状态（demo 模式实测，DATA_PROVIDER=memory）

- `insufficientData=false`（4 个 demo 词条）；memory.totalItems=4、dueSoon=4、review=0、speaking=0。
- 空数据显示为 0，页面有合理空状态；recommendations 正常生成（REVIEW HIGH + LEARN_NEW MEDIUM）。
- **llmSummary=null**（P2，ENVIRONMENT）：mock provider 输出未通过 summary schema 校验（MODEL_SCHEMA_MISMATCH），AI 总结卡片走 fallback。生产真实 LLM 不受影响；这是 demo 环境问题。
- `DATA_PROVIDER=supabase` 时 Report 读远程 user_item_states/learning_events/speaking_sessions/ability_observations（表均存在）。

## 8. Supabase 只读连通性（实测）

- 通过 dev server + dashboard API 实读远程成功（service-role，sourceMode=real）。
- 独立只读探测（limit=1）复核：users/learning_items/user_item_states/learning_events/speaking_sessions/ability_observations/recommendations 均 200 存在。
- 无 DDL / 无写操作 / 无删除（本任务零写入）。

## 9. 相关远程表状态

| 表 | 远程状态 | 影响 |
|---|---|---|
| learning_events | ✅ 存在 | dashboard health/lifecycle/impact、report memory/review |
| speaking_sessions | ✅ 存在 | dashboard impact、report speaking |
| user_item_states | ✅ 存在 | report memory |
| ability_observations | ✅ 存在 | report ability |
| speaking_evaluations | ❌ 缺失（0008 未部署） | dashboard speaking_feedback 降级为 insufficient |
| report_views | ❌ 从未创建（deferred 0009） | dashboard 报告回流率 ERROR |
| content_reuse_events | ❌ 从未创建（deferred 0009） | dashboard 内容复用 ERROR |

## 10. 部署配置审计

- **DEPLOYMENT_PLATFORM**: 无 Vercel 项目配置（无 vercel.json / .vercel）；存在 `scripts/deploy-static.mjs`（CloudStudio 纯静态导出，`EXPORT_STATIC=1` 时 `output: export`，**不支持 API 路由** → 静态托管下 /dashboard、/report 的 fetch 会失败）。
- **PREVIEW_CONFIGURED: NO**；**PRODUCTION_CONFIGURED: NO**。
- **EXISTING_PREVIEW_URL / EXISTING_PRODUCTION_URL: NONE_FOUND**（repo/docs 无任何在线 URL；不编造）。
- **环境变量**：`.env.example` 存在（含 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / AUTH_MODE / DATA_PROVIDER 等说明），部署时可直接参考。
- **Dashboard 生产访问**：`requireDashboardAccess` 需配置 email allowlist（见 `docs/architecture/ARCH-03B-ALLOWLIST.md`）。

## 11. Preview 可部署性判定

**PREVIEW_DEPLOY_READY: YES**（按任务卡最低标准）——页面能打开（dev 实测）、build PASS、无 fatal runtime、环境变量可配置、数据为空时状态机合理展示。不需要所有指标有真实数据才允许部署。

**PRODUCTION_DEPLOY_READY: NOT_READY** —— 无 Vercel 项目/域名/环境变量注入；静态托管则 API 不可用（需 SSR 平台）。

## 12. 已发现问题（只记录，未修复）

| 级别 | 问题 | 类别 |
|---|---|---|
| P1 | dashboard 报告回流率/内容复用两指标 ERROR：report_views/content_reuse_events 表从未部署（0009 deferred 未激活） | D.DEPLOYMENT_CONFIG / SCHEMA_BLOCKER |
| P1 | 无 Vercel 项目与在线 URL；静态导出脚本下 API 不可用，Dashboard/Report 数据无法展示 | D.DEPLOYMENT_CONFIG |
| P2 | demo 模式 llmSummary=null（mock provider schema mismatch，生产真实 LLM 不受影响） | E.ENVIRONMENT |
| P2 | 远程无真实学习活动数据，dashboard 大部分指标 0/insufficient（合法展示，非 bug） | C.REMOTE_DATA_EMPTY |
| P2 | speaking_evaluations 缺失（0008 未部署）→ speaking_feedback 指标仅降级显示 | D.DEPLOYMENT_CONFIG |
| - | trace 仅进程内未持久化（not_connected，真实已知边界） | 已知边界（非本任务范围） |

## 13. 推荐下一步（最多 3 个，按优先级）

1. **建立 Vercel 项目并部署 Preview（最快拿到线上 URL）**：build 已 PASS、代码可部署；配置环境变量（参考 .env.example：NEXT_PUBLIC_SUPABASE_URL/ANON_KEY、SUPABASE_SERVICE_ROLE_KEY、AUTH_MODE=demo|supabase、DATA_PROVIDER=supabase、dashboard email allowlist）→ `vercel deploy` 出 Preview URL。
2. **激活 deferred 0009（report_views/content_reuse_events）或正式声明 dashboard 两项指标为 known-unavailable**：这是发布决策（涉及 0009 是否激活 + 远程部署通道，PRODUCTION-PERSISTENCE-01 已证实当前无 DDL 通道），Control Plane 裁决后 dashboard 两处 ERROR 可转为真实指标或明确标注。
3. **为演示/测试账号在 Supabase 写入真实学习活动**（或确认以空数据态上线）：让 dashboard/report 展示真实非零数据；否则线上展示 0/insufficient（合法但无说服力）。

## 14. 审计方法说明

- 本地 runtime：`npx next dev -p 3500`（AUTH_MODE=demo, DATA_PROVIDER=memory, LLM mock）；3100/3210 被占用未动。
- smoke：/、/dashboard、/report、/api/dashboard?range=7d|30d|all、/api/report?period=7d 全部 HTTP 200。
- 页面为 client 组件 + fetch 数据加载，SSR HTML 输出骨架属正常模式；未做真实浏览器像素级渲染（无 GUI 环境），以代码路径 + API 实测 + 无 server/compile 错误为依据。
- 零产品代码修改；零远程写入。
