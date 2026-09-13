# REMOTE SCHEMA RECOVERY PLAN — LEARNING-REPORT-ONLINE-02 / RSR-01 / RSR-02

> 状态：**DEPLOYED / VERIFIED**（speaking_evaluations + canonical_key 已部署并完成写路径验证）
> 部署通道：用户 Supabase SQL Editor 手工执行 `docs/audits/REMOTE-SCHEMA-RECOVERY-01-deploy.sql`（目标项目 `nizjfakkmziwanxdcdxd`）

## 1. 远程现状（RSR-02 实测证据，2026-09-13）

| 对象 | 远程状态 | 证据 |
|---|---|---|
| `speaking_evaluations` 表 | **PRESENT / VERIFIED** | 0008 §3 建表+RLS enabled+3 policy+2 index；service-role SELECT 0 行；authenticated upsert/read/ownership PASS；/api/report `speakingEvaluationsStatus:"OK"` |
| `learning_items.canonical_key` 列 | **PRESENT / VERIFIED** | 0011 additive 列；2 行 backfill 正确（`take something for granted` / `sustainable`）；NOT NULL；唯一索引；createOrGetItem 幂等 E2E PASS |
| `learning_items` 表 | PRESENT | 2 行 canonical（数据保全基线始终未变） |
| 其他报告链路表 | PRESENT（空） | users(5)、user_item_states/learning_events/speaking_sessions/ability_observations/recommendations/application_evidence 均存在 |
| REMOTE MIGRATION | `remote_schema_recovery_01` | 用户 SQL Editor 执行记录 |

注意：remote `user_id` 为 uuid；demo 身份 `demo-user-001` → 22P02（仅 demo+supabase 组合）。

## 2. 恢复目标（已达成）

### 2.1 speaking_evaluations —— **DEPLOYED**（canonical 0008 §3）
- 来源：`supabase/migrations/0008_data_model_consistency.sql` §3（L45-81）
- 写入源：production analyze 二次回答 `evalRepo.save`（speaking_feedback_improvement）
- 验证：RSR-02 §4 —— save/read/ownership PASS；/api/report 读取正常

### 2.2 learning_items.canonical_key —— **DEPLOYED**（migration `0011_canonical_key.sql`）
- 内容：add column + backfill（lower(coalesce(nullif(normalized_term,''), canonical_form))）+ 3 变体重写 + NOT NULL + 唯一索引
- 验证：RSR-02 §3 —— createOrGetItem canonical_key 正确、幂等、无重复；RLS findItem 命中

## 3. 迁移顺序（已执行）

1. ✅ 远程复核：speaking_evaluations MISSING / canonical_key MISSING
2. ✅ 用户 SQL Editor 执行 `REMOTE-SCHEMA-RECOVERY-01-deploy.sql`（A 段 0008 §3 + B 段 0011）
3. ✅ 验证：表/列存在、2 行保留、backfill 正确、无 null/dup

## 4. 部署状态（更新）

```
DEPLOYMENT_STATUS: DEPLOYED / VERIFIED
REMOTE_DDL_DEPLOYMENT: COMPLETED_VIA_USER_SQL_EDITOR
LEARN_WRITE_PATH: PASS（service-role createOrGetItem + authenticated user-state/event）
EVALUATION_WRITE_PATH: PASS
REPORT_API_AUTHENTICATED: PASS（200）
DEFERRED_0009: UNTOUCHED
```

- DDL 通道历史：Agent 无 CLI/token/DATABASE_URL（PRODUCTION-PERSISTENCE-01 与 RSR-01 均证实）→ 用户 SQL Editor 为唯一正式通道，已使用
- 本恢复包不含 deferred 0009 任何内容

## 5. 部署后验证（已完成）

1. ✅ `speaking_evaluations`：PRESENT；authenticated upsert/read/ownership PASS
2. ✅ `canonical_key`：PRESENT；createOrGetItem + findItem 幂等 E2E PASS
3. ✅ 唯一索引预检：无冲突（2 行互异 key）
4. ✅ /api/report：supabase 真实用户（uuid）→ **200**，`speakingEvaluationsStatus: OK`
5. ✅ RLS：learning_items 保持 SELECT-only（未开放 INSERT）；user 数据 own-scope 未破坏

## 6. 不在本恢复包内（保持 DEFER）

- `report_views` / `dashboard_traces` / `content_reuse_events`（deferred 0009 p6）：无写路径
- 真实学习数据生产：必须走真实产品学习流程；本任务产生的探针数据已全部清理
- Goal Supabase 持久化：PRODUCT-LOOP-02B 边界（memory fallback + durable:false），后续独立任务
