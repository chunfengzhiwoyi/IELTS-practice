# P6B — Report Re-entry Report

## V1 口径（冻结）
- denominator = range 内至少真实查看一次学习报告的去重用户。
- numerator = 存在某次 report view 之后 0 < delta ≤ 24h 内发生 valid learning activity 的去重用户。
- rate = numerator / denominator。
- valid learning activity = qualifying learning_events（非 SKIPPED）∪ 已首答 speaking_sessions。
- report view 本身不计 active learning；/api/report 计算/prefetch 不算 view。

## 实现
- `report_views` 表（event_id 主键幂等、user_id、viewed_at、report_period、session correlation）。
- 纯聚合 `computeReportReentry(views, events, sessions, rangeStart, now)`。
- Dashboard 由 view + 后续 activity 推导，不写第二份 REPORT_REENTRY 事实源。

## Fixture 覆盖
view+5min → re-entry；+23h59m → re-entry；恰 +24h → re-entry；+24h01m → no；view only → no（denom=1 num=0）。

## 状态
由 not_instrumented 升级为可计算；真实前端 REPORT_VIEWED 呈现点接线留 P7。
