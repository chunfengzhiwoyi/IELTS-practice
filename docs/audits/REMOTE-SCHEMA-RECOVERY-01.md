# REMOTE-SCHEMA-RECOVERY-01 — 远程 Schema 恢复（执行包）

> 任务：REMOTE-SCHEMA-RECOVERY-01（LEARNING-REPORT-ONLINE-02 直接后续）
> 日期：2026-09-13 ｜ Agent：豆包b ｜ Branch：dashboard-only @ 2a9092e
> 状态：**PREFLIGHT COMPLETE → USER_DDL_ACTION_REQUIRED（等待用户执行 SQL）**

## 0. 状态速览

```
REMOTE_SCHEMA_RECOVERY_01_STATUS: WAITING_FOR_USER_DDL
DDL_CHANNEL:                       USER_SQL_EDITOR（Agent 无 CLI/token/URL 通道）
SPEAKING_EVALUATIONS:              MISSING（待部署 A 段）
CANONICAL_KEY:                     MISSING（待部署 B 段）
DATA_PRESERVATION:                 BASELINE_RECORDED（2 行，变更前快照已存）
LEARN_WRITE_PATH:                  PENDING（部署后执行）
EVALUATION_WRITE_PATH:             PENDING（部署后执行）
REPORT_API:                        PENDING（部署后需真实登录用户）
REPORT_PAGE:                       PENDING（部署后验证）
DASHBOARD_AUTH:                    VERIFIED_AT_2a9092e（dfe2793 Auth V2 已提交，/dashboard 200）
PASSWORD_RECOVERY:                 USER_ACTION_REQUIRED（Supabase Site/Redirect URL 需用户在 Dashboard 配置）
VERCEL_ENV:                        UNKNOWN（本地 .env.local 已配，线上环境无法远程只读核验）
DEFERRED_0009:                     UNTOUCHED
CHECKPOINT_COMMIT:                 （本任务文档提交，见 git log）
NEXT:                              用户在 SQL Editor 执行 docs/audits/REMOTE-SCHEMA-RECOVERY-01-deploy.sql 后告知
```

## 1. Canonical 状态核验

- HEAD = `2a9092e`（LEARNING-REPORT-ONLINE-02 checkpoint）✓ 无 CONTEXT_DRIFT
- 2a9092e 内容完好：middleware allowlist（/report、/api/report、/api/goal、/api/learning/stats）仍在；eval 降级、0011_canonical_key.sql、审计文档均存在
- 工作树仅剩其他 Agent 的未跟踪 `tests/unit/dashboard-login-v10-handoff.zip`（不属本任务）
- **不重新封 /report**：dfe2793 时点的 404 是历史状态，已由 2a9092e 解除

## 2. 安全扫描（§2）

- 方法：git ls-files（751 个 tracked 文件，排除 .env.local/.env/node_modules）正则扫描
- 模式：service role key 值、私有密钥块、GitHub/Slack/OpenAI 风格 token、JWT 材料、access/refresh/recovery token 赋值、临时管理员密码
- 结果：**0 命中 → SECURITY_SECRET_LEAK: NO**，可继续 schema 部署准备

## 3. DDL 通道判定（§3）

| 通道 | 状态 |
|---|---|
| supabase CLI（npx） | 可用 v2.117.0，但 `~/.supabase` 无 access-token → **未登录** |
| DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL | ABSENT |
| SUPABASE_ACCESS_TOKEN / Management token | ABSENT |
| psql | 未安装 |
| 结论 | **Agent 无法自行执行 DDL → 采用任务 §3A：用户 SQL Editor 手工执行 canonical SQL** |

未使用：未知项目、权限绕过、RPC 后门、自动寻找其他 Supabase 项目。deferred 0009 保持 deferred。

## 4. 远程预检（§5/§6/§7，2026-09-13 实时复核，read-only service-role）

