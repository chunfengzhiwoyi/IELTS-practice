# PRODUCTION-PERSISTENCE-01 — REMOTE SUPABASE EVIDENCE VERIFICATION

## 状态

**STATUS: BLOCKED（PREFLIGHT 阶段停止）** — 远程 Supabase 部署与验证无法在本任务内安全执行，存在两项 blocker。未部署 0010、未写入任何远程数据、未修改任何产品代码。

**PRODUCTION_PERSISTENCE_DECISION: REMOTE_APPLICATION_EVIDENCE_BLOCKED**

---

## 1. Canonical Preflight

- Repo: `D:\Codex\IELTS-practice`；Branch: `repo/arch-consolidate`
- HEAD: `25a41161c09a3ac840c87ac5ff235f1b6fb6655a`（= 任务卡 Required Base）
- Worktree: clean
- `PRODUCT_LOOP_04: COMPLETE`、`NEXT_GATE: PRODUCTION-PERSISTENCE-01-REMOTE-SUPABASE-EVIDENCE`（状态文件核对）✓

## 2. Secret Safety

- 全程未打印任何 secret value：未输出 anon key / service role key / API key / Authorization header 值 / 连接字符串密码。
- 仅显示：endpoint host、project ref（`nizjfakkmziwanxdcdxd`）、migration 编号、键名存在性（SET/ABSENT）。
- `.env.local` 未被 git tracked（git status 无该文件；详见 §10 复核）。

## 3. Remote Project 配置

| 项 | 值 |
|---|---|
| REMOTE_PROJECT_CONFIGURED | YES |
| PROJECT_REF | `nizjfakkmziwanxdcdxd` |
| NEXT_PUBLIC_SUPABASE_URL | SET |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | SET（normal client / RLS） |
| SUPABASE_SERVICE_ROLE_KEY | SET（admin CRUD） |
| DATABASE_URL / DB password | **ABSENT** |
| Supabase Management API token | **ABSENT** |
| supabase CLI | 未安装（npx 需下载被拒）、`~/.supabase` 无 access-token |

## 4. Connectivity Preflight（无副作用）

- DNS 解析 + HTTPS 端点：**可达**。
- `/auth/v1/health` → HTTP 401（未带 key 的预期响应；auth service 在线）
- `/rest/v1/` → HTTP 401（同上）
- service role 只读探测（limit=1）：可正常访问现有表 → 服务完全在线、凭据有效。
- **REMOTE_CONNECTIVITY: PASS**（远程项目真实可达，非 paused/deleted/NXDOMAIN）

## 5. Remote Schema Audit（只读，service role，limit=1 无副作用）

| 表（repo migration 定义） | 远程 | 判定 |
|---|---|---|
| public.users | 200（含 test-user-2026@example.com 等真实数据） | PRESENT |
| public.learning_items | 200（有数据） | PRESENT |
| public.user_item_states | 200 | PRESENT |
| public.learning_events | 200 | PRESENT |
| public.speaking_sessions | 200 | PRESENT |
| public.ability_observations | 200 | PRESENT |
| public.recommendations | 200 | PRESENT |
| public.user_secrets | 200 | PRESENT |
| public.wechat_login_states | 200（有记录） | PRESENT |
| public.speaking_evaluations（0008 定义） | **404 PGRST205** | **MISSING** |
| public.application_evidence（0010 定义） | **404 PGRST205** | **ABSENT**（0010 未部署） |
| supabase_migrations.schema_migrations | 404 | 无 CLI migration 追踪 |
| storage.objects | 404 | storage 未启用（0006 属 storage bucket，与本任务无关） |

**REMOTE_SCHEMA_DRIFT: YES** — 远程缺 `speaking_evaluations`（migration 0008 建表部分未应用），且无 `schema_migrations` 追踪表。远程 schema 与 repo migrations 已漂移；远程部署历史为手工/选择性应用（非整 migration 流水线），无法证明 0001–0008 在远程的完整真实状态。

## 6. Migration History Audit

