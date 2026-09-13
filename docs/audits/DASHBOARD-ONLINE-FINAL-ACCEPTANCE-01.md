# DASHBOARD-ONLINE-FINAL-ACCEPTANCE-01

- 日期：2026-09-13
- 分支：`dashboard-only`
- 基线 HEAD：`adf36b4`（REMOTE-SCHEMA-RECOVERY-02）
- 验收对象：`/dashboard`（产品数据看板 = 主线），`/report` 仅为回归检查、非本轮目标
- 模式：真实浏览器（bu）+ 真实 Supabase 会话 + curl cookie 传输 + focused tests / tsc / build
- 产品代码修改：是（2 处最小演示修复，见 §8）

---

## 1. Canonical 状态核实

- `git HEAD` = `adf36b4`，分支 `dashboard-only`，提交链线性：`959aa7a → 6adb241 → 1fa813f → dfe2793 → 2a9092e → d218459 → adf36b4`。
- 无并行覆盖；CURRENT-PROJECT-STATE.md 为旧基线（repo/arch-consolidate 时代），仅作背景，不冲突。
- 工作树未跟踪项仅 `tests/unit/dashboard-login-v10-handoff.zip`（另一 Agent 产物，未动）。

## 2. 真实管理员登录与会话

- 因真实管理员密码不可得，创建 **disposable admin**（`dash.accept.…@ielts-practice.test`）并**临时**加入 `.env.local` allowlist（备份 `.env.local.bak-rsr2`）。
- 发现并修复环境坑：PowerShell `-replace '^…$'` 多行不匹配导致 allowlist 从未真正写入（403 为正确 fail-closed 行为）；改用 Python `re.sub` 后重启 dev server 生效。
- 真实浏览器登录：login → POST `/auth/v1/token?grant_type=password` 成功 → `/dashboard` 渲染。
- 会话保持：多次 reload / 二次 fetch 均保持认证（session retained）。

## 3. 真实数据源 E2E

- `GET /api/dashboard?range=7d`（浏览器同源 + curl cookie 重放）：**HTTP 200**。
- 响应：`meta: { dataStatus: "ready", sourceMode: "real", failedSections: [], range: "7d" }`。
- 无 memory provider、无 demo seed、无 mock 指标、无硬编码 dashboard 数字。

## 4. 指标重分类矩阵（live `/api/dashboard` 实测）

口径：以当前 canonical `/api/dashboard` 实际返回的指标槽位为准，共 **27 个**（旧审计 30 个为更早 taxonomy；本矩阵按 live inventory 输出，分类标准不变：REAL_DATA / CAPABILITY / INSUFFICIENT / NOT_INSTRUMENTED / ERROR）。

| # | 区块 | 指标 | live status | 分类 |
|---|---|---|---|---|
| 1 | 产品健康 | 有效闭环学习人数 | ready(0) | READY_REAL_DATA（合法空） |
| 2 | 产品健康 | 活跃学习人数 | ready(0) | READY_REAL_DATA（合法空） |
| 3 | 产品健康 | 首次激活率 | insufficient（尚无 cohort） | INSUFFICIENT |
| 4 | 产品健康 | 7日留存率 | insufficient（成熟 cohort 不足） | INSUFFICIENT |
| 5-9 | 生命周期 | first_use / activation / return / d7_retention / habit | count ready(0) + rate ready(0) | READY_REAL_DATA（合法空） |
| 10 | 学习效果 | **口语反馈后改善率** | insufficient（reason「尚无口语评估」） | **READY_CAPABILITY_NO_SAMPLE**（schema 已就绪，无样本） |
| 11 | 学习效果 | 无提示独立回忆率 | insufficient | INSUFFICIENT |
| 12 | 学习效果 | 72小时后独立回忆率 | insufficient | INSUFFICIENT |
| 13 | 学习效果 | 新情境迁移 | not_instrumented | NOT_INSTRUMENTED（待埋点） |
| 14 | 产品诊断 | 新表达独立完成率 | insufficient（无 NEW 尝试） | INSUFFICIENT |
| 15 | 产品诊断 | 复习参与人数 | ready(0) | READY_REAL_DATA（合法空） |
| 16 | 产品诊断 | 口语重答完成率 | insufficient（无首答） | INSUFFICIENT |
| 17 | 产品诊断 | **报告后回流率** | not_instrumented（修复后；修复前 error） | NOT_INSTRUMENTED（report_views 属 deferred 0009，无写路径） |
| 18 | AI 质量 | 评测通过率 | ready 91.3%（sampleSize 115, runId m3-20260909-143153） | **READY_REAL_DATA ✓ 真实** |
| 19 | AI 质量 | 关键失败率 | ready 0% | **READY_REAL_DATA ✓ 真实** |
| 20 | AI 质量 | 离线分项 m5-m8（状态一致性/检索/判定/口语反馈） | secondary=[] | NOT_INSTRUMENTED（稳定产物无键） |
| 21 | AI 质量 | runtime failures | ready [] | READY_REAL_DATA（合法空） |
| 22 | AI 质量 | **runtime persistence** | not_connected（修复后；修复前 error） | NOT_INSTRUMENTED（dashboard_traces 属 deferred 0009） |
| 23 | 系统与知识 | 学习记忆 | ready | READY_REAL_DATA |
| 24 | 系统与知识 | 知识检索 | traceable | READY_CAPABILITY |
| 25 | 系统与知识 | **内容复用命中率** | not_instrumented（修复后；修复前 error） | NOT_INSTRUMENTED（content_reuse_events 属 deferred 0009） |
| 26 | 系统与知识 | 链路持久化 | not_connected | NOT_INSTRUMENTED（真实：trace 仅进程内） |
| 27 | 系统与知识 | 模型响应时延 | traceable | READY_CAPABILITY |

