-- =============================================================
-- 0012_auth_surface_security_hardening.sql
-- 目标：在 Android Mobile Auth Bridge 之前，封堵 Supabase Auth surface
--       已确认暴露（AUTH-SEC-00 / AUTH-SEC-01）。
-- 约束：可重复审计；不删数据；不改 schema 字段；不改 auth identity；
--       不影响现有 Web 登录/注册产品行为。
-- 已审计：以下对象的所有仓库内真实访问者均为 service_role（qrcode/confirm/poll
--       路由 + /api/secrets 路由 + 触发器机制），无浏览器/anon/authenticated 直连。
-- service_role 具有 BYPASSRLS 与显式表权限，本 migration 不触碰。
-- =============================================================

-- -------------------------------------------------------------
-- A. public.wechat_login_states —— 内部认证中间态表
--    双层防护：ENABLE RLS（不建任何 policy → 默认拒绝）+ REVOKE ALL。
--    保持 service_role 显式权限不变（BYPASSRLS + 默认 ALL）。
-- -------------------------------------------------------------
alter table public.wechat_login_states enable row level security;

revoke all on public.wechat_login_states from anon;
revoke all on public.wechat_login_states from authenticated;
revoke all on public.wechat_login_states from public;

-- 不创建任何 anon/authenticated policy：普通客户端默认拒绝。

-- -------------------------------------------------------------
-- B. public.handle_new_auth_user()
--    保留 SECURITY DEFINER（after insert on auth.users 触发器向 public.users
--    插行必需；users 表无 INSERT policy，改 INVOKER 会破坏新用户注册）。
--    search_path 收紧为 ''（函数体已显式引用 public.users）。
--    收回普通客户端 EXECUTE；触发器调用不依赖 EXECUTE grant。
-- -------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user()
  from public, anon, authenticated;

-- -------------------------------------------------------------
-- C. public.clean_expired_wechat_states()
--    search_path 收紧为 ''（表名显式限定 public.wechat_login_states）。
--    仅内部服务端维护用途；当前仓库无业务调用方，EXECUTE 只保留 owner/service。
-- -------------------------------------------------------------
create or replace function public.clean_expired_wechat_states()
returns void
language sql
set search_path = ''
as $$
  delete from public.wechat_login_states where expires_at < now();
$$;

revoke execute on function public.clean_expired_wechat_states()
  from public, anon, authenticated;

-- -------------------------------------------------------------
-- D. public.set_updated_at()
--    search_path 收紧为 ''（函数体仅用 pg_catalog now()）。
--    trigger contract 完全不变：returns trigger language plpgsql，before update。
-- -------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -------------------------------------------------------------
-- E. public.user_secrets —— server-only 保险库纵深加固
--    RLS 已启用且无 policy（客户端默认拒绝）；再收回 grants，
--    防未来误关 RLS 时密文暴露。service_role 权限保持。
-- -------------------------------------------------------------
revoke all on public.user_secrets from anon;
revoke all on public.user_secrets from authenticated;
revoke all on public.user_secrets from public;
