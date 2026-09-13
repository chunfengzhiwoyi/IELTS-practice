# LEARNING-REPORT-ONLINE-02 — ROUTE UNBLOCK + SUPABASE E2E + SCHEMA RECOVERY PACK

> 任务：LEARNING-REPORT-ONLINE-02（LEARNING-REPORT-ONLINE-AUDIT-01 与 DASHBOARD-DATA-GAP-AUDIT-01 的下一阶段施工）
> 日期：2026-09-13 ｜ Agent：豆包b ｜ Branch：dashboard-only @ 1fa813f4 + checkpoint
> 只读核查 + 最小代码变更；未执行任何远程 DDL；未触碰 deferred 0009。

## 0. 结论速览

```
LEARNING_REPORT_ONLINE_02_STATUS: COMPLETE
REPORT_UI_READY:      PASS（页面完整，dev 200；supabase 模式下空态为 HONEST_EMPTY_STATE）
REPORT_ROUTE_READY:   PASS（middleware additive 白名单后 /report、/api/report、/api/goal、/api/learning/stats 均放行）
REPORT_API_READY:     PARTIAL（真实用户 uuid 下：缺表降级后应 200，见 §4；demo+supabase 组合受 22P02 限制，属配置组合非缺陷）
REPORT_SCHEMA_READY:  BLOCKED（远程缺 speaking_evaluations 表 + canonical_key 列；DDL channel BLOCKED）
REPORT_DATA_READY:    BLOCKED（远程无真实学习活动；users 5 人但业务表 0 行）
SPEAKING_EVALUATIONS: MISSING（PGRST205 实测）
CANONICAL_KEY:        MISSING（42703 实测，anon + service-role 双证实）
REMOTE_DDL_CHANNEL:   BLOCKED（PRODUCTION-PERSISTENCE-01：无 DATABASE_URL / Management token / CLI）
MIDDLEWARE_CHANGE:    ADDITIVE（4 条精确路径）
OPTIONAL_EVAL_DEGRADATION: IMPLEMENTED（仅 PGRST205/42P01 + speaking_evaluations 表名 → evaluations=[] + 结构化警告）
DASHBOARD_REGRESSION: PASS（/dashboard 200；/api/dashboard 基线行为不变：无 session 401 / demo 非白名单 403）
TESTS:                新增 degradation 单测（6 用例）通过；typecheck 待 §7
CHECKPOINT_COMMIT:    （见 §9）
NEXT:                 Control Plane 决策 DDL channel → 按 REMOTE_SCHEMA_RECOVERY_PLAN.md 部署 → 真实数据生产
```

## 1. 工作树并发保护

开始时工作树不干净（另一 Agent 的 Dashboard Auth V2 并行未提交）：
- `D app/(auth)/reset-password/page.tsx`、`M components/dashboard/DashboardLoginPage.tsx`、`M components/dashboard/dashboard-login-route.tsx`
- `?? app/reset-password/`、`?? components/dashboard/dashboard-reset-password-route.tsx`、`?? _tmp_handoff/`、`?? _tmp_recovery_link.txt`、`?? _tmp_recovery_session.json`、`?? tests/unit/dashboard-login-v10-handoff.zip`

