-- 0007: 微信扫码登录中间态表
-- 作用：网页/安卓生成小程序码后，把 state 落入此表；用户扫码确认后写入会话；网页轮询取走后删除。
-- 仅 service_role 访问（浏览器拿不到 service_role key），故不加 RLS。

create table if not exists public.wechat_login_states (
  state        text primary key,
  status       text not null default 'pending',          -- pending | confirmed | expired
  session_json jsonb,                                    -- 确认后写入 Supabase Session
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists idx_wechat_states_expires on public.wechat_login_states (expires_at);

-- 顺手清理过期行（可选，由服务端在写入前调用）。无 RLS，service_role 可写。
create or replace function public.clean_expired_wechat_states()
returns void
language sql
as $$
  delete from public.wechat_login_states where expires_at < now();
$$;
