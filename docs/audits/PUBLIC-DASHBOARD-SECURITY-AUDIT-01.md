# PUBLIC-DASHBOARD-SECURITY-AUDIT-01

> 公网 dashboard-only 部署安全暴露审计（面试作品级，只读）
> 目标：`https://ielts-practice-data.vercel.app`（dashboard-only 部署）
> 代码库：`D:\Codex\IELTS-practice`（branch `repo/arch-consolidate`）
> 模式：READ-ONLY。未修改代码 / schema / RLS / Vercel；未删除账号；未创建 migration；未 push commit。
> 日期：2026-09-13

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| SAFE_TO_KEEP_PUBLIC | **CONDITIONAL**（条件：Vercel 线上 `AUTH_MODE=supabase` 且 `DASHBOARD_ALLOWED_EMAILS` 已配置；该状态从代码仓库无法证实，线上 UNKNOWN） |
| P0 | 0（当前无直接可利用的公网数据泄露） |
| P1 | 2（① 白名单内唯一无鉴权 API：`/api/dashboard/traces/[traceId]`；② 线上 AUTH_MODE/allowlist 状态未知，若为 demo 模式则看板全量数据公开） |
| P2 | 5（auth/callback open redirect、500 原始错误回传、wechat_login_states 无 RLS 遗留、CSP unsafe-eval/inline、被 404 路由缺纵深防御） |
| 亮点 | middleware 白名单 404 隔离 + 全路由服务端鉴权 + 严格 RLS + 统一登录错误文案 + 无硬编码密钥 |

---

## A. ROUTE EXPOSURE（路由暴露面）

### A.1 middleware 白名单（唯一公网暴露面）

`middleware.ts` 无条件执行 dashboard-only 隔离（非分支开关）：

