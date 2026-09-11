# P6 — Migration Audit

## 文件
`supabase/migrations/0009_p6_instrumentation.sql`

## 变更性质
- 纯新增：`dashboard_traces`、`dashboard_trace_events`、`report_views`、`content_reuse_events`。
- `create table if not exists`；无 rename/drop/alter 既有表。
- 全部开 RLS；聚合读走 service-role。

## 回滚
- 可直接 drop 新表回滚；不影响既有 learning_events/speaking_sessions 等。

## apply 状态
- 已生成、本地审查；未 apply 到 production/shared remote。
- 远程 apply 属不可轻易回滚的共享 schema 变更 → 按规则触发 Human Gate 后再执行。
- 开发/本地环境可继续。

## 凭证/敏感数据
- 新表不存 API key / cookie / Authorization / service-role key。
- trace payload 沿用 contract 4KB 截断与既有 redaction。
