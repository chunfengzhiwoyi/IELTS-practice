-- =============================================================
-- MOBILE-04C Speaking 写回 Schema — 用户手工执行 DDL（Supabase SQL Editor）
-- -------------------------------------------------------------
-- 执行位置：Supabase Dashboard → SQL Editor
-- 目标项目：nizjfakkmziwanxdcdxd（唯一 canonical 项目）
-- 内容：0013_speaking_writeback_schema.sql 逐字（A. speaking_sessions id→text +
--       缺失列 + 触发器；B. ability_observations 4 列 + 约束刷新；
--       C. application_evidence 表 + RLS + 索引）。
-- 禁止：本脚本不含 deferred 0009 / 其他无关 DDL。
-- 幂等：全部 IF NOT EXISTS / DROP ... IF EXISTS，可安全重复执行。
-- 执行完成后请告知，我将继续远程验证与真实 E2E。
-- =============================================================
-- =============================================================
-- 0013_speaking_writeback_schema.sql
-- MOBILE-04C — Speaking 写回 Schema Reconciliation（唯一新 migration）
-- -------------------------------------------------------------
-- 背景（2026-09-16 远程只读实测，PostgREST service-role probe）：
--   A. speaking_sessions.id 为 uuid，而代码 SSOT（app/api/speaking/session/route.ts
--      生成 spk-<ts>-<rand>）与下游表 speaking_evaluations.session_id /
--      application_evidence.session_id（均为 text）以文本 ID 为契约 → 插入即 22P02。
--   B. speaking_sessions 缺代码仓库（SupabaseSpeakingRepository）依赖的
--      question_id / status / first_analysis / second_analysis / updated_at /
--      suggested_expressions 列（0001 仅 id/user_id/part/topic/question/
--      first_answer/main_issue/second_answer/created_at；无 updated_at 触发器）。
--   C. ability_observations 缺 level / issues / evidence / suggestions 列
--      （0008 §2 未部署到远程；0008 §3 speaking_evaluations 已由 RSR-01 手工部署）。
--      且 evidence_status 检查约束仍是 0001 的 4 值版本，不含 IMPROVING/RESOLVED。
--   D. application_evidence 整表缺失（0010 未部署到远程）。
--
-- 原则：
--   - 不篡改旧 migration（0001-0012 原样保留）。
--   - 不伪造 migration history（部署通道 = 用户 Supabase SQL Editor 执行本文件；
--     与 RSR-01/02 一致的已验证通道）。
--   - 全部幂等：IF NOT EXISTS / DROP ... IF EXISTS / DROP CONSTRAINT IF EXISTS。
--   - 不删数据、不改无关表。
-- =============================================================

-- #############################################################
-- A. speaking_sessions：id → text（spk-* 契约）+ 缺失列 + updated_at 触发器
-- #############################################################

alter table public.speaking_sessions alter column id drop default;

-- 空表（远程实测 0 行）；uuid→text 为赋值转换，显式 USING 保证可重复
alter table public.speaking_sessions alter column id type text using id::text;

alter table public.speaking_sessions add column if not exists question_id text;
alter table public.speaking_sessions add column if not exists status text not null default 'IN_PROGRESS';
alter table public.speaking_sessions add column if not exists first_analysis jsonb;
alter table public.speaking_sessions add column if not exists second_analysis jsonb;
alter table public.speaking_sessions add column if not exists updated_at timestamptz not null default now();
alter table public.speaking_sessions add column if not exists suggested_expressions jsonb not null default '[]'::jsonb;

-- status 合法性约束（对齐 SpeakingSessionStatus）
alter table public.speaking_sessions drop constraint if exists speaking_sessions_status_check;
alter table public.speaking_sessions add constraint speaking_sessions_status_check
  check (status in ('IN_PROGRESS', 'COMPLETED'));

-- updated_at 触发器（与 users / user_item_states 同一 set_updated_at() 契约）
drop trigger if exists trg_speaking_sessions_updated_at on public.speaking_sessions;
create trigger trg_speaking_sessions_updated_at
  before update on public.speaking_sessions
  for each row execute function public.set_updated_at();

-- #############################################################
-- B. ability_observations：level/issues/evidence/suggestions + 约束刷新
-- #############################################################

alter table public.ability_observations add column if not exists level text not null default 'developing';
alter table public.ability_observations add column if not exists issues text[] not null default '{}';
alter table public.ability_observations add column if not exists evidence text[] not null default '{}';
alter table public.ability_observations add column if not exists suggestions text[] not null default '{}';

-- level 合法性约束（对齐 AbilityLevel）
alter table public.ability_observations drop constraint if exists ability_observations_level_check;
alter table public.ability_observations add constraint ability_observations_level_check
  check (level in ('strong', 'adequate', 'developing', 'weak'));

-- evidence_status 刷新为完整生命周期（SINGLE → REPEATED → IMPROVING → RESOLVED，↘ DISPUTED）
alter table public.ability_observations drop constraint if exists ability_observations_evidence_status_check;
alter table public.ability_observations add constraint ability_observations_evidence_status_check
  check (evidence_status in (
    'SINGLE_OBSERVATION',
    'REPEATED_PATTERN',
    'IMPROVING',
    'DISPUTED',
    'RESOLVED'
  ));

-- #############################################################
-- C. application_evidence：0010_application_evidence.sql 逐字（表 + RLS + 索引）
-- #############################################################

create table if not exists public.application_evidence (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  item_id              text not null,
  session_id           text not null,
  question_id          text,
  part                 text check (part in ('P1', 'P2', 'P3')),
  topic                text,
  assessment           text not null check (assessment in ('CORRECT', 'ISSUE', 'UNCERTAIN', 'NOT_USED')),
  quote                text,
  reason               text not null default '',
  validator_notes      text[] not null default '{}',
  upgrade_candidate    boolean not null default false,
  recovered_via_retry  boolean not null default false,
  recorded_at          timestamptz not null default now(),
  pipeline_version     text not null default '04B-validator-1',
  provider             text,
  model                text,
  unique (user_id, item_id, session_id)
);

create index if not exists idx_application_evidence_user_item
  on public.application_evidence (user_id, item_id);

alter table public.application_evidence enable row level security;

drop policy if exists "application_evidence_select_own" on public.application_evidence;
create policy "application_evidence_select_own"
  on public.application_evidence
  for select
  using (user_id = auth.uid());

drop policy if exists "application_evidence_insert_own" on public.application_evidence;
create policy "application_evidence_insert_own"
  on public.application_evidence
  for insert
  with check (user_id = auth.uid());

drop policy if exists "application_evidence_update_own" on public.application_evidence;
create policy "application_evidence_update_own"
  on public.application_evidence
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