- 无法枚举远程逐条 migration 状态（无 schema_migrations 表、无 linked project）。
- 可确认：0001 主要表存在；0008 的 `speaking_evaluations` 缺失 → 至少 0008 未完整应用。
- 0010 未被任何途径应用（application_evidence 404）。
- **结论**：远程 migration history 与 repo **漂移**，且无可靠追踪机制。

## 7. Blocker 1 — REMOTE_SCHEMA_DRIFT（任务卡 §8）

远程缺 0008 产物（speaking_evaluations），且无 migration 追踪。按任务卡 §8：「如果远程 migration history 与 repo 严重漂移：STOP。不要强推 0010。」在远程 0001–0008 真实状态未核实前，强推 0010 会加深 drift。

> 注：0010 本身只依赖 public.users(id) FK + auth.uid()（远程均已存在），不依赖 0008 / 0009。若 Control Plane 决定在 drift 存在下仍部署 0010，技术上可行，但必须先明确部署机制与 drift 处置策略。

## 8. Blocker 2 — DATABASE_DEPLOYMENT_CREDENTIAL_REQUIRED（任务卡 §9）

部署 0010（DDL）需要以下任一通道，当前全部缺失：

| 通道 | 现状 |
|---|---|
| psql / DATABASE_URL | 无 DB password / 连接字符串 |
| Supabase Management API（POST /v1/projects/{ref}/database/query） | 无 personal access token |
| supabase CLI `db push` | 未安装、未 link、未登录 |
| SQL Editor | 需用户在 Dashboard 手动执行（本任务无 GUI 授权） |

现有 anon key 只够 normal REST（RLS 内 CRUD，无 DDL）；service role key 只够 admin REST（绕过 RLS 的 CRUD，**同样无 DDL**——PostgREST 不提供 create table）。按任务卡 §9：不得通过 REST 绕过 DDL 权限 → **STOP**。

## 9. 为什么不能继续

- 无 DDL 通道 → 无法安全应用 0010；
- 远程已有真实数据（users/learning_items/wechat_login_states 等）→ 任何绕过式尝试都可能触碰生产数据，违反 §2 Critical Safety Rule；
- drift 未核实 → 即使获得通道，也需 Control Plane 先裁决 drift 处置。

**未执行**：0010 部署、insert/select/upsert/unique/RLS/derive/writeback/recompute 远程验证、任何写入/清理。**TEST_ROWS_CREATED: 0**。

## 10. 复核

- `git status --short`：clean（无 .env.local 被追踪）。
- 产品代码零修改（PRODUCT_RUNTIME_MODIFIED: NO）。
- 本地回归快速确认（04E focused + 04F coverage + 02-E2E + 02C）：93/93 PASS，无破坏。
- 未创建任何测试数据；未删除任何数据；未修改任何远程对象。

## 11. 所需输入（供 Control Plane 决策）

1. **部署机制选择**：提供 DATABASE_URL（psql/transactional）或 Supabase Management API token（可编程 DDL）或明确授权「SQL Editor 人工粘贴 + 记录」。
2. **drift 处置裁决**：远程缺 speaking_evaluations（0008 部分未应用）如何处理——补 0008？还是接受 drift 仅补 0010（需明示）？
3. 获得授权后重新执行本任务（或新开 PRODUCTION-PERSISTENCE-02）。

## 12. 保留的真实标签

- REMOTE_SUPABASE_DEPLOYMENT_VERIFIED: **NO**
- REMOTE_SUPABASE_EVIDENCE_WRITE_READ: **NOT_TESTED**
- REMOTE_SUPABASE_RLS_VERIFIED: **NO**（未部署无从验证）
- APPLICATION_EVIDENCE_DURABILITY: **NOT_VERIFIED**（仅 repository 实现存在 + memory E2E PASS）
- CROSS_DEVICE_VERIFIED: **NO**
- M3: **PAUSED**
- SEPARATE_PERSISTENCE_DEBT：远程 0008 部分未应用（speaking_evaluations 缺失）+ Goal persistence 仍 MEMORY_REFERENCE_ONLY（均为既有已知项，本任务不扩 scope）
