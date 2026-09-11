# ELS Eval Runner — Current Baseline（M1 + M2 Phase 1 + Phase 2）

> Deterministic Phase-0 subset: 6/10（另有 2 个 MANUAL_REVIEW、2 个 UNVERIFIED、0 个 BLOCKED 不计入判定；spec 全集 39 cases，本 baseline 不推算总分）

## Run Snapshot

| 字段 | 值 |
|---|---|
| run_id | `phase0-20260909-115825` |
| spec | ELS_EVALUATION_V1_1 v1.1（case_set ELS-EVAL-V1.1） |
| git | `2a9e3834` @ `eval/m2-run-02`（dirty） |
| worktree | `D:\Codex\IELTS-eval-m2-run-02` |
| node / vitest | v22.23.2 / v2.1.9 |
| data provider | memory（memory 实现，非 Supabase） |
| auth | demo（demo user） |
| llm | scripted mock（mock，无真实 LLM 调用） |
| started_at | 2026-09-09T11:58:26.155Z |

## 结果总览

| 状态 | 数量（case 级） |
|---|---|
| 执行（PASS+FAIL） | 6 |
| ✅ PASS | 6 |
| ❌ FAIL | 0 |
| 🔎 MANUAL_REVIEW（结构自动通过，语义需人工） | 2 |
| ◐ UNVERIFIED（覆盖不完整，不当 PASS） | 2 |
| ⛔ BLOCKED（含基础设施/缺能力） | 0 |
| SKIPPED | 0 |

## Metrics（§3 口径）

| 指标 | 定义 | 值 |
|---|---|---|
| EVAL-M1 Eval Pass Rate | case 级 PASS / (PASS+FAIL) | 100% |
| EVAL-M2 Bad Case Rate | 行级 FAIL / 已执行行 | 0% |
| EVAL-M3 Critical Failure Rate | S1 FAIL 行 / 已执行行 | 0% |
| EVAL-M10 Release-Blocking Rate | (S1 + 阻断型 S2) FAIL 行 / 已执行行 | 0% |

> 行级分母：已执行 40 行（PASS 40 / FAIL 0）。
> Phase 0 阻断型 S2 Registry 为空（size=0）→ **EVAL-M10 == EVAL-M3**。
> SKIPPED / UNVERIFIED / MANUAL_REVIEW / BLOCKED 均不计入任何分母，不允许被当 PASS。

## Case 明细

| Case | Category | 状态 | Severity | Failure Layer | Rows (P/F) | 延迟 ms | Spec current_expected |
|---|---|---|---|---|---|---|---|
| ELS-EVAL-008 | ANSWER_JUDGEMENT | ✅ PASS | S3 | BUSINESS_RULE | 8/0 | 30.38 | PASS |
| ELS-EVAL-009 | REVIEW_SCHEDULING | ✅ PASS | S2 | STATE_READ | 3/0 | 17.15 | PASS |
| ELS-EVAL-010 | REVIEW_SCHEDULING | 🔎 MANUAL_REVIEW | S2 | STATE_READ | 1/0 | 3.11 | PASS |
| ELS-EVAL-011 | REVIEW_SCHEDULING | ✅ PASS | S2 | BUSINESS_RULE | 4/0 | 6.08 | PASS |
| ELS-EVAL-012 | REVIEW_SCHEDULING | ◐ UNVERIFIED | S2 | BUSINESS_RULE | 4/0 | 3.64 | PASS |
| ELS-EVAL-022 | RETRIEVAL_KNOWLEDGE | 🔎 MANUAL_REVIEW | S2 | RETRIEVAL | 4/0 | 4.71 | PASS |
| ELS-EVAL-032 | FALLBACK_FAILURE | ✅ PASS | S3 | FALLBACK | 4/0 | 3.9 | PASS |
| ELS-EVAL-035 | FALLBACK_FAILURE | ◐ UNVERIFIED | S3 | RETRIEVAL | 3/0 (+1B) | 3.77 | PASS |
| ELS-EVAL-037 | CROSS_MODULE_STATE | ✅ PASS | S1 | STATE_WRITE | 5/0 | 2.84 | PASS |
| ELS-EVAL-038 | CROSS_MODULE_STATE | ✅ PASS | S1 | STATE_WRITE | 4/0 | 4.96 | FAIL |

## 发现的 Bad Case（只记录，不修复）

_本次 run 无 FAIL / BLOCKED case。_

## 未覆盖断言（依赖下一阶段能力）

- **M2 Trace 字段级 schema 断言**：当前 checkpoint 已实现 M2 Phase 1+2 Trace（008/035/037/038 已记录 trace 证据至 evidence），逐字段 schema 校验（event_type/layer/status 枚举）留待 Trace Conformance Case。
- **真实 LLM 内容质量**：词卡/判题解释的内容一致性（022 等）需真实 LLM 或人工金标 → MANUAL_REVIEW。
- **事件重放重建（012）**：runner 侧无 replay==snapshot 重建能力 → capability_missing（非产品缺陷）。
- **Supabase 仓库路径（037/038）**：Phase 0 仅 memory provider。
- **未选入 subset 的 29 个 case**：含需真实 LLM / 浏览器 / M2 Trace 的场景，Phase 1+ 逐步接入。

## 复现

```bash
npm run eval:phase0   # vitest run --config tests/eval/vitest.config.ts && tsx scripts/eval/generate-baseline.ts
```

原始数据：`docs/eval/runs/phase0-20260909-115825/results.json`
