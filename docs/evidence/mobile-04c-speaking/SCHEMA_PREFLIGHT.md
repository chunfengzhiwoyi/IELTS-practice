# MOBILE-04C — Schema Preflight Evidence

## 远程只读实测（2026-09-16，probe-remote-schema.mjs）

- application_evidence：**整表缺失**（PostgREST PGRST205，404）
- ability_observations：存在，但 `level` / `issues` / `evidence` / `suggestions` 缺失（42703）
- speaking_sessions：存在（空表），缺 `question_id` / `status` / `first_analysis` / `second_analysis` / `updated_at` / `suggested_expressions`；`id` 为 uuid（`id=eq.spk-probe-000001` → 22P02）
- speaking_evaluations：存在
- users：存在（1 行 id=a40d0e85-64b5-4492-b44f-332669e0707d）

## 本地期望（LOCAL_EXPECTED）

- migrations/0001：speaking_sessions id=uuid（历史），ability_observations 无 4 列
- migrations/0008：ability_observations 补 4 列 + speaking_evaluations 建表
- migrations/0010：application_evidence 建表
- 代码契约：speaking_sessions.id 为文本 `spk-*`（session route / SupabaseSpeakingRepository / fixtures / tests 全用 spk-*）

## 决策

SPEAKING_SESSION_ID_CONTRACT = **DB 改 text（保留 spk-* 代码契约）**
- 依据：代码全链路（route 生成、repository 写入、测试 fixture）均以文本 spk-* 为 SSOT；DB uuid 仅为旧 migration 遗留且表为空。
- 文件影响：`supabase/migrations/0013_speaking_writeback_schema.sql`（id drop default + `alter column id type text using id::text`）。

## 产物

- `supabase/migrations/0013_speaking_writeback_schema.sql`（幂等）
- `docs/audits/MOBILE-04C-speaking-schema-deploy.sql`（用户 SQL Editor 手工执行版，内容一致）

## 执行状态

远程部署 = **PENDING_USER_EXECUTION**（无 CLI/token/DATABASE_URL；不 db push；不裸标记 migration history）。
执行后复核：重跑 `node --env-file=.env.local scripts/probe-remote-schema.mjs`，对照 LOCAL_EXPECTED。
