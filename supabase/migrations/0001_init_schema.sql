-- =============================================================
-- 英语高效学习助手 MVP 0.1 - 初始 Schema
-- 严格来源：开发交接单 §7.1
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
