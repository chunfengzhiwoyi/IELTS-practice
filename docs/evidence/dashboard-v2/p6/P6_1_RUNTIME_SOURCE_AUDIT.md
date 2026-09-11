# P6.1 — Runtime Source Audit

## 现状接线
| 指标 | 真实源表 | 能力映射 |
|---|---|---|
| Runtime failures Top5 | dashboard_traces.failure_layer | 表缺→not_connected/[]；有行→durable/Top5+其他；无行→zero |
| 报告后回流率 | report_views ∪ valid learning activity | 表缺→not_instrumented；denom=0→insufficient；否则 ready |
| 内容复用命中率 | content_reuse_events(request_id 去重) | 表缺→not_instrumented；denom=0→insufficient；否则 ready |

## Top5 语义
group by exact canonical layer → count desc → top5；余数合并为"其他 N 类 / X 个问题"；Drawer/Bad Case/Trace Detail 仍读 exact layer。UNKNOWN 独立"待归因"，不归并。

## 真实 DB 证据
- 当前"持久 Map + 新 store 实例"仅：CONTRACT_TEST_PASS。
- SUPABASE_DURABILITY_VERIFIED = PENDING_REMOTE_MIGRATION。
- 未对 shared/production remote apply migration；apply 需 Human Gate。不阻塞代码级 P6.1，但阻塞 P8/P9。

## 持续登记
- SECURITY_BLOCKER_FOR_PRODUCTION
- EVAL_ARTIFACT_DEPLOYMENT_RISK
- REMOTE_INSTRUMENTATION_MIGRATION_PENDING
