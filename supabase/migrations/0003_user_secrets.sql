-- =============================================================
-- 0003_user_secrets.sql - 密钥保险库
-- 用户自带 LLM API Key / ima 凭证的密文存储（信封加密）。
-- 安全约束：
--   - 明文 API Key 绝不落库、绝不经 RLS 直读；
--   - 客户端（anon / authenticated）无策略 → 被 RLS 拒绝；
--   - 仅 service_role（保险库 Route Handler）可读写。
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

-- 关键：启用 RLS 且不授予任何客户端策略 → 普通用户（含 authenticated）无法直接读写。
-- service_role 客户端在 Route Handler 中绕过 RLS，是唯一合法访问方。
alter table public.user_secrets enable row level security;