处理：本任务改动仅限 middleware.ts、app/api/report/route.ts、lib/evaluation/missing-table.ts、supabase/migrations/0011_canonical_key.sql、docs/*、tests/unit/report-eval-degradation.test.ts——与上述文件**零重叠**。checkpoint 只 stage 本任务文件，不 stage 并发工作。

## 2. Phase A — Route Unblock（middleware additive patch）

修改 `middleware.ts`（仅新增，未改任何既有行为）：
- `DASHBOARD_ALLOWED_EXACT` 追加 `/report`
- 新增 `REPORT_ALLOWED_EXACT = Set(["/api/report", "/api/goal", "/api/learning/stats"])`
- 保留：dashboard / api/dashboard/** / login / reset-password / auth/callback / _next / __nextjs

回归实测（Stage 1→2→auth）：

| 路由 | 改前 | 改后（demo+supabase） | 改后（supabase auth 无 session） |
|---|---|---|---|
| /report | 404 | 200 | 200 |
| /api/report | 404 | 500（见 §4 归因） | 401 AUTH_ERROR |
| /api/goal | 404 | 200 | 401 |
| /api/learning/stats | 404 | 500（22P02 同因） | 401 |
| /dashboard | 200 | 200 | 200 |
| /api/dashboard?range=7d | 403（demo 非白名单，fail-closed 基线） | 403 | 401 |
| /learn | 404 | 404 | 404（学习功能保持隔离 ✓） |

## 3. Phase B/C — Supabase E2E 失败分类（只读实测证据）

用 anon key（= createServerClient 无 session 真实路径）+ service-role 复刻仓库精确查询，**正确检查 res.error**（supabase-js v2 对 PostgREST 错误不抛异常）：

| 查询（仓库对应） | 结果 | 分类 |
|---|---|---|
| `learning_items .eq("canonical_key",…)`（findItemByNormalizedTerm） | **42703 column does not exist** | MISSING_COLUMN |
| `learning_items select canonical_key`（列探测） | **42703 column does not exist** | MISSING_COLUMN（双证实） |
| `speaking_evaluations .select("*")`（evalRepo.getAll） | **PGRST205 Could not find the table 'public.speaking_evaluations' in the schema cache** | MISSING_TABLE |
| `user_item_states/learning_events/speaking_sessions/ability_observations .eq("user_id","demo-user-001")` | **22P02 invalid input syntax for type uuid** | APPLICATION_ERROR（demo 身份 vs uuid 列） |
| `speaking_sessions .order("created_at")` | OK（无错误） | — |
| `ability_observations .order("created_at")` | OK | — |
| 全部 8 张报告链路表存在性 | speaking_evaluations 缺失，其余存在 | — |
| users | 5 行（uuid） | — |
| learning_items | 2 行（take something for granted / sustainable），normalized_term 均 NULL | — |

HTTP 层证据：
- `/api/report`（middleware 改前）→ 404 = ROUTE_404
- `/api/report`（demo+supabase，改后）→ 500，根因 = 22P02（聚合先于 eval 抛错）；生产 supabase 真实用户（uuid）不会触发 22P02，下一步即 PGRST205
- `/api/report`（supabase auth 无 session）→ 401 = AUTH_ERROR（合法）

## 4. Phase 5 — speaking_evaluations 缺表降级（严格限定）

`app/api/report/route.ts`：将 `evalRepo.getAll(user.id)` 包入 try/catch，仅当 `isSpeakingEvaluationsMissingError(err)`（code ∈ {PGRST205, 42P01} 且 message 含 `speaking_evaluations`）→ `evaluations=[]` + `speakingEvaluationsStatus="NOT_INSTRUMENTED"` + `fallback.triggered` 埋点；其余错误 rethrow（auth/RLS/network/未知一律 fail loudly）。

新增 `lib/evaluation/missing-table.ts`（纯函数）+ `tests/unit/report-eval-degradation.test.ts`（6 用例：命中 2 / 异表 42P01 拒绝 / auth 拒绝 / network 拒绝 / 非对象拒绝 / 缺 message 拒绝）。

行为：缺表时 Learning Report 仍诚实返回词汇/复习/口语会话等真实指标，口语评估部分显示 NOT_INSTRUMENTED；不再整页 500。

## 5. Phase 7 — Migration Ledger Audit

| 类别 | 内容 |
|---|---|
| ACTIVE_MIGRATIONS（本地） | 0001_init_schema、0002_rls_policies、0003_user_secrets、0004_repository_columns、0005_account_profile、0006_storage_avatars、0007_wechat_login_states、0008_data_model_consistency、0010_application_evidence |
| DEFERRED_MIGRATIONS | `docs/deferred/supabase/0009_p6_instrumentation.sql`（p6 instrumentation；manifest SHA256 9886F65E…；DO_NOT_APPLY_AUTOMATICALLY） |
| MISSING_LOCAL_MIGRATIONS | supabase/migrations 中 0009 为空槽（0008 → 0010） |
| NUMBERING_CONFLICTS | `0009` 曾被两个不同文件先后占用：`0009_lexical_canonical_key.sql`（git 史）与 `0009_p6_instrumentation.sql`（deferred）；**下一个安全编号 = 0011** |
| REMOTE_APPLIED_STATE | 无 schema_migrations 追踪（PRODUCTION-PERSISTENCE-01）；远程实际：speaking_evaluations 缺、canonical_key 缺 |

**0009_lexical_canonical_key.sql 之谜 → 判定：C（被显式 revert/排除，可从 git 历史恢复）**
- `010a4f1`（fix(eval-035-final)）：创建该 migration（backfill + 变体重写 + NOT NULL + 唯一仲裁索引）
- `bf2a35f` / `7ffdfa4`（revert(035-merge-ready): exclude gated supabase migration work from integration branch）：从集成分支删除
- 结论：文件非「丢失」、非「从未提交」、非「被替代」——是**刻意排除的 gated migration**；代码（item-id.ts 注释、SupabaseLearningRepository）仍引用 canonical_key，形成本分支 schema gap。已按 0011 恢复（见 §6）。

## 6. Phase 8/9 — Schema Recovery Pack

产物：
1. `docs/product/REMOTE_SCHEMA_RECOVERY_PLAN.md` —— speaking_evaluations（本地 canonical = 0008 §3，不复制第二份）+ canonical_key（0011，恢复自被 revert 的 0009）+ 迁移顺序 + 部署后验证
2. `supabase/migrations/0011_canonical_key.sql` —— additive migration（add column → backfill `lower(coalesce(nullif(normalized_term,''), canonical_form))` → 三变体重写 → NOT NULL → 唯一仲裁索引）
   - backfill 来源确定性：canonicalKey() 对未登记输入 = 小写/trim/合并空格；已登记变体仅 3 条（与 LEXICAL_VARIANTS 冻结一致）
   - 数据安全：远程 learning_items 仅 2 行且形态互异 → 无冲突；部署前仍需 Human Gate 复检唯一索引冲突
   - **REMOTE_DDL_DEPLOYMENT: BLOCKED** —— 本任务未执行任何远程 DDL

## 7. 验证

- 路由/API 回归：见 §2 表（真实 dev server + curl）
- 单测：`tests/unit/report-eval-degradation.test.ts`（新增）
- typecheck / full unit / next build：见 commit 信息
- Dashboard 回归：/dashboard 200、/api/dashboard 行为与基线一致（未因白名单改动而变化）

## 8. 数据诚实性

- 远程无真实学习活动 → 页面将显示 0/insufficient/暂无学习记录 = HONEST_EMPTY_STATE，不算失败
- 未插入任何 fake 指标、未启用 memory demo seed 冒充生产数据、未硬编码数字
- `REPORT_DATA_READY: BLOCKED` 由「无真实学习数据」导致，需通过真实 Learn/Review/Speaking 流程产生（未来独立任务）

## 9. Checkpoint Commit

```
（commit hash 与验证结果见 git log）
```
- 仅 stage：middleware.ts、app/api/report/route.ts、lib/evaluation/missing-table.ts、supabase/migrations/0011_canonical_key.sql、docs/audits/LEARNING-REPORT-ONLINE-02.md、docs/product/REMOTE_SCHEMA_RECOVERY_PLAN.md、tests/unit/report-eval-degradation.test.ts
- 未 stage 并发 Agent 的任何文件；临时脚本（_lr02_*）已删除

## 10. 遗留与下一步（Control Plane 决策点）

| 项 | 状态 | 决策 |
|---|---|---|
| REMOTE_DDL_CHANNEL | BLOCKED | A/B/C 选择（见任务 §17）：channel READY → 受控部署任务；否则 Control Plane 决策 |
| speaking_evaluations | MISSING | 部署恢复包 §2.1 后 → REPORT_SCHEMA_READY 前进一步 |
| canonical_key | MISSING | 部署恢复包 §2.2 后 → supabase LEARN 写路径解锁 |
| 真实数据 | 0 行 | 真实产品流程产生数据 → REPORT_DATA_READY |
| 22P02（demo+supabase） | 配置组合 | 不在本任务修复范围（生产 supabase 真实用户不受影响）；如需 demo 模式读远程，需另行决策 demo 身份映射 |