| 对象 | 预检结果 |
|---|---|
| `speaking_evaluations` 表 | **MISSING**（PGRST205 schema cache 未找到）→ 需部署 A 段 |
| `learning_items.canonical_key` 列 | **MISSING**（42703 column does not exist）→ 需部署 B 段 |
| `ability_observations` 表 | PRESENT（0 行）——无需额外 0008 内容 |
| `learning_items` | **2 行**（数据保全基线，见下） |
| `learning_events` / `speaking_sessions` | 0 行 |
| `users` | 5 行（真实用户，uuid id） |

### 数据保全基线（§7，变更前快照）

| PK (id) | item_type | canonical_form | normalized_term | created_at |
|---|---|---|---|---|
| e758048a-0dd3-49b7-b5e0-a02fb665fd95 | PHRASE | take something for granted | NULL | 2026-08-17T01:37:26.969626+00:00 |
| 5a478d95-5ffe-47c2-9ef4-2470cb40f2a5 | WORD | sustainable | NULL | 2026-08-17T01:37:26.969626+00:00 |

backfill 预期：两行 canonical_key = `take something for granted` / `sustainable`（normalized_term NULL → 回退 canonical_form，lower()；均不命中三变体注册表）。预期无冲突（2 个互异键）、无行丢失、无重复创建。

## 5. 用户执行包（§3A/§4/§16）

**文件：`docs/audits/REMOTE-SCHEMA-RECOVERY-01-deploy.sql`**

- A 段：`speaking_evaluations`（CREATE TABLE IF NOT EXISTS + RLS enable + select/insert/update policies + 2 索引）——canonical 0008 §3 逐字提取
- B 段：`learning_items.canonical_key`（add column + backfill + 三变体重写 + NOT NULL + 唯一仲裁索引）——canonical 0011 逐字
- 幂等（IF NOT EXISTS / DROP POLICY IF EXISTS），仅限目标项目 `nizjfakkmziwanxdcdxd`
- **不含** deferred 0009 任何内容

**用户操作**：Supabase Dashboard → SQL Editor → 选择项目 nizjfakkmziwanxdcdxd → 粘贴执行 → 告知。

## 6. 部署后验证计划（用户执行完成后执行）

1. **Schema 验证**：speaking_evaluations 存在 + 11 列齐全；canonical_key 存在
2. **数据保全比对**（vs §4 基线）：2 行仍在、PK 不变、canonical_key 已 backfill、无 null、唯一索引可用、无重复
3. **LEARN 写路径安全测试**：service-role 用 disposable term（前缀标记）走 findItemByNormalizedTerm / createOrGetItem → 验证 canonical_key 冲突行为 → **清理测试行**
4. **EVALUATION 写路径**：service-role 插入 + 读取 1 行测试 evaluation（标记 fixture）→ RLS ownership 语义 → **清理**
5. **REPORT API 重新鉴定**：AUTH_MODE=supabase + 真实登录用户（专用测试用户 via admin createUser + signIn，或现有用户）→ GET /api/report 目标 200，speakingEvaluationsStatus=OK；记录 HTTP status/repository result/聚合
6. **REPORT 页面**：真实登录用户 /report 加载、空数据 honest empty state、/api/goal、/api/learning/stats 正常
7. **Dashboard 回归**：/dashboard、登录、session 刷新、/api/dashboard 授权行为不变
8. **Auth URL 配置**：Site URL=https://ielts-practice-data.vercel.app、Redirect 含 /reset-password → 由用户在 Supabase Dashboard 配置并告知（当前 USER_ACTION_REQUIRED）
9. **Vercel 环境**：DASHBOARD_ALLOWED_EMAILS / NEXT_PUBLIC_APP_URL 线上状态 UNKNOWN（无 Vercel 只读通道），由用户确认或后续任务处理

## 7. 遗留决策点

| 项 | 状态 |
|---|---|
| REMOTE_DDL_DEPLOYMENT | **USER_DDL_ACTION_REQUIRED**（本任务不自行执行 DDL） |
| 真实登录测试用户 | 部署后按专用测试用户策略创建（admin createUser + 清理）或使用现有用户 |
| Auth URL / Vercel env | 用户侧配置确认 |
| REPORT_DATA_READY | 仍需真实学习活动（未来任务：真实 Learn/Review/Speaking 流程产生数据） |
