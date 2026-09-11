# P7 — API QA

## 鉴权
- 未登录：summary 与 detail route 均 401。
- 已登录（demo）：summary 200，sourceMode=real。
- requireUser() 仍是 authentication，非 authorization → SECURITY_BLOCKER 保留。

## range
7d/30d/all 均 200；非法 range 落入默认解析（200），与现有 contract 一致，不 500。

## detail routes
lifecycle/[stageId]、modules/[moduleId]、bad-cases?layer= 均 200；traces/[traceId] 在未持久化时 404（documented，不返 Mock）。

## 降级
- 单 section query 抛错：主 API 200、dataStatus=partial_error、failedSections 正确、其他 section 可用（composeDashboard 单测）。
- missing P6 表：trace=not_connected、report/reuse=not_instrumented；不 500、不返 0%。
- 生产 API 不 fallback MockRepository。