- 精确放行：`/`、`/dashboard`、`/login`、`/reset-password`、`/auth/callback`、`/report`
- API 精确放行：`/api/report`、`/api/goal`、`/api/learning/stats`
- 前缀放行：`/api/dashboard`（含 bad-cases / lifecycle / modules / traces 子路由）、`/_next/`、`/__nextjs`
- **其余一切路径直接返回 404**（无 redirect、无信息泄漏）
- 安全头：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`X-XSS-Protection`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`、生产 CSP（`frame-ancestors 'none'`）

`next.config` 另有 `beforeFiles` rewrite：`/` → `/dashboard`（根路径直接展示看板，不渲染消费级首页）。

### A.2 路由分类表

| 路由 | 白名单 | 状态 | 鉴权 |
|---|---|---|---|
| `/dashboard` | ✅ | PUBLIC_EXPECTED | ✅ 服务端 layout guard（`requireDashboardAccess`，401→登录页 / 403→无权限页） |
| `/login` | ✅ | PUBLIC_EXPECTED | 登录页（邮箱+密码，统一错误文案） |
| `/reset-password` | ✅ | PUBLIC_EXPECTED | recovery hash 内联流程 |
| `/auth/callback` | ✅ | PUBLIC_EXPECTED | Supabase code exchange（见 F） |
| `/report` | ✅ | AUTH_REQUIRED | 客户端页面，数据源 `/api/report`（服务端 requireUser） |
| `/api/dashboard` | ✅ | ADMIN_ONLY | `requireDashboardAccess`（email allowlist，fail-closed） |
| `/api/dashboard/bad-cases` `/lifecycle/[stageId]` `/modules/[moduleId]` | ✅ | ADMIN_ONLY | `requireDashboardAccess`（已确认调用） |
| `/api/dashboard/traces/[traceId]` | ✅ | **ACCIDENTALLY_EXPOSED** | **无鉴权（唯一白名单内裸路由）** — 见 P1-01 |
| `/api/report` `/api/goal` `/api/learning/stats` | ✅ | AUTH_REQUIRED | `requireUser`（session user.id 读取，无客户端 user_id 注入） |
| `/learn` `/review` `/speaking` `/goals` `/account` `/debug/traces` | ❌ | BLOCKED（404） | middleware 隔离 |
| `/api/today` `/api/agent/**` `/api/secrets/**` `/api/debug/**` `/api/ima/**` `/api/learn/**` `/api/review/**` `/api/speaking/**` `/api/account/**` `/api/ability/**` `/api/health/**` | ❌ | BLOCKED（404） | middleware 隔离（自身无鉴权，见 P2-05） |
| `/api/auth/wechat-login/**` `/api/auth/wechat-bridge` | ❌ | BLOCKED（404） | middleware 隔离 |

> 注：`isDashboardOnlyAllowed` 用 `startsWith("/api/dashboard")` 判断，`/api/dashboard-evil` 之类路径也会通过白名单，但 app 内无此路由，最终仍 404，不可利用（记录备查）。

---

## B. SUPABASE RLS

### B.1 用户业务表（migration 0002）— 严格

| 表 | RLS | Policy |
|---|---|---|
| `users` | ✅ enabled | select/update own（`auth.uid() = id`）；insert 由 SECURITY DEFINER 触发器 |
| `learning_items` | ✅ enabled | 仅 `authenticated` SELECT（公共内容池，合理） |
| `user_item_states` / `learning_events` / `speaking_sessions` / `ability_observations` / `recommendations` | ✅ enabled | 全部 `auth.uid() = user_id` 自有读写；learning_events 无 UPDATE/DELETE |
| `user_secrets`（0003） | ✅ enabled | **无任何客户端 policy** → anon/authenticated 被拒，仅 service_role 可访问（正确做法） |

结论：**业务表 RLS 设计正确，无 anon 访问，authenticated 不可跨用户读**。远程实际生效状态受 PRODUCTION-PERSISTENCE-01 记录的 schema drift 影响（remote 为手工/选择性部署），但从 migration 声明层面无过宽策略。

### B.2 `wechat_login_states`（0007）— 重点核查

| 检查项 | 结论 |
|---|---|
| 1. dashboard-only 是否有代码引用 | **NO**。仅 `lib/auth/wechat-*.ts` 与 `api/auth/wechat-login/*`、`api/auth/wechat-bridge` 引用，**全部被 middleware 404 隔离** |
| 2. anon key 是否能访问 | **是（表级）**。该表 **RLS disabled**（migration 注释："仅 service_role 访问"——但 RLS 关闭 + Supabase 默认 public grant 意味着持 anon key 者可对表做读写）。实际 exploit 需知道 `state` 主键（高熵随机值，猜测不可行） |
| 3. 是否包含敏感字段 | **是**。`session_json jsonb`（确认后写入完整 Supabase Session，含 access/refresh token）、`state`、`status`、`expires_at` |
| 4. RLS disabled 是否构成当前公网真实风险 | **否（当前）**。路由 404 + 主键高熵 + 无任何页面泄露 state → 当前无利用路径 |
| 5. 处置建议 | **DEFER（遗留卫生项）**：微信登录若已废弃 → 后续 `DELETE_LATER`（连同 0007 表/函数）；若保留 → 应补 RLS（`service_role` 天然绕过 RLS，不影响现有调用） |

---

## C. AUTH SECURITY

| 检查项 | 结论 |
|---|---|
| Session cookie | Supabase SSR cookie；callback 设置 `sameSite=lax` + `secure:true`；服务端 `auth.getUser()` 逐请求校验 |
| SSR auth validation | ✅ `getCurrentUser()` 优先真实 Supabase session；失败仅当 `AUTH_MODE=demo` 才回退固定 DEMO_USER（见 P1-02 风险） |
| Allowlist enforcement | ✅ `authorizeDashboardViewer`：`DASHBOARD_ALLOWED_EMAILS` 未配置 → **fail-closed**（仅 demo 模式放行 demo 用户）；配置后小写精确比对 |
| Client-side only guards | 无数据级 client-only guard；`/dashboard` 由服务端 layout guard 把关，数据 API 全部服务端鉴权 |
| 401/403 语义 | `AppError` 分类：AUTH_REQUIRED→401 `{error:"unauthorized"}`；FORBIDDEN→403 `{error:"forbidden"}`；dashboard layout 将 401 渲染登录页、403 渲染无权限页 |
| Account enumeration | ✅ `/login` 冻结统一文案"邮箱或密码错误"；忘记密码统一"如果该邮箱存在…"——不区分账号是否存在 |
| Stale session | Supabase auth 自动 refresh；服务端 getUser 每次校验 JWT |
| Open redirect | ⚠️ `/auth/callback` 的 `next` 参数（见 F / P2-01） |

---

## D. ENV / SECRETS

| 检查项 | 结论 |
|---|---|
| Git tracked env | ✅ 仅 `.env.example`（无 `.env.local`、无真实值） |
| 源码硬编码密钥 | ✅ 未发现（sk-* / AIza* 模式扫描为空） |
| Service role key | ✅ `SUPABASE_SERVICE_ROLE_KEY` 仅服务端（`lib/db/server.ts` + `lib/env.ts`），**无 NEXT_PUBLIC_ 前缀，无客户端引用**（components 扫描 SERVICE_ROLE 为空） |
| NEXT_PUBLIC_* 集合 | ✅ 仅 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_APP_URL`（均为公网安全项）；仓库内存在单测断言"无 NEXT_PUBLIC_*_API_KEY / *_SECRET" |
| Debug logs | ✅ 未发现会输出密钥的日志语句（trace 日志只记 traceId/错误消息） |
| Build output | 常规 Vercel SSR 构建，无静态导出 secrets 风险 |

---

## E. API DATA LEAKAGE

| 检查项 | 结论 |
|---|---|
| user_id 参数可否任意替换 | ✅ 否。白名单 API（report/goal/learning/stats/dashboard）全部从 session 取 `user.id`，无客户端 user_id/email 参数 |
| 是否依赖客户端传入 user | ✅ 否，服务端 session 权威 |
| Cross-user data read | ✅ 经 API 不可行（session 隔离 + RLS 双层）。⚠️ 唯一例外：`AUTH_MODE=demo` 时所有访客共享 DEMO_USER 身份（见 P1-02） |
| Raw PostgREST error leakage | ⚠️ `/api/dashboard` 500 分支回传 `e.message`（如 "relation speaking_evaluations does not exist"）；`/api/dashboard/traces/[traceId]` 404 分支同样回传原始消息 → 轻微 schema/表名泄漏（P2-02） |
| Stack trace | ✅ 不返回（toAppError 规范化，AppError payload 仅 kind/message/trace_id/details） |
| SQL/schema 泄漏 | ⚠️ 同 error message 项（P2-02），其余 API 经 toAppError 收敛 |

---

## F. CORS / REDIRECT / CALLBACK

| 检查项 | 结论 |
|---|---|
| CORS | ✅ 全仓无 `Access-Control-Allow-Origin` 头 → 默认同源策略，浏览器不可跨站读取 |
| Callback `next` 参数 | ⚠️ **P2-01 open redirect**：`const redirectUrl = new URL(next, origin)` 未校验 same-origin；`next=https://evil.com` 时成功登录后跳转到外部站。实际利用需有效 code（Supabase code 与链接绑定），直接危害低，但属经典反模式，一行校验可修 |
| Reset-password redirect | ✅ 内部页（recovery hash 内联 setSession → updateUser → signOut），无开放跳转；`resetPasswordForEmail` 的 `redirectTo` **硬编码** `https://ielts-practice-data.vercel.app/reset-password`（P2-04：换域名部署会失效，且暴露公网主机名——后者本身已是公开信息） |
| Site URL assumption | ⚠️ 同上硬编码 host；Supabase 侧需配置 Site URL = 该域名 |
| Vercel preview host | middleware 在 preview 环境同样生效（同一代码）→ preview 与生产暴露面一致，无额外风险 |

---

## G. SECURITY PRIORITY（发现分级）

### P0 — 当前公网必须立即修
**无。**

### P1 — 面试上线前应该修

**P1-01：`/api/dashboard/traces/[traceId]` 白名单内无鉴权**
- 证据：`app/api/dashboard/traces/[traceId]/route.ts` 直接 `new RealDashboardRepository().getTrace(traceId)`，无 `requireDashboardAccess`（bad-cases/lifecycle/modules 均有）。
- 当前影响：`getTrace` 无条件 throw "Trace 未持久化（P6）" → 恒 404，**无数据泄露**。
- 潜在影响：该路由是白名单内唯一无鉴权路由；一旦 0009 部署 + SupabaseTraceStore 接线（trace detail 含请求/响应体、用户口语答案），该路由即成为未授权读取口。
- 修复：加 `await requireDashboardAccess()`（一行），或从白名单移除（若前端未使用）。

**P1-02：线上 AUTH_MODE / DASHBOARD_ALLOWED_EMAILS 状态 UNKNOWN**
- 证据：`lib/env.ts` 默认 `AUTH_MODE=demo`、`DATA_PROVIDER=memory`；`getCurrentUser` 在 demo 模式下对**任何未登录访客**注入固定 DEMO_USER；`authorizeDashboardViewer` 在 allowlist 未配置时**放行 demo 用户**（fail-closed 的 demo 例外）。历史文档（DASHBOARD-ONLINE-FINAL-ACCEPTANCE-01）明确：Vercel env 线上 UNKNOWN。
- 场景推演：若 Vercel 线上为 `AUTH_MODE=demo`（或 allowlist 未设置）→ **任何访客** 均可通过 `/api/dashboard` 获取全量聚合看板；若同时 `DATA_PROVIDER=supabase`，则暴露的是 service-role 读到的**所有真实用户学习数据**。
- 处置：上线前必须由用户在 Vercel 面板确认 `AUTH_MODE=supabase` + `DASHBOARD_ALLOWED_EMAILS` 已设置（本审计无 Vercel 只读通道，无法验证）。此为 CONDITIONAL 结论的判定依据。

### P2 — 可延后

**P2-01：auth/callback open redirect**（见 F）。建议校验 `next` 以 `/` 开头且非 `//`。

**P2-02：500/404 原始错误消息回传客户端**（`/api/dashboard` 500、`/api/dashboard/traces/*` 404）。泄漏表名/schema 片段。建议统一 `toAppError` 或脱敏。

**P2-03：`wechat_login_states` RLS disabled + 存 session token**（见 B.2）。当前无利用路径，微信登录废弃后随 0007 删除；保留则补 RLS。

**P2-04：`redirectTo` 硬编码公网域名**（login route）。换域名部署即失效；建议改用 `NEXT_PUBLIC_APP_URL` 动态拼接。

**P2-05：非白名单路由缺纵深防御（route 级鉴权）**
- `api/secrets`、`api/agent/message`、`api/debug/traces`、`api/account/profile`、`api/ima/list` 等**自身无 requireUser**，仅靠 middleware 404 保护。
- 其中 `api/secrets`（GET 返回解密后的用户明文 API Key）若 middleware 被改/旁路，demo 模式下任何访客可读到 demo 用户下他人存的 Key → 设计上应加 `requireUser`（secrets/profile 已有 `getCurrentUser` + null→401，仅差 require 语义）。
- 对当前 dashboard-only 部署：不可达，风险为潜在项。

**P2-06：CSP 含 `script-src 'unsafe-eval' 'unsafe-inline'`**。Next.js SSR 常见妥协，非漏洞，但削弱 CSP 防御；若后续可收紧（nonce 化）建议做。

### NO_ISSUE（已核查无问题）
- 白名单页/API 服务端鉴权全覆盖（除 P1-01）；dashboard allowlist fail-closed。
- 业务表 RLS 严格自有数据；user_secrets 服务端专用。
- 无 CORS 跨站读取；无客户端 service-role；无 NEXT_PUBLIC 密钥；无硬编码密钥；无账号枚举。
- 安全响应头齐全（nosniff / frame DENY / referrer / permissions / CSP frame-ancestors）。

---

## FINAL SUMMARY

```text
PUBLIC_SECURITY_AUDIT_STATUS: COMPLETE
P0: 0
P1: 2
P2: 6
WECHAT_LOGIN_STATES:
  RLS_STATUS: DISABLED
  CURRENTLY_REFERENCED: NO (仅 wechat auth 模块, 全部被 middleware 404 隔离)
  ANON_ACCESS: 表级可达(RLS 关闭+默认 grant), 需知 state 主键, 当前无利用路径
  SENSITIVE_DATA: YES (session_json 含 access/refresh token)
  RECOMMENDATION: DEFER / DELETE_LATER (微信登录废弃后随 0007 删除; 保留则补 RLS)
AUTH_BOUNDARY: 服务端 Supabase SSR session + requireUser + requireDashboardAccess(email allowlist, fail-closed); 401/403 语义清晰; 无账号枚举; 唯一缺口: traces/[traceId] 无鉴权(P1-01) + demo 模式共享身份(P1-02)
API_BOUNDARY: 白名单 API 全部 session user.id 服务端读取, 无客户端 user_id 注入, 无 cross-user read(经 API); 错误消息轻微泄漏 schema(P2-02)
SECRET_EXPOSURE: NONE (无硬编码密钥; service-role 仅服务端; NEXT_PUBLIC_* 仅 URL/anon key/APP_URL; .env 仅 example 被 track)
OPEN_REDIRECT: auth/callback next 参数未校验 same-origin(P2-01, 需有效 code 才可利用)
CROSS_USER_RISK: LOW (RLS + session 双层; 例外: AUTH_MODE=demo 时所有访客共享 demo 身份)
SAFE_TO_KEEP_PUBLIC: CONDITIONAL
  - 满足条件(推荐): Vercel 线上 AUTH_MODE=supabase + DASHBOARD_ALLOWED_EMAILS 已配置 → 可放心放简历
  - 否则: AUTH_MODE=demo 或 allowlist 未设 → 全量看板公开, 上线前必须处理
  - 同时建议: 上线前顺手修 P1-01(traces 加鉴权)
RECOMMENDED_FIX_TASKS:
  1. [P1-01] app/api/dashboard/traces/[traceId]/route.ts 增加 requireDashboardAccess
  2. [P1-02] Vercel 面板确认 AUTH_MODE=supabase + DASHBOARD_ALLOWED_EMAILS (用户操作, 仓库无法验证)
  3. [P2-01] auth/callback 校验 next 为站内相对路径
  4. [P2-02] dashboard 500 / traces 404 错误消息脱敏
  5. [P2-04] redirectTo 改用 NEXT_PUBLIC_APP_URL
  6. [P2-03] wechat_login_states 补 RLS 或随 0007 删除
  7. [P2-05] 非白名单敏感路由(secrets/agent/debug/profile)补 requireUser 纵深防御
```

---

## 附注

- 审计依据：本地代码库 canonical（middleware.ts、app/ 全路由、lib/auth/*、lib/db/server.ts、lib/dashboard/real-repository.ts、supabase/migrations 0002/0003/0007、.env.example、next.config、docs 部署记录）。远程 Supabase RLS 实际生效状态与 Vercel env 无只读核查通道，结论基于 migration 声明 + 历史 drift 记录（PRODUCTION-PERSISTENCE-01）。
- 本审计执行期间发现仓库存在**预先存在的本地改动**（`components/report/next-step.tsx`、`report-page.tsx`、`two-hands.tsx` 已修改；`_lro_patch.py`、`_tmp_preflight.js` 未跟踪）。非本审计产生，未触碰、未提交。
- 未执行任何写操作与 git 操作。
