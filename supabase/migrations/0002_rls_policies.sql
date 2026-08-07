-- =============================================================
-- Row Level Security
-- 交接单 §9.2：所有用户业务表启用 RLS；用户只能读写自己的数据。
-- learning_items 为公共内容池，仅允许所有登录用户 SELECT。
-- =============================================================

-- -------------------- users --------------------
alter table public.users enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (auth.uid() = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 注意：INSERT 由 handle_new_auth_user 触发器以 SECURITY DEFINER 完成，
-- 用户端不需要 INSERT 策略。

-- -------------------- learning_items --------------------
alter table public.learning_items enable row level security;

drop policy if exists learning_items_select_all_authed on public.learning_items;
create policy learning_items_select_all_authed on public.learning_items
  for select using (auth.role() = 'authenticated');

-- 写入通过 service role 完成（后台维护），不对普通用户开放。

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

-- learning_events 不允许 UPDATE / DELETE（append-only 事件流）

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
