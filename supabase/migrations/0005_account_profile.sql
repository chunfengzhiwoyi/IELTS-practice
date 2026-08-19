-- =============================================================
-- 0005 · 账户资料扩展（微信绑定 / 昵称 / 最近登录）
-- ------------------------------------------------------------
-- 支撑 P2 跨端身份：
--   - 小程序 wx.login 绑定（wechat_openid，仅服务端 wechat-bridge 写入）
--   - 匿名转正后迁移进度到统一的 Supabase 用户
--   - 跨端学习数据天然打通（同一 auth.users.id）
-- 依赖：0001（public.users 已存在）；扩展列自动受现有 RLS 保护。
-- =============================================================

alter table public.users
  add column if not exists display_name    text,
  add column if not exists wechat_openid   text unique,   -- 小程序绑定；null 表示网页邮箱用户
  add column if not exists avatar_url       text,
  add column if not exists last_login_at    timestamptz;

comment on column public.users.display_name  is '昵称：微信用户默认「微信用户」，网页用户可在 /account 编辑';
comment on column public.users.wechat_openid is '小程序 wx.login 标识；仅服务端 wechat-bridge 写入，唯一';
comment on column public.users.avatar_url    is '头像 URL（可选）';
comment on column public.users.last_login_at is '最近一次成功登录时间，由 wechat-bridge / 登录流程更新';

-- 已有行补全 display_name（沿用邮箱前缀，便于后台辨识）
update public.users
  set display_name = split_part(email, '@', 1)
  where display_name is null;
