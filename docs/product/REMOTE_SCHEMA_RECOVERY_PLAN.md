# REMOTE SCHEMA RECOVERY PLAN — LEARNING-REPORT-ONLINE-02

> 状态：**PLAN ONLY / NOT EXECUTED** — 远程 DDL 通道 BLOCKED（PRODUCTION-PERSISTENCE-01）。
> 本文件是恢复包的执行蓝图，不是已部署变更的记录。

## 1. 远程现状（LEARNING-REPORT-ONLINE-02 实测证据，2026-09-13）

| 对象 | 远程状态 | 证据（service-role / anon 只读查询） |
|---|---|---|
| `speaking_evaluations` 表 | **MISSING** | anon `.from("speaking_evaluations").select("*")` → `PGRST205 Could not find the table 'public.speaking_evaluations' in the schema cache` |
| `learning_items.canonical_key` 列 | **MISSING** | `select canonical_key from learning_items` → `42703 column learning_items.canonical_key does not exist`（anon + service-role 双证实） |
| `learning_items` 表 | PRESENT | 2 行：`take something for granted`(PHRASE)、`sustainable`(WORD)；`normalized_term` 均 NULL |
| 其他报告链路表 | PRESENT（空） | `users`(5 行)、`user_item_states`/`learning_events`/`speaking_sessions`/`ability_observations`/`recommendations`/`application_evidence` 均存在，业务数据 0 行 |
| `users` 表 | PRESENT | 5 个真实用户（uuid id） |

注意：remote `user_id` 列为 **uuid 类型**；demo 身份 `demo-user-001` 传入会触发 `22P02 invalid input syntax for type uuid`（仅 demo+supabase 组合出现，生产 supabase 真实用户不受影响）。

## 2. 恢复目标

### 2.1 speaking_evaluations —— 通过本地 canonical 0008 补齐
- LOCAL_CANONICAL_SOURCE：`supabase/migrations/0008_data_model_consistency.sql` §3（L45–82：CREATE TABLE IF NOT EXISTS + RLS select/insert/update/delete policies）
- **不要**复制创建第二份同义 migration（避免 drift）
- EXPECTED_WRITE_SOURCE：production analyze 二次回答 `evalRepo.save`（speaking_feedback_improvement 指标）
- 若远程已存在该表（后续核查变化），跳过本步

### 2.2 learning_items.canonical_key —— 新 migration `0011_canonical_key.sql`
- 来源：从 git 历史恢复被 revert 的 `0009_lexical_canonical_key.sql`（commit `010a4f1`），按当前编号规范重编为 **0011**（0009 槽位曾两次占用、0010 已存在）
- 内容（additive，非破坏）：
  1. `add column if not exists canonical_key text`
  2. backfill：`lower(coalesce(nullif(normalized_term,''), canonical_form))`（与 `canonicalKey()` 未登记输入行为一致）
  3. 变体重写：`wellbeing→well-being`、`e-mail→email`、`co-operate→cooperate`（与 `lib/learning/item-id.ts` LEXICAL_VARIANTS 冻结一致）
  4. `alter column canonical_key set not null`
  5. `create unique index ux_learning_items_canonical_key`（upsert `onConflict: "canonical_key"` 的仲裁前提）

## 3. 迁移顺序（部署时按此执行）

1. **先**：远程复核 `speaking_evaluations` 是否存在；不存在则应用 0008 §3（授权 DDL channel）
2. **再**：应用 `0011_canonical_key.sql`
3. **后**：验证（见 §5）

## 4. 部署状态

```
DEPLOYMENT_STATUS: BLOCKED_BY_DDL_CHANNEL
REASON: PRODUCTION-PERSISTENCE-01 —— DATABASE_URL/DB password ABSENT；
        Supabase Management API token ABSENT；supabase CLI 未安装/未 link/未登录。
        anon/service-role 均无 DDL（PostgREST 不提供 create table）。
REMOTE_DDL_DEPLOYMENT: BLOCKED
```

- 本任务未执行任何远程 DDL
- 不得通过 SQL Editor 手工乱贴、不得复制 SQL 到未知项目、不得绕过权限
- 未部署前，产品代码已通过「缺表降级」保证 /api/report 诚实可用（evaluations=[] + NOT_INSTRUMENTED）

## 5. 部署后验证（Human Gate 步骤）

1. `speaking_evaluations`：anon 查询 `from("speaking_evaluations").select("*").limit(1)` → 无 PGRST205；写入路径 `evalRepo.save` 走通一次二次回答分析
2. `canonical_key`：`select canonical_key from learning_items limit 1` → 无 42703；`findItemByNormalizedTerm("wellbeing")` 与 `("well-being")` 命中同一 itemId
3. 唯一索引冲突预检：`select canonical_key, count(*) from learning_items group by 1 having count(*)>1` → 0 行（当前 2 行形态无冲突；若未来出现冲突行需先合并再部署）
4. /api/report：supabase auth 真实用户（uuid）→ 200，`speakingEvaluationsStatus` 由 `NOT_INSTRUMENTED` 变为 `OK`
5. RLS：确认新表/列不破坏既有 RLS（0008 §3 已含 policy；canonical_key 列只读继承表级策略）

## 6. 不在本恢复包内（保持 DEFER）

- `report_views` / `dashboard_traces` / `content_reuse_events`（deferred 0009 p6）：无写路径，建表无意义
- 真实学习数据生产：必须走真实产品学习流程（Learn/Review/Speaking），不以 demo seed 冒充
