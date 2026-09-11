# P6.1 — Production Instrumentation Wiring Report

## 调用链
- Runtime failures：`/api/dashboard` → `RealDashboardRepository.getDashboard` → `fetchTraces` → `dashboard_traces`（group by failure_layer, desc, Top5 + 其他 N 类）→ `LAYER_LABEL` → Dashboard aiQuality.runtime。
- Report re-entry：真实 report view（report_views，event_id 幂等）+ valid activity → `computeReportReentry` → features[report]。
- Content reuse：resolution 单次 outcome（content_reuse_events，request_id 去重）→ `computeContentReuse` → system.capabilities[reuse]。

## 能力探测（P6.1E）
`safeQuery` + `isMissingTable`：PostgREST 42P01 / "does not exist" → 该指标 not_connected / not_instrumented，绝不 500/0/ready。不每请求做 schema probe；按查询返回错误稳定映射。

## 三配置
- production with migration：durable trace → runtime=durable、failures Top5；report/reuse ready/insufficient。
- production without migration：runtime=not_connected、report=not_instrumented、reuse=not_instrumented；应用不崩、学习请求不 500。
- test/demo：纯聚合单测 + in-memory client；未连远程。

## 写失败隔离
trace durable 写 throw 在 `IsolatingTraceStore`/`SupabaseTraceStore` 内 `.catch()`；业务 handler 只依赖 TraceStore abstraction，不直接 `.from("dashboard_traces")`。

## 状态转换
- Runtime Failure Layers：not_connected → durable（有行）/ zero（表可用但无 failure 行）。
- 报告后回流率：not_instrumented → ready/insufficient。
- 内容复用命中率：not_instrumented → ready/insufficient；标签未改名。

## 门禁
vitest 34 passed、tsc=0、build=PASS。
