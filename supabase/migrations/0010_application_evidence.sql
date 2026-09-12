-- ============================================================
-- 0010_application_evidence.sql
-- PRODUCT-LOOP-04E — Application Evidence History（唯一新表）
-- ------------------------------------------------------------
-- Speaking→Vocab V1.1：Validated Speaking Evidence 持久化。
-- SSOT：application_evidence 是 application ability 的唯一事实源；
--   user_item_states.application_level 仅为派生缓存（可从本表重算）。
-- 幂等：(user_id, item_id, session_id) 唯一 → 同 session 同 item 至多一条
--   final evidence（重试/刷新/重复 analyze 一律 upsert 覆盖）。
-- RLS：跟随现有 user_id 模式，user 只能读写自己的 evidence。
-- 范围：本 migration 只建 Application Evidence History，不触碰
--   Goal / Planner / 其他学习 schema / deferred 0009。
-- ============================================================

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
  -- 幂等键：同 session 同 item 至多一条 final evidence
  unique (user_id, item_id, session_id)
);

create index if not exists idx_application_evidence_user_item
  on public.application_evidence (user_id, item_id);

-- ------------------------------------------------------------
-- RLS（跟随现有 user_id 模式）
-- ------------------------------------------------------------
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

-- 删除跟随级联（RLS 完整覆盖；如未来需要 delete 路径，按同一 user_id 模式补充）
