# P6 — Instrumentation Completion Report

## 范围
补三个已登记 instrumentation gap；不改已冻结的 Product Health/Lifecycle/Learning Impact 聚合公式。

| gap | 落点 | 状态 |
|---|---|---|
| P6A Trace Durability | `lib/observability/durable-trace-store.ts` + migration 0009 | 代码+单测完成 |
| P6B Report Re-entry | `computeReportReentry` 纯函数 + `report_views` 表 | 完成 |
| P6C Content Reuse | `computeContentReuse` 纯函数 + `content_reuse_events` 表 | 完成 |

## 测试
tests/unit/dashboard-metrics.correctness.test.ts：**32 passed**（含 P5/P5.1 回归 + P6 新用例）。tsc=0、next build=PASS。

## 未做/边界
- 远程 Supabase migration 仅生成 SQL（0009），未 apply 到 production/shared remote；按规则需 Human Gate 后 apply。本地/dev 可继续。
- 业务侧 report 呈现点 / createOrGetItem 调用点的真实写埋点留待 P7 接线；本阶段交付持久层 schema + 纯聚合 + 隔离写，公式冻结不动。
- trace 不持久化 credential；payload 沿用 contract 4KB 截断。
- 首页 Top5 仍只排序截断，UNKNOWN 独立。

## 持续 BLOCKER
- SECURITY_BLOCKER_FOR_PRODUCTION：REGISTERED
- EVAL_ARTIFACT_DEPLOYMENT_RISK：REGISTERED

```text
PHASE: P6 — Instrumentation Completion
STATUS: PASS
SOURCE_OF_TRUTH_CHANGED: NO
NEXT: P7 — Integration QA
```
