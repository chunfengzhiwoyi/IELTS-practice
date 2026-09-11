# P7 — Instrumentation E2E

## A Report re-entry
- 纯聚合接线已验证：view+≤24h valid activity → re-entry；>24h → no；view 自身不计 active；无 views → denominator=0（insufficient，不把 /api/report 计为 view）。
- 真实客户端 recordReportView 幂等边界（event_id、StrictMode 去重）为设计落点；Supabase E2E = PENDING_REMOTE_MIGRATION。

## B Content reuse
- reused=7/created=3/failed=2 → 70%、denom=10、failed 另计（单测）。
- 重复 request_id 只计一次；retry 单 outcome（聚合层去重）。

## C Trace
- composition：producer → TraceStore → IsolatingTraceStore(Memory, SupabaseTraceStore)；durable throw 业务不抛（单测）。
- SUPABASE_DURABILITY_VERIFIED = PENDING_REMOTE_MIGRATION（persistent Map 仅 CONTRACT_TEST_PASS，不冒充真实 Supabase）。
