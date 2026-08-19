-- =============================================================
-- P2 补齐：对齐 LearningRepository 与 Domain 类型的字段缺口
-- 严格来源：lib/learning/types.ts 与 repository.ts 接口
-- =============================================================

-- -------------------------------------------------------------
-- 1. learning_items.normalized_term
--    Domain LearningItem.normalizedTerm 是查找键（findItemByNormalizedTerm）。
--    种子用字符串 itemId，DB 主键是 uuid，因此仓库按 normalized_term 匹配、
--   由 DB 自增 uuid；本列承载该查找键。
-- -------------------------------------------------------------
alter table public.learning_items add column if not exists normalized_term text;
update public.learning_items set normalized_term = lower(canonical_form) where normalized_term is null;
create index if not exists idx_learning_items_normalized_term
  on public.learning_items (normalized_term);

-- -------------------------------------------------------------
-- 2. user_item_states.status
--    Domain UserItemState.status（NEW / EXPOSED / RECALLED_WITH_HELP /
--    RECALLED_INDEPENDENTLY）在 memory 实现中持久化，supabase 版需同字段。
-- -------------------------------------------------------------
alter table public.user_item_states add column if not exists status text not null default 'NEW'
  check (status in ('NEW', 'EXPOSED', 'RECALLED_WITH_HELP', 'RECALLED_INDEPENDENTLY'));
create index if not exists idx_user_item_states_status
  on public.user_item_states (user_id, status);

-- -------------------------------------------------------------
-- 3. learning_events.task_type + trace_id
--    Domain LearningEvent.taskType / traceId 在 memory 实现中持久化。
--    learning_events 为 append-only 事件流，不开放 UPDATE/DELETE（见 0002）。
-- -------------------------------------------------------------
alter table public.learning_events add column if not exists task_type text not null default 'MEANING_RECALL'
  check (task_type in ('MEANING_RECALL', 'PERSONAL_SENTENCE'));
alter table public.learning_events add column if not exists trace_id text;
create index if not exists idx_learning_events_trace
  on public.learning_events (user_id, trace_id) where trace_id is not null;
