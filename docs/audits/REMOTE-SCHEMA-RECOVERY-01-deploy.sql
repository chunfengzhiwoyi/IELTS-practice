-- =============================================================
-- REMOTE-SCHEMA-RECOVERY-01 — 用户手工执行 DDL（Supabase SQL Editor）
-- -------------------------------------------------------------
-- 执行位置：Supabase Dashboard → SQL Editor
-- 目标项目：nizjfakkmziwanxdcdxd（唯一 canonical 项目，即
--           NEXT_PUBLIC_SUPABASE_URL=https://nizjfakkmziwanxdcdxd.supabase.co）
-- 内容：仅两个 schema 目标
--   A. speaking_evaluations 表 + RLS + 索引（canonical 来源：0008 §3，逐字）
--   B. learning_items.canonical_key 列 + backfill + 唯一仲裁索引（canonical 来源：0011，逐字）
-- 禁止：本脚本不含 deferred 0009（dashboard_traces/report_views/content_reuse_events 等）内容。
-- 幂等：全部 IF NOT EXISTS / DROP POLICY IF EXISTS，可安全重复执行。
-- 执行完成后，请告知，我将继续远程验证与写路径测试。
-- =============================================================

-- ########## A. speaking_evaluations（0008 §3 逐字）##########

CREATE TABLE IF NOT EXISTS speaking_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_adopted boolean NOT NULL DEFAULT false,
  dimension_changes jsonb NOT NULL DEFAULT '{}',
  resolved_issues text[] NOT NULL DEFAULT '{}',
  unresolved_issues text[] NOT NULL DEFAULT '{}',
  issue_resolution_rate numeric(3,2) NOT NULL DEFAULT 0,
  feedback_effectiveness text NOT NULL DEFAULT 'uncertain',
  overall_change text NOT NULL DEFAULT 'stable',
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

-- RLS
ALTER TABLE speaking_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "speaking_evaluations_select_own" ON speaking_evaluations;
CREATE POLICY "speaking_evaluations_select_own"
  ON speaking_evaluations FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "speaking_evaluations_insert_own" ON speaking_evaluations;
CREATE POLICY "speaking_evaluations_insert_own"
  ON speaking_evaluations FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "speaking_evaluations_update_own" ON speaking_evaluations;
CREATE POLICY "speaking_evaluations_update_own"
  ON speaking_evaluations FOR UPDATE
  USING (user_id = auth.uid());

-- 索引
CREATE INDEX IF NOT EXISTS idx_speaking_evaluations_user_id ON speaking_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_speaking_evaluations_session_id ON speaking_evaluations(session_id);

-- ########## B. learning_items.canonical_key（0011 逐字）##########

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

-- ########## 执行后验证（可选，也可由我远程执行）##########
-- select table_name from information_schema.tables where table_schema='public' and table_name='speaking_evaluations';
-- select column_name from information_schema.columns where table_schema='public' and table_name='learning_items' and column_name='canonical_key';
-- select id, canonical_form, canonical_key from learning_items order by created_at;
-- select count(*) from learning_items;
-- select canonical_key, count(*) from learning_items group by 1 having count(*) > 1;
