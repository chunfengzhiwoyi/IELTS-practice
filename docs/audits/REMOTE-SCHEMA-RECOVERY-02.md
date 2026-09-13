# REMOTE-SCHEMA-RECOVERY-02 — LEARN 写路径 + 认证报告验收

> 任务：REMOTE-SCHEMA-RECOVERY-02（RSR-01 schema 部署后的直接后续）
> 日期：2026-09-13 ｜ Agent：豆包b ｜ Branch：dashboard-only @ d218459
> 状态：**COMPLETE** — LEARN 写路径 PASS、authenticated /api/report 200、/report PASS、dashboard 回归 PASS

## 0. 结论速览

```
LEARNING_ITEMS_WRITE_CLIENT: SERVICE_ROLE（server-side controlled，架构即 §6/§7 推荐形态）
RLS_ROOT_CAUSE:              学习词典仅开放 SELECT 给认证用户（0002 设计），42501 是预期行为
FIX:                         NONE REQUIRED（不开放 authenticated INSERT；用户状态/事件走 authenticated RLS）
LEARN_WRITE_PATH:            PASS（13/13 E2E）
CANONICAL_KEY:               PASS（createOrGetItem 幂等 + canonical_key 正确 + 无重复）
CREATE_OR_GET_IDEMPOTENCY:   PASS
EVALUATION_WRITE_PATH:       PASS（save/read/ownership）
REPORT_API:                  PASS（authenticated 200）
REPORT_PAGE:                 PASS（真实数据渲染，截图 rsr02-report-page.png）
REPORT_DATA_STATE:           HONEST_REAL（1 词条/1 复习/1 评价 来自探针事件，已清理）
DASHBOARD_REGRESSION:        PASS（403 非 admin / 401 无会话 / 路由不变）
TEST_DATA_CLEANUP:           PASS（8 probe 用户 + 全部探针行删除；2 原始条目完好；users=5）
SECURITY_DEBT:               WECHAT_LOGIN_STATES_RLS_DISABLED（只记录，未触碰）
TESTS:                       e2e 13/13 + tsc + build + focused unit
CHECKPOINT_COMMIT:           （见 git log）
NEXT:                        CONTROL_PLANE_DECISION
```

## 1. 真实调用链与 client 归属（§3）

| 环节 | 证据 |
|---|---|
| LEARN 用户提交入口 | `app/api/learn/card/route.ts` L58 `requireUser(traceId)`（真实会话用户）；L144 `getLearningRepository()` |
| Repository factory | `lib/repository-factory.ts`：`DATA_PROVIDER=supabase` → `SupabaseLearningRepository`（单例） |
| 查询入口 | `findItemByNormalizedTerm`（L107-116）→ **`sb()`** = `createServerClient`（认证会话，RLS SELECT） |
| 创建入口 | `createOrGetItem`（L118-139）→ **`admin()`** = `createServiceRoleClient`（**SERVICE-ROLE upsert**，`onConflict:"canonical_key"`） |
| 用户状态/事件 | `upsertUserItemState`/`createLearningEvent`（L164-223）→ **`sb()`**（认证，RLS 强制 `auth.uid()=user_id`） |
| 评价写入 | `supabase-evaluation-repository.ts` save/getAll → **`sb()`**（认证，RLS insert_own/select_own） |

**判定：`LEARNING_ITEMS_WRITE_CLIENT = SERVICE_ROLE`（B）**。仓库自身设计注释（L6-18）即声明：learning_items 公共内容池仅开放 SELECT，写入由 service-role 完成。

## 2. RLS 诊断（§4/§5）

- `0002_rls_policies.sql`：`learning_items` 仅 `learning_items_select_all_authed`（authenticated SELECT）；**无 INSERT/UPDATE/DELETE policy** → 认证用户直接 INSERT 必然 42501（任务 §1 复现 = 预期行为）。
- `user_item_states`：uis_select/insert/update/delete_own（`auth.uid()=user_id`）✓
- `learning_events`：le_select/insert_own（append-only）✓
- `speaking_evaluations`：0008 §3 select/insert/update_own ✓
- **修复 = 无**。按 §4 安全规则未开放任何 INSERT policy（防共享词典污染/canonical_key poisoning）。§6/§7 推荐结构（server-only service-role 建词典 + 用户 UUID 来自会话写 own 数据）**已是当前实现**。
- 无产品代码改动；未新建第二套 secret/client framework；未引入 RPC（§8 不适用）。

## 3. LEARN 写路径 E2E（§9，真实 repository + 真实远程）

真实产品代码 `SupabaseLearningRepository` + 专用测试用户（admin createUser ×2）+ disposable term `__remote_recovery_probe_<ts>`：

| 用例 | 结果 |
|---|---|
| createOrGetItem → item created + canonical_key 正确 | PASS |
| createOrGetItem 重复调用 → 同一 id（幂等） | PASS |
| 同 key 无重复行（count=1） | PASS |
| RLS findItem（authenticated SELECT eq canonical_key）返回探针 item | PASS |
| user_item_states upsert（own row） | PASS |
| learning_events insert（own row） | PASS |
| speaking_evaluations upsert + read back（own row） | PASS |
| 跨用户归属：U2 读 U1 的 state/eval → 0 行 | PASS |
| 专用测试用户 + 真实 session | PASS |

**13/13 PASS**。期间修正 3 个探针数据问题（进程 env 注入、`next_review_at` NOT NULL、levels 0-2 约束）——均为探针形态问题，非产品缺陷。

