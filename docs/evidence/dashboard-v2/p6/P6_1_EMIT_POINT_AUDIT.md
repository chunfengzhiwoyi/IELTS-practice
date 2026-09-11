# P6.1 — Emit Point Audit

## Trace producer
- 现有 composition：`lib/observability/trace-store.ts` 单例 `traceStore`（MemoryTraceStore），被 trace-context / debug / llm tasks 消费。
- 接线：`IsolatingTraceStore(MemoryStore, SupabaseTraceStore)`（`lib/observability/durable-trace-store.ts`）。业务仍只依赖 TraceStore interface；durable 写失败隔离。
- 13 层与 UNKNOWN 原样；UNKNOWN 不归并（测试断言）。

## Report true-view
- 边界：报告组件真实可见就绪后，调幂等 `recordReportView`（event_id 由 report session 派生，StrictMode/重渲染幂等）。
- 不计入：GET /api/report 服务端计算、prefetch、React 首次 render attempt。
- 事实源：report_views；re-entry 由 view + 后续 valid activity 在聚合层推导，不另写第二事件。

## Content reuse
- 边界：`createOrGetItem` / canonical lookup resolution boundary，一次 request 单一 outcome（reused|created|failed），request_id 去重；lookup/create/retry 内部分支不各自记一条。
- telemetry 写失败不改变业务返回。

## 去重
- report_views.event_id 主键；content_reuse_events.request_id 主键；测试覆盖重复 render/重复 id 只计一次。
