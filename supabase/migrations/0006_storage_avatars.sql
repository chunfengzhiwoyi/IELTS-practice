-- =============================================================
-- 0006 · 个人中心支撑：头像存储桶 + RLS + 补齐用户列
-- ------------------------------------------------------------
-- 幂等设计：在 Supabase SQL Editor 中可重复执行。
-- 前置：0001_init_schema / 0003_user_secrets / 0005_account_profile
--   （若 0005 尚未执行，下方 ADD COLUMN IF NOT EXISTS 会补齐列）
-- =============================================================

-- ---------- 1. 个人头像存储桶（public） ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 任何人可读（public bucket）
drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- 登录用户只能写入自己的目录 avatars/<uid>/...
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 2. users 表：补齐个人中心列（若 0005 未跑） ----------
alter table public.users add column if not exists display_name text;
alter table public.users add column if not exists wechat_openid text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists last_login_at timestamptz;

-- ---------- 3. users 表：owner 读写 RLS ----------
-- 即便个人中心走 service_role 路由，也补齐 owner 直连权限，便于未来扩展。
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select to authenticated
  using (id = auth.uid());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
