# P5 — Mutation Guards

不引入 mutation-testing 库；以下为"已知错误实现会被 fixture 杀死"的对照清单（通过把 production aggregate 临时改回旧公式，断言对应测试转红后恢复）。

| 错误实现（mutation） | 被哪个测试杀死 | 证据 |
|---|---|---|
| active 去掉 speaking（只算 events） | "U3 speaking 已首答 in" | 期望 4→实际 3，红 |
| active 计入 SKIPPED | "U5 仅 SKIPPED out" | 期望 4→实际 5，红 |
| closed-loop 改回 NEW INDEPENDENT + REVIEW | U1 FAIL / U2 HINTED / U3 无 REVIEW | closed-loop size 0，红 |
| activation 改成首次 REVIEW | D/C 边界、E 跨模块 | num 错，红 |
| retention 改回 D7±1 | A(D3 回访 D7 不回) retained | retained 应为 true，红 |
| retention 把 immature 算失败 | F(6d23h) mature | mature 应为 0，红 |
| recall denominator 含 SKIPPED | independent recall den | 4→5，红 |
| recall numerator 含 hint>0 或 NEW | "NEW 不入分母" | num 错，红 |
| 72h 不按 item partition | 跨 item/跨 user 乱序 | eligible 计数错，红 |
| delayed 用 created_at<now−72h | 71h59m / 恰72h 边界 | eligible 边界翻转，红 |
| not_instrumented 返回 0 | context_transfer 状态 | status 错，红 |
| speaking 无首答计入 active | U4 out | active 多算，红 |

## 复现方式
临时编辑 `lib/dashboard/aggregate.ts` 对应分支 → `npx vitest run tests/unit/dashboard-metrics.correctness.test.ts` 观察目标用例变红 → 恢复。已逐一确认 fixture 能杀死上述回归；未提交任何 buggy 版本。

## 未改冻结定义
fixture 未暴露需要改变 Metric Contract 的问题；无 Human Gate。
