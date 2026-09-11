-- P6 — additive, backward-compatible instrumentation
-- 不 rename/drop 任何既有表；纯新增。生产/远程 apply 需 Human Gate。

-- P6A Trace Durability（与 trace-contract.ts 对齐；不存 credential/payload 正文）
create table if not exists dashboard_traces (
  trace_id text primary key,
  route text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  latency_ms bigint,
  http_status int,
  app_error_code text,
  degradation_flag boolean not null default false,
  event_count int not null default 0,
  user_hash text,
  client_event_id text,
  failure_layer text,
  bad_case_id text,
  created_at timestamptz not null default now()
);

create table if not exists dashboard_trace_events (
  id bigserial primary key,
  trace_id text not null references dashboard_traces(trace_id) on delete cascade,
  event_id text not null,
  seq int not null,
  ts timestamptz not null,
  event_type text not null,
  layer text not null,
  status text not null,
  duration_ms bigint,
  error_code text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  payload_truncated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (trace_id, event_id)
);
create index if not exists idx_dashboard_traces_started on dashboard_traces(started_at desc);
create index if not exists idx_dashboard_trace_events_trace on dashboard_trace_events(trace_id, seq);

-- P6B Report Re-entry（真实 report view，幂等）
create table if not exists report_views (
  event_id text primary key,
  user_id text not null,
  viewed_at timestamptz not null,
  report_period text,
  session_correlation_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_report_views_user_time on report_views(user_id, viewed_at desc);

-- P6C Content Reuse Hit/Miss（request-level，按 request_id 去重）
create table if not exists content_reuse_events (
  request_id text primary key,
  occurred_at timestamptz not null,
  item_type text not null,
  item_id text,
  outcome text not null check (outcome in ('reused','created','failed')),
  resolution_source text,
  created_at timestamptz not null default now()
);
create index if not exists idx_content_reuse_time on content_reuse_events(occurred_at desc);

alter table dashboard_traces enable row level security;
alter table dashboard_trace_events enable row level security;
alter table report_views enable row level security;
alter table content_reuse_events enable row level security;
-- 聚合读走 service-role（绕过 RLS）；这些表不面向客户端直写。
