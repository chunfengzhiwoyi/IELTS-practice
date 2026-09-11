# P4.1 — RealRepository 报告 V2

- 日期：2026-09-10
- 修复 4 个指标口径（按 Human 冻结定义）+ API 鉴权 + 两项 deployment/security 登记。
- 数据库当前为空；本阶段证明公式与冻结语义一致，**不声称数据正确性已被真实数据证明**（留给 P5 fixture）。

## 指标口径修复
| 指标 | V1 作废 | P4.1 冻结实现 | readiness |
|---|---|---|---|
| active learners | 仅 learning_events | learning_events ∪ 已首答 speaking_sessions（user_id 去重） | exact + proxy |
| closed-loop | NEW INDEPENDENT + REVIEW | 任一 Module Success Loop（Learn/Review 非 SKIPPED；Speaking 首答+反馈+重答+evaluation） | proxy + exact |
| activation | 24h 内首 REVIEW | first_use_at=最早 valid activity；activation_at=最早闭环；≤first+24h | exact |
| top-level D7 | D7±1 | mature=act≤end−7d；retained=D1–D7 任一自然日 valid activity | exact |
| independent recall | 正确 | 保持 REVIEW INDEPENDENT hint0 / 非 SKIPPED | exact |
| delayed 72h | — | 确认 PARTITION user+item ORDER created_at，按事件序间隔判定 | exact |

## speaking qualifying 最小规则
`speaking_sessions.first_answer IS NOT NULL` 视为真实口语学习活动（最小业务事实）。Speaking 闭环需 first_answer + main_issue 非空 + second_answer + speaking_evaluations 行。Learn/Review 的 state-write 成功以事件行持久化为 derivable proxy（无独立审计列）。

## API safety
- 所有 `/api/dashboard/*` 接入 `requireUser()`；未授权实测 7d/30d/all 均 **401**。
- 仓库无 admin primitive → 登记 `SECURITY_BLOCKER_FOR_PRODUCTION`（禁止 P8/P9，本地开发继续）。
- 登记 `EVAL_ARTIFACT_DEPLOYMENT_RISK`（P8 Preview 验证 docs/ 随部署产物）。

## 门禁
| 项 | 结果 |
|---|---|
| typecheck | PASS |
| build | PASS |
| API 7d/30d/all | 未授权 401（鉴权生效） |
| closed-loop / activation / D7 语义对齐 | PASS |
| speaking included in activity | PASS |
| independent recall | PASS |
| 72h ordering rule | PASS |
| API safety | PASS（未授权 401）+ PRODUCTION_BLOCKER 已登记 |

## 交付
- P4_REAL_REPOSITORY_REPORT_V2.md / P4_METRIC_FORMULA_AUDIT.md / P4_API_SAFETY_AUDIT.md / P4_API_RESPONSE_SAMPLES_V2.json

```text
PHASE: P4.1 — Metric Alignment & API Safety Repair
STATUS: PASS
SOURCE_OF_TRUTH_CHANGED: NO
SECURITY_BLOCKER_FOR_PRODUCTION: REGISTERED
EVAL_ARTIFACT_DEPLOYMENT_RISK: REGISTERED
NEXT: P5 — Correctness Tests（构造 fixture 覆盖非零场景）
```
