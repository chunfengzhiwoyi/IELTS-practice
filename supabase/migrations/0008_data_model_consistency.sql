-- ============================================================
-- 0008_data_model_consistency.sql
-- M1: Single Source of Truth — 数据模型一致性修复
-- M1 FINAL: recall_level 冻结为 Recall Mastery Level (0-2)
-- ============================================================
-- 1. recall_level: 冻结为 Recall Mastery Level，范围 0-2。
--    0 = 尚未建立有效回忆
--    1 = 已形成一定回忆能力 / 仍未达到稳定独立掌握
--    2 = 已达到独立回忆层级
--    当前固定复习间隔不由 recall_level 驱动。
--    未来如需 Leitner / multi-stage progression，新建独立 review_stage / box_level，
--    不复用 recall_level。
-- 2. ability_observations: 缺少 domain model 中的 level/issues/evidence/suggestions 字段。
-- 3. speaking_evaluations: 新建表（原仅 localStorage）。
-- ============================================================

-- 1. recall_level 约束（mastery 0-2，与原始 0001 schema 一致）
ALTER TABLE user_item_states DROP CONSTRAINT IF EXISTS user_item_states_recall_level_check;
ALTER TABLE user_item_states ADD CONSTRAINT user_item_states_recall_level_check
  CHECK (recall_level BETWEEN 0 AND 2);

-- 2. ability_observations 补充字段
ALTER TABLE ability_observations
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'developing',
  ADD COLUMN IF NOT EXISTS issues text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suggestions text[] NOT NULL DEFAULT '{}';

-- level 合法性约束
ALTER TABLE ability_observations DROP CONSTRAINT IF EXISTS ability_observations_level_check;
ALTER TABLE ability_observations ADD CONSTRAINT ability_observations_level_check
  CHECK (level IN ('strong', 'adequate', 'developing', 'weak'));

-- evidence_status 合法性约束（原有枚举可能不全，补充 IMPROVING/RESOLVED）
ALTER TABLE ability_observations DROP CONSTRAINT IF EXISTS ability_observations_evidence_status_check;
ALTER TABLE ability_observations ADD CONSTRAINT ability_observations_evidence_status_check
  CHECK (evidence_status IN (
    'SINGLE_OBSERVATION',
    'REPEATED_PATTERN',
    'IMPROVING',
    'DISPUTED',
    'RESOLVED'
  ));

-- 3. speaking_evaluations 表（原仅 localStorage，M1 起服务端持久化）
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
CREATE INDEX IF NOT EXISTS idx_ability_observations_user_dimension ON ability_observations(user_id, dimension);
