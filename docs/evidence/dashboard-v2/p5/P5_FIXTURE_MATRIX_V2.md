# P5.1 — Fixture Matrix V2

## Independent Recall（显式，rate 三方一致）
| row | type | correctness | hint | in denom? | in num? |
|---|---|---|---|---|---|
| 1 | REVIEW | INDEPENDENT | 0 | ✓ | ✓ |
| 2 | REVIEW | INDEPENDENT | 1 | ✓ | ✗ |
| 3 | REVIEW | HINTED | >0 | ✓ | ✗ |
| 4 | REVIEW | FAIL | 0 | ✓ | ✗ |
| 5 | REVIEW | SKIPPED | 0 | ✗ | ✗ |
| 6 | NEW | INDEPENDENT | 0 | ✗ | ✗ |

numerator=1, denominator=4, expected/production/oracle rate = **25%**。

## Lifecycle Matrix
- U1 D1 only / U2 D3 only / U3 D7 only / U4 D1+D3+D7 / U5 D2 only → exact D1/D3/D7 不同数值。
- recent cohort age=1d：D1 ready，D3/D7 immature（非 0%）。
- maturity：age<1d→D1 immature；<3d→D3；<7d→D7。

## State semantics
zero / insufficient / not_instrumented / not_connected（P5 已证）+ error / stale（P5.1 类型接受）。

## Partial failure
五 section 之一 reject → 主结果 200/partial_error、failedSections 含名、其余可用。

## Offline reader
older valid / newer valid / malformed newest(无 results.json) → 选 newest valid；空目录→null。

## API auth
未授权 401；demo 登录态 200。
