-- =============================================================
-- 一次性云部署脚本（非迁移文件）
-- 用途：在 Supabase Cloud 的 SQL Editor 里整段粘贴、执行一次。
-- 注意：不要提交到 migrations 自动追踪；后续改结构请单独写迁移。
-- 执行顺序：0001 schema → 0002 RLS → 0003 secrets → 0004 columns → seed
-- =============================================================

-- =============================================================
-- 0001_init_schema.sql
-- =============================================================

-- 需要 uuid_generate_v4() / gen_random_uuid()
create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- 通用触发器：自动维护 updated_at
-- -------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================
-- 1. users - 用户身份与学习目标
--    与 auth.users 一对一，id = auth.uid()
-- =============================================================
create table if not exists public.users (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null unique,
  target_exam        text,
  preferences_json   jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- 新用户注册后自动在 public.users 中创建对应行
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =============================================================
-- 2. learning_items - 标准知识项内容（公共内容池）
-- =============================================================
create table if not exists public.learning_items (
  id                uuid primary key default gen_random_uuid(),
  item_type         text not null check (item_type in ('WORD', 'PHRASE', 'CHUNK')),
  canonical_form    text not null,
  content_json      jsonb not null default '{}'::jsonb,
  topic_tags        text[] not null default array[]::text[],
  created_at        timestamptz not null default now(),
  unique (item_type, canonical_form)
);

create index if not exists idx_learning_items_canonical
  on public.learning_items using gin (to_tsvector('simple', canonical_form));
create index if not exists idx_learning_items_topic_tags
  on public.learning_items using gin (topic_tags);

-- =============================================================
-- 3. user_item_states - 用户对知识项的当前状态
--    §7.2：识别 / 回忆 / 应用 三维度独立记录
-- =============================================================
create table if not exists public.user_item_states (
  user_id                uuid not null references public.users(id) on delete cascade,
  item_id                uuid not null references public.learning_items(id) on delete cascade,
  recognition_level      smallint not null default 0 check (recognition_level between 0 and 2),
  recall_level           smallint not null default 0 check (recall_level between 0 and 2),
  application_level      smallint not null default 0 check (application_level between 0 and 2),
  consecutive_correct    smallint not null default 0 check (consecutive_correct >= 0),
  current_interval_days  smallint not null default 1 check (current_interval_days >= 0),
  next_review_at         timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  primary key (user_id, item_id)
);

drop trigger if exists trg_user_item_states_updated_at on public.user_item_states;
create trigger trg_user_item_states_updated_at
  before update on public.user_item_states
  for each row execute function public.set_updated_at();

create index if not exists idx_user_item_states_next_review
  on public.user_item_states (user_id, next_review_at);

-- =============================================================
-- 4. learning_events - 所有新词与复习事件
--    §7.3：FAIL / HINTED / INDEPENDENT / SKIPPED 四类质量
--    §8.3：client_event_id 幂等键
-- =============================================================
create table if not exists public.learning_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  item_id           uuid not null references public.learning_items(id) on delete cascade,
  event_type        text not null check (event_type in ('NEW', 'REVIEW')),
  answer            text,
  correctness       text not null check (correctness in ('FAIL', 'HINTED', 'INDEPENDENT', 'SKIPPED')),
  hint_level        smallint not null default 0 check (hint_level between 0 and 2),
  result_json       jsonb not null default '{}'::jsonb,
  client_event_id   text not null,
  created_at        timestamptz not null default now(),
  -- 幂等：同一用户同一 client_event_id 只允许一条
  unique (user_id, client_event_id)
);

create index if not exists idx_learning_events_user_item
  on public.learning_events (user_id, item_id, created_at desc);

-- =============================================================
-- 5. speaking_sessions - 口语题目与首答/重答
-- =============================================================
create table if not exists public.speaking_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  part           text not null check (part in ('P1', 'P2', 'P3')),
  topic          text not null,
  question       text not null,
  first_answer   text,
  main_issue     jsonb,
  second_answer  text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_speaking_sessions_user_created
  on public.speaking_sessions (user_id, created_at desc);

-- =============================================================
-- 6. ability_observations - 能力观察
--    §7.4：SINGLE / REPEATED / IMPROVING / DISPUTED 状态机
-- =============================================================
create table if not exists public.ability_observations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  dimension        text not null,
  evidence_status  text not null check (
                     evidence_status in (
                       'SINGLE_OBSERVATION', 'REPEATED_PATTERN', 'IMPROVING', 'DISPUTED'
                     )
                   ),
  source_type      text not null check (source_type in ('SPEAKING', 'REVIEW', 'LEARNING')),
  source_id        text not null,
  note             text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_ability_observations_user_dim
  on public.ability_observations (user_id, dimension, created_at desc);

-- =============================================================
-- 7. recommendations - 下一任务与理由
-- =============================================================
create table if not exists public.recommendations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  task_type     text not null,
  reason        text not null,
  priority      text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH')),
  status        text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DISMISSED')),
  payload_json  jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_recommendations_user_status
  on public.recommendations (user_id, status, priority, created_at desc);

-- =============================================================
-- 0002_rls_policies.sql
-- =============================================================

