# P5.1 — Correctness Report V2

三方一致：A=expected / B=production aggregate / C=independent oracle。每个 rate 三项数学一致。

## Independent Recall（显式 fixture，修正此前矛盾）
fixture：REVIEW INDEPENDENT hint0 / REVIEW INDEPENDENT hint1 / REVIEW HINTED / REVIEW FAIL / REVIEW SKIPPED / NEW INDEPENDENT。
- numerator = 1（仅第 1 行）
- denominator = 4（前四行非 SKIPPED REVIEW；SKIPPED 与 NEW 都排除）
- **expected rate = 25%**
- production = **25%**（sampleSize=4）
- oracle = num 1 / den 4 → **25%**
- 结论：PASS（不再有“25%→50%”模糊描述）。

## Lifecycle Matrix exact D1/D3/D7（Human 冻结，无 ambiguity）
- U1 D1 only / U2 D3 only / U3 D7 only / U4 D1+D3+D7 / U5 D2 only → exact-day cell 不同数值。
- recent cohort（age 1d）：D1 ready，D3/D7 **immature**（不返回 0%）。
- maturity：age<1d D1 immature；age<3d D3 immature；age<7d D7 immature。
- 分母=该 activation cohort 原始 N。PASS。

## 其他
| 项 | 证据 | 结论 |
|---|---|---|
| error state | composeDashboard 失败 section 返回 {status:"error"} | PASS |
| stale contract | Metric union 含 stale{value,lastSuccessfulSync}；未虚构生产 cache | PASS |
| partial failure | 一 section reject → meta.dataStatus=partial_error、failedSections 含该 section、其余 4 section 可用 | PASS |
| offline reader | malformed newest（无 results.json）被跳过，选 newest valid；空目录→null | PASS |
| authenticated API | demo 登录态 GET /api/dashboard?range=7d → **200** sourceMode=real | PASS |
| unauthorized API | supabase 模式无 cookie → 7d/30d/all 均 401（P4.1） | PASS |

## 结果
- vitest：**26 passed / 26**
- tsc --noEmit：PASS；next build：PASS
- SECURITY_BLOCKER_FOR_PRODUCTION 与 EVAL_ARTIFACT_DEPLOYMENT_RISK 继续 REGISTERED（requireUser 只证明登录，不证明跨用户聚合权限）。

```text
PHASE: P5.1 — Correctness Closure
STATUS: PASS
SOURCE_OF_TRUTH_CHANGED: NO
NEXT: P6 — Trace Durability
```