**汇总**：TOTAL_METRICS = 27；READY = 15（其中 READY_REAL_DATA 13、READY_CAPABILITY 2）；INSUFFICIENT = 7（全部为 schema 就绪下的合法样本不足）；NOT_INSTRUMENTED = 6；ERROR = 0。

### 5. speaking_feedback_improvement 重鉴定（§8）

- RSR-01 前：缺 `speaking_evaluations` 表 → 降级/不可用。
- 现在：表 **PRESENT**、repository query **PASS**、无 PGRST205、rows=0（真实无二次回答样本）。
- 结论：**SCHEMA_READY + EVENT_SOURCE_READY + CURRENT_SAMPLE_INSUFFICIENT** → 分类 INSUFFICIENT（READY_CAPABILITY_NO_SAMPLE）。
- 不插 fake metric；样本需通过真实口语二次回答流程产生（未来独立任务）。

## 6. 区块验收（5 区块，以当前 canonical UI 为准）

- 01 产品健康 / 02 用户学习生命周期 / 03 学习效果 / 04 产品诊断（功能表现 + AI 运行质量）/ 05 系统与知识。
- 内容真实、层级清晰；空数据统一为「数据不足 / 尚未采集 / 尚未启用」honest empty，不表现为系统故障。
- 离线评测真实展示：评测通过率 91.3%、关键失败率 0%（`generated/dashboard/latest-eval.json`，runId m3-20260909-143153）。

## 7. 30 秒演示自检（面试视角）

- 能看懂：有人在用吗（0 真实用户 → 诚实空）、有没有形成闭环（无样本）、学习有没有效果（无样本）、AI 反馈质量（离线 91.3% 通过率真实可讲）、哪些功能被用（0）、AI 系统质量（记忆已接入/检索可追踪）、哪些指标没埋点（6 项明确标注「尚未启用/需新增埋点」）。
- 不再有技术字段泄漏；数字含义均有 label/definition 说明。

## 8. PRESENTATION_BLOCKER 与最小修复（本轮唯一产品代码改动）

### Blocker #1 — 横幅硬编码「原型示意数据 · 非生产指标」
- 位置：`components/dashboard/components/DashboardHeader.tsx` L21（静态字符串）。
- 问题：数据已是真实 Supabase，横幅误导「非生产指标」。
- 修复：改为「Supabase 真实数据 · 离线评测独立标注」。
- 范围：单行文案。

### Blocker #2 — deferred 0009 三表错误把原始 PostgREST 文案泄漏到 UI
- 现象：`report_views`（报告后回流率）、`content_reuse_events`（内容复用命中率）、`dashboard_traces`（runtime persistence）显示「查询失败」+ `Could not find the table 'public.X' in the schema cache` 原文。
- 根因：`lib/dashboard/real-repository.ts` `isMissingTable()` 只识别 `42P01/does not exist`；PostgREST 客户端实际返回 **PGRST205**（schema cache 通道）→ 落入 error 分支。
- 修复：`isMissingTable` 增加 `code === "PGRST205"` 与 `/could not find the table/i` 匹配（单点，4 行）。
- 效果：三指标按设计意图分类——报告回流率→not_instrumented（「尚未采集 / 需新增埋点」）、内容复用→not_instrumented（「尚未启用」）、trace 持久化→not_connected（「未持久化」）；原始错误文案从 UI 消失。
- 语义边界：只放宽「表不存在」识别；auth/RLS/网络/未知错误仍 fail loudly（safeQuery 其它分支未动）。

## 9. 认证与路由矩阵（真实 Supabase 会话）