-- -------------------- users --------------------
alter table public.users enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (auth.uid() = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- -------------------- learning_items --------------------
alter table public.learning_items enable row level security;

drop policy if exists learning_items_select_all_authed on public.learning_items;
create policy learning_items_select_all_authed on public.learning_items
  for select using (auth.role() = 'authenticated');

-- -------------------- user_item_states --------------------
alter table public.user_item_states enable row level security;

drop policy if exists uis_select_own on public.user_item_states;
create policy uis_select_own on public.user_item_states
  for select using (auth.uid() = user_id);

drop policy if exists uis_insert_own on public.user_item_states;
create policy uis_insert_own on public.user_item_states
  for insert with check (auth.uid() = user_id);

drop policy if exists uis_update_own on public.user_item_states;
create policy uis_update_own on public.user_item_states
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists uis_delete_own on public.user_item_states;
create policy uis_delete_own on public.user_item_states
  for delete using (auth.uid() = user_id);

-- -------------------- learning_events --------------------
alter table public.learning_events enable row level security;

drop policy if exists le_select_own on public.learning_events;
create policy le_select_own on public.learning_events
  for select using (auth.uid() = user_id);

drop policy if exists le_insert_own on public.learning_events;
create policy le_insert_own on public.learning_events
  for insert with check (auth.uid() = user_id);

-- -------------------- speaking_sessions --------------------
alter table public.speaking_sessions enable row level security;

drop policy if exists ss_select_own on public.speaking_sessions;
create policy ss_select_own on public.speaking_sessions
  for select using (auth.uid() = user_id);

drop policy if exists ss_insert_own on public.speaking_sessions;
create policy ss_insert_own on public.speaking_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists ss_update_own on public.speaking_sessions;
create policy ss_update_own on public.speaking_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -------------------- ability_observations --------------------
alter table public.ability_observations enable row level security;

drop policy if exists ao_select_own on public.ability_observations;
create policy ao_select_own on public.ability_observations
  for select using (auth.uid() = user_id);

drop policy if exists ao_insert_own on public.ability_observations;
create policy ao_insert_own on public.ability_observations
  for insert with check (auth.uid() = user_id);

drop policy if exists ao_update_own on public.ability_observations;
create policy ao_update_own on public.ability_observations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -------------------- recommendations --------------------
alter table public.recommendations enable row level security;

drop policy if exists rec_select_own on public.recommendations;
create policy rec_select_own on public.recommendations
  for select using (auth.uid() = user_id);

drop policy if exists rec_insert_own on public.recommendations;
create policy rec_insert_own on public.recommendations
  for insert with check (auth.uid() = user_id);

drop policy if exists rec_update_own on public.recommendations;
create policy rec_update_own on public.recommendations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================
-- 0003_user_secrets.sql
-- =============================================================

create table if not exists public.user_secrets (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  model_config_cipher jsonb not null default '{}'::jsonb,
  ima_config_cipher   jsonb not null default '{}'::jsonb,
  kek_version        smallint not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists trg_user_secrets_updated_at on public.user_secrets;
create trigger trg_user_secrets_updated_at
  before update on public.user_secrets
  for each row execute function public.set_updated_at();

-- 启用 RLS 且不授予任何客户端策略，仅 service_role 可读写。
alter table public.user_secrets enable row level security;

-- =============================================================
-- 0004_repository_columns.sql
-- =============================================================

alter table public.learning_items add column if not exists normalized_term text;
update public.learning_items set normalized_term = lower(canonical_form) where normalized_term is null;
create index if not exists idx_learning_items_normalized_term
  on public.learning_items (normalized_term);

alter table public.user_item_states add column if not exists status text not null default 'NEW'
  check (status in ('NEW', 'EXPOSED', 'RECALLED_WITH_HELP', 'RECALLED_INDEPENDENTLY'));
create index if not exists idx_user_item_states_status
  on public.user_item_states (user_id, status);

alter table public.learning_events add column if not exists task_type text not null default 'MEANING_RECALL'
  check (task_type in ('MEANING_RECALL', 'PERSONAL_SENTENCE'));
alter table public.learning_events add column if not exists trace_id text;
create index if not exists idx_learning_events_trace
  on public.learning_events (user_id, trace_id) where trace_id is not null;

-- =============================================================
-- seed.sql
-- =============================================================

insert into public.learning_items (item_type, canonical_form, content_json, topic_tags)
values
  (
    'PHRASE',
    'take something for granted',
    jsonb_build_object(
      'coreMeaningZh', '把某事视为理所当然',
      'partOfSpeech', 'phrase',
      'examples', jsonb_build_array(
        jsonb_build_object('en', 'We often take our health for granted.')
      )
    ),
    array['daily', 'ielts-part1']
  ),
  (
    'WORD',
    'sustainable',
    jsonb_build_object(
      'coreMeaningZh', '可持续的',
      'partOfSpeech', 'adjective',
      'pronunciation', '/səˈsteɪ.nə.bəl/',
      'examples', jsonb_build_array(
        jsonb_build_object('en', 'We need a sustainable solution to this problem.')
      )
    ),
    array['environment', 'ielts-part3']
  )
on conflict (item_type, canonical_form) do nothing;
