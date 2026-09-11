# P6.1 — Privacy Audit

trace payload 字段级规则：

## DENY（即使 1 字节也不持久化）
- Authorization header
- Cookie
- API keys / API key
- service_role key / SUPABASE_SERVICE_ROLE_KEY
- access token / refresh token
- 任意 raw secret / .env 原文
- user 密码

## ALLOW（结构化诊断 metadata）
- trace_id、route、started_at/ended_at、latency_ms、http_status、app_error_code
- failure_layer、bad_case_id、seq、event_type、duration_ms、error_code
- provider / model_name / token_usage 计数、outcome 枚举、count

## payload 正文
- 复用既有 contract 的 4KB 截断与 redaction（`trace-contract.ts` payload）；
- "截断到 4KB" 不是 sanitization：上表 DENY 字段即使 <4KB 也不存；
- 不为 Dashboard 新增大段原始 prompt/input/output；需要诊断时存结构化 key 与 hash（sha256），不存原文。

## 结论
不持久化 credential/token/secret；新表 dashboard_traces/events/report_views/content_reuse_events 均不含上述列。
