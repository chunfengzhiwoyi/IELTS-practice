-- =============================================================
-- LEARNING-REPORT-ONLINE-02: learning_items.canonical_key（词法规范键）
-- -------------------------------------------------------------
-- 背景：supabase/migrations 目录中 0009 为空槽（0009_lexical_canonical_key.sql
-- 于 010a4f1 创建、bf2a35f revert(035-merge-ready) 作为 gated migration 显式排除；
-- deferred 的 0009_p6_instrumentation.sql 与 canonical_key 无关）。
-- 0010_application_evidence.sql 已存在，因此本 migration 编号为 0011。
--
-- 目的：使 well-being/wellbeing 等已登记书写变体在 DB 层共享同一
-- lexical identity（去重、onConflict 仲裁、Repository 查找）。
--
-- 契约来源：lib/learning/item-id.ts 的 LEXICAL_VARIANTS 注册表。
-- 本 migration 的变体 UPDATE 必须与代码注册表保持一致。
--
-- 独立后续 migration：不重写 0001–0008（0008 已验收，不做无关改动）。
-- 远程核查（LEARNING-REPORT-ONLINE-02，service-role 只读）：
--   - learning_items 当前 2 行（PHRASE/WORD），canonical_key 列不存在（42703）
--   - 2 行 normalized_term 均为 NULL，backfill 回退 canonical_form（无冲突）
--   - 部署前仍需由授权 DDL channel 复核行数（见 REMOTE_SCHEMA_RECOVERY_PLAN.md）
-- =============================================================

alter table public.learning_items add column if not exists canonical_key text;

-- backfill：已有行按 normalized_term（无则 canonical_form）派生。
-- 与 canonicalKey() 对未登记输入的行为一致（小写、保留连字符与空格）。
update public.learning_items
   set canonical_key = lower(coalesce(nullif(normalized_term, ''), canonical_form))
 where canonical_key is null;

-- 词法变体注册表（与代码 LEXICAL_VARIANTS 逐一对应）
update public.learning_items set canonical_key = 'well-being' where canonical_key = 'wellbeing';
update public.learning_items set canonical_key = 'email'      where canonical_key = 'e-mail';
update public.learning_items set canonical_key = 'cooperate'  where canonical_key = 'co-operate';

alter table public.learning_items alter column canonical_key set not null;

-- onConflict("canonical_key") 的仲裁索引（ON CONFLICT 需要唯一索引/约束）
create unique index if not exists ux_learning_items_canonical_key
  on public.learning_items (canonical_key);
