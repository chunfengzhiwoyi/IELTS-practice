# P6A — Trace Durability Report

## 结构
existing producer → TraceStore interface → MemoryStore + DurableStore
- `durable-trace-store.ts`：`TraceStore` interface + `SupabaseTraceStore`（最小 `TraceTableClient` 接口，可 fake 测试）+ `IsolatingTraceStore`（memory 读 + durable 写隔离）。
- 业务代码不直接 `.from("trace...")`。

## Schema（additive，0009）
`dashboard_traces` / `dashboard_trace_events`：trace_id、route、started/completed、status、latency、failure_layer、bad_case_id、ordered seq events、event_type/layer/duration；不存 credential/prompt 正文（payload 4KB 截断沿用 contract）。

## 13 层 taxonomy
INPUT/ROUTING/STATE_READ/RETRIEVAL/PROMPT/MODEL/OUTPUT_VALIDATION/BUSINESS_RULE/STATE_WRITE/REPORT_AGGREGATION/FALLBACK/UI_PRESENTATION/UNKNOWN 原样持久化；UNKNOWN 不归并（测试断言 layer 序列保留 "UNKNOWN"）。

## 验证
- 写 trace → 新 store 实例仍读到 events（测试用同一份持久 Map 模拟进程重启）。
- durable 写 throw → business 不抛、不 500（IsolatingTraceStore catch）。
- 13 层 + STATE_WRITE 原样保留。
- 失败写入降级、不返回 Mock Top5。

## 说明
远程 apply 待 Human Gate；当前 RealDashboardRepository runtime 仍在 durable 接线切换中，不冒充已生产验证。