## 4. EVALUATION 写路径（§10）

- schema 已部署（speaking_evaluations PRESENT，RLS enabled）
- 镜像 `evalRepo.save` upsert（`onConflict: user_id,session_id`）+ `getAll` 读回 + 跨用户拒绝 → **PASS**
- `speakingEvaluationsStatus` 在 /api/report 中为 **OK**（不再 NOT_INSTRUMENTED）

## 5. 认证 REPORT API（§11，HTTP 真实链路）

- 启动 dev server（AUTH_MODE=supabase）→ 浏览器真实登录 U1（邮箱+密码）→ 跳转 /dashboard
- 页面同源 fetch（携带真实会话 cookie）：

| 端点 | 状态 | 内容 |
|---|---|---|
| `/api/report` | **200** | `speakingEvaluationsStatus:"OK"`；`evaluations` 含 U1 真实评价；recommendations: REVIEW（1 词条 24h 到期）+ LEARN_NEW（词库仅 1 条） |
| `/api/goal` | **200** | profile 返回；`persisted:false, storage:"memory", durable:false`（Goal 未接 Supabase——既有边界，诚实标记非 durable） |
| `/api/learning/stats` | **200** | learnedCount 1 / masteredCount 1 / weeklyAccuracy 100 / streak 1 / speakingIdleDays null |

- 备注：手工 cookie 构造失败（@supabase/ssr v0.5.2 需 `base64-` 前缀 + storage key 细节），改用真实浏览器登录完成验收——更贴近产品路径，证据更硬。

## 6. REPORT 页面（§12）

- `/report` 200，渲染：备考目标（尚未设定）、已收下 1 个表达、本期 9/7-9/13（新收 0/复习 1 次/活跃 1 天）、能力画像（词汇 1 个表达/复习 1 次/待复习 1；口语 0/2 训练）、AI 诊断（0/2 次训练，无 NOT_INSTRUMENTED）、下一步行动（学一个新表达）、学习记录（共 1 条）。
- 截图：`docs/audits/rsr02-report-page.png`。
- 观察项（非本任务范围）：词汇正确率显示 "10000%"（1/1=100% 的展示格式化 bug，预存在）；口语"已完成 0/2 次训练"按 speaking_sessions 计数（探针评价不计入，符合设计）。

## 7. READINESS MATRIX（§16）

| 维度 | 结果 |
|---|---|
| REPORT_UI_READY | PASS |
| REPORT_ROUTE_READY | PASS |
| REPORT_API_READY | PASS（authenticated 200） |
| REPORT_SCHEMA_READY | PASS |
| REPORT_DATA_READY | PASS_WITH_HONEST_REAL（有真实数据但源自探针已清理；正式数据需真实产品流程） |
| SPEAKING_EVALUATIONS | PRESENT + verified |
| CANONICAL_KEY | PRESENT + verified |
| REMOTE_DDL_CHANNEL | USER_SQL_EDITOR（RSR-01 已部署，本任务未新增 DDL） |
| DASHBOARD_REGRESSION | PASS |
| DEFERRED_0009 | UNTOUCHED |

## 8. Dashboard 回归（§13）

| 检查 | 结果 |
|---|---|
| /dashboard（无会话 / 登录后） | 200 / 200 |
| /api/dashboard?range=7d 无会话 | 401 |
| /api/dashboard?range=7d 非 admin（U1） | **403 forbidden**（授权正确） |
| /reset-password / /login | 200 / 200 |
| /learn | 404（仍屏蔽，dashboard-only 隔离保持） |
| /report / /api/report / /api/goal / /api/learning/stats | 均未重封（401 认证链 / 200 页面） |

## 9. 数据保全与清理（§15）

- 清理前基线：learning_items 2 行（e758048a…take something for granted / 5a478d95…sustainable）
- 清理：8 个 probe 用户（rsr2.owner/other.<ts>@ielts-practice.test）+ 全部探针 user_item_states / learning_events / speaking_evaluations / learning_items
- 清理后：learning_items 恰好 2 行（id/值不变）；users=5；speaking_evaluations=0；probe 残留=0
- **未删除任何真实用户数据；未动 2 个 canonical items**

## 10. SECURITY DEBT（§14，只记录）

```
SECURITY_DEBT: WECHAT_LOGIN_STATES_RLS_DISABLED（Supabase advisory CRITICAL）
处置：独立安全任务处理（无 policy 前不得 ENABLE RLS，避免破坏微信登录状态交换）
未在本任务触碰。
```

## 11. 遗留 / 后续（控制面决策）

1. **正式真实数据**：REPORT_DATA_READY=PASS_WITH_HONEST_REAL。线上面试展示需真实产品流程（Learn/Review/Speaking）产生数据——独立任务。
2. **Goal 持久化**：/api/goal 返回 memory fallback + `durable:false`（PRODUCT-LOOP-02B 边界），Supabase Goal 持久化属未做项，不阻塞本任务。
3. **Auth URL / Vercel env**：Site URL=https://ielts-practice-data.vercel.app、Redirect /reset-password 需用户在 Supabase Dashboard 配置；Vercel 线上 env（DASHBOARD_ALLOWED_EMAILS / NEXT_PUBLIC_APP_URL）需用户确认——`USER_ACTION_REQUIRED`，不阻塞 schema/写路径结论。
4. **展示 bug**：词汇正确率 10000%（预存在）——可后续修复，非本任务。