| 场景 | 结果 |
|---|---|
| admin `/api/dashboard` | 200 ✓ |
| non-admin `/api/dashboard` | 403 ✓（fail-closed allowlist） |
| no-session `/api/dashboard` | 401 ✓ |
| `/report`（回归，非目标） | 200 ✓ |
| `/api/report`（回归） | 200 ✓ |
| `/api/goal`（回归） | 200 ✓ |
| `/learn`（dashboard-only 隔离） | 404 ✓ |

传输注：PowerShell `Invoke-WebRequest` 会破坏长 Cookie 头（重放 401）；`curl.exe` 正常。浏览器内请求全程正常。

## 10. 测试 / 构建

- `tests/unit/dashboard-metrics.correctness.test.ts`：38/38 PASS
- `tests/unit/report-eval-degradation.test.ts`：5/5 PASS
- `npx tsc --noEmit`：PASS（exit 0）
- `npx next build`：PASS（/dashboard、/report、/login、middleware 等路由全部产出）

## 11. 线上验收（Vercel）

- `https://ielts-practice-data.vercel.app` 从本机不可达（curl 000 超时）。
- **ONLINE_BROWSER_ACCEPTANCE = USER_REQUIRED**（需用户浏览器访问确认 login → /dashboard 链路）。
- AUTH_URL_CONFIG：Supabase Site URL / Redirect URL（/reset-password）指向 Vercel 域名——**USER_ACTION_REQUIRED** 确认配置。
- Vercel env（DASHBOARD_ALLOWED_EMAILS / NEXT_PUBLIC_APP_URL）：本地 SET；线上 UNKNOWN（无法访问 Vercel 面板）。

## 12. 已知缺口 / 保留项

- 多数指标为 0/insufficient：合法 honest empty（远程无真实学习活动）；真实数据需经产品学习流程产生（未来任务）。
- `m5-m8` 离线分项 NOT_INSTRUMENTED（稳定产物 `latest-eval.json` 无 secondary 键）。
- deferred 0009（report_views / content_reuse_events / dashboard_traces / dashboard_trace_events / p6 instrumentation）：**UNTOUCHED**；`docs/deferred/supabase/0009_p6_instrumentation.sql` 全程未动。其指标以「尚未启用 / 需新增埋点」文态呈现，不部署。
- 生命周期留存矩阵为空（无 cohort）——合法。
- insufficient 指标下「当前不可用」小标签语义冗余，非阻断，本轮未改。

## 13. SECURITY_DEBT（仅记录，不修）

- `public.wechat_login_states` RLS DISABLED（Supabase advisory CRITICAL）——独立安全任务，禁止与 Dashboard 修复混改。
- 本轮全程无 secret 输出；测试凭据已删除；远程测试用户已清理。

## 14. 数据安全与清理证据

- 远程清理后：auth users = 5（基线）、learning_items = 2 个 canonical 条目（e758048a…「take something for granted」/ 5a478d95…「sustainable」，canonical_key 完好）、speaking_evaluations = 0。
- `.env.local` 已还原为原始 allowlist（zhihan.chunfeng@gmail.com）；`.env.local.bak-rsr2` 及全部临时凭据/cookie/脚本文件已删除。
- dev server 已停止。

## 15. FINAL ACCEPTANCE

```
DASHBOARD_UI: PASS
DASHBOARD_AUTH: PASS
DASHBOARD_API: PASS
REAL_SUPABASE_DATA: PASS
METRIC_CLASSIFICATION: PASS
SPEAKING_EVALUATION_SCHEMA: PASS
SPEAKING_FEEDBACK_METRIC: READY_CAPABILITY_NO_SAMPLE
AI_QUALITY: PARTIAL（主指标真实 91.3%/0%；分项 m5-m8 未埋点）
PRESENTATION_READY: PASS（2 处最小修复后）
DASHBOARD_REGRESSION: PASS
DEFERRED_0009: UNTOUCHED
TOTAL_METRICS: 27
READY: 15（READY_REAL_DATA 13 / READY_CAPABILITY 2）
INSUFFICIENT: 7
NOT_INSTRUMENTED: 6
ERROR: 0
```

## 16. 变更清单（本 commit）

- `components/dashboard/components/DashboardHeader.tsx`：横幅文案 1 行（Blocker #1）
- `lib/dashboard/real-repository.ts`：`isMissingTable` 识别 PGRST205 / could-not-find-the-table（Blocker #2）
- `docs/audits/DASHBOARD-ONLINE-FINAL-ACCEPTANCE-01.md`：本文档

## 17. NEXT

- 用户浏览器线上验收（Vercel）→ 若需面试演示真实数据，通过真实产品学习流程产生样本（独立任务）。
- AUTH_URL_CONFIG / Vercel env 确认（用户侧）。
- 不进入：/report 优化、report_views、content reuse、context transfer、trace instrumentation、deferred 0009。
