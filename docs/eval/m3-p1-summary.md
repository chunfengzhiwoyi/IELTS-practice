# ELS Eval — M3-P1 Summary（39 Case Evaluation System）

> 目标：把只真实执行 10 Case subset 的 Eval Runner 扩展为管理全部 39 Case 的 Evaluation System。
> 本轮重点是**覆盖与执行纪律**，不是制造一个漂亮的 39 Case PASS 分数。
> run：`m3-20260909-142124`（最终验证运行）；此前迭代 `133635 / 135931 / 141902`（FAIL 归因→修复→重跑）。
> product_base=`43364c3`（M2-P3B）；eval_runner_base=`7ff7fc1`（EVAL-RUN-02）；分支 `integration/m3-p1`。

## 1. 结果总览

| 指标 | 值 |
|---|---|
| TOTAL_GOLD_CASES | 39 |
| REGISTERED_CASES | 39/39 |
| EXECUTED_CASES（PASS+FAIL） | 23 |
| AUTO_PASS（PASS） | 21 |
| FAIL | 2 |
| MANUAL_REVIEW | 10 |
| UNVERIFIED | 3 |
| BLOCKED | 3 |
| NOT_RUN | 0 |

> 纪律确认：39/39 全部进入 Registry；**进入 Registry ≠ 已执行 ≠ PASS**；未执行 Case 全部如实标注（BLOCKED/UNVERIFIED/MANUAL_REVIEW），未执行**没有**被折算为 PASS；未用部分执行结果生成"总体通过率"（EVAL-M1 分母 = 已执行 23，非 39）。

## 2. 按自动化分级

| 级别 | 数量 | 说明 |
|---|---|---|
| A（AUTO） | 29 | 全部实现 deterministic adapter 并真实执行（`tests/eval/cases/els-eval-*.eval.ts`），复用 runner harness/scripted providers/M2 trace，未复制测试框架 |
| B（MANUAL/SEMI-AUTO） | 7 | 全部建立标准 Manual Review Packet（`docs/eval/manual-review/`），确定性断言自动执行，语义判定留人工 |
| C（SPECIAL_TOOL） | 3 | 全部建立 special-tool requirement + input/output contract + adapter placeholder（`docs/eval/special-tool/`），工具缺失 → BLOCKED，不伪造执行 |

## 3. 状态明细

- **PASS（21）**：001, 002, 003, 004, 005, 007, 008, 009, 011, 014, 015, 021, 024, 027, 028, 029, 031, 032, 036, 037, 038
- **FAIL（2，真实产品缺口 → 只登记 Bad Case，不修产品）**：
  - `ELS-EVAL-026`（S2, RETRIEVAL/PROMPT）：注入互斥 register 指引后两条矛盾 guidance **同时命中并并列注入 prompt**，产品无 conflict detection/resolution → `r-conflict-detected` FAIL。→ `BC-M3-001`
  - `ELS-EVAL-033`（S3, OUTPUT_VALIDATION）：callLlmStructured 正确抛 MODEL_SCHEMA_MISMATCH，但 learn/card 路由 `toAppError` 将其折叠为 `MODEL_ERROR`（502）→ 错误码透传缺口。→ `BC-M3-002`
- **MANUAL_REVIEW（10）**：006, 010, 016, 017, 018, 019, 020, 022, 023, 030（结构/状态机断言全过，语义与内容质量留人工）
- **UNVERIFIED（3）**：012（runner 无 replay==snapshot 重建能力）、025（产品无 retrieval precision warning + knowledge.retrieved 事件未单独埋点）、035（r3 响应契约层能力边界）
- **BLOCKED（3，纯 C 级能力缺失）**：013（replay_job）、034（E2E browser + 真实 STT）、039（trace/context acceptance tool）

## 4. Metrics（EVAL-M1 … EVAL-M10）

| 指标 | 定义 | 值 |
|---|---|---|
| EVAL-M1 Eval Pass Rate | case 级 PASS / (PASS+FAIL) = 21/23 | 91.3% |
| EVAL-M2 Bad Case Rate | 行级 FAIL / 已执行行 = 2/103 | 1.94% |
| EVAL-M3 Critical Failure Rate | S1 FAIL 行 / 已执行行 | 0% |
| EVAL-M4 Intent Accuracy | M4 域行 | 100% |
| EVAL-M5 State Consistency | M5 域行 | 100% |
| EVAL-M6 Retrieval Success | M6 域行 | 100% |
| EVAL-M7 Answer Judge Accuracy | M7 域行 | 100% |
| EVAL-M8 Speaking Feedback Quality | M8 域行 | 100% |
| EVAL-M9 Fallback Success | M9 域行 | 100% |
| EVAL-M10 Release-Blocking Rate | (S1 + 阻断型 S2) FAIL 行 / 已执行行 | 0% |

> 行级：已执行 103 行（PASS 101 / FAIL 2，无 S1 FAIL 行）。**M1 不是 39 Case 总体通过率**。

## 5. Bad Case Registry（只登记，不修复）

- `docs/eval/bad-case-registry.json`：Frozen 15-field schema + 生命周期 `OPEN → TRIAGED → FIX_IN_PROGRESS → FIXED_PENDING_REGRESSION → VERIFIED_CLOSED`。
- 当前 2 条，均 `TRIAGED`（已归因、未修复——按 §9 不修产品）：`BC-M3-001`（026, S2, RETRIEVAL）、`BC-M3-002`（033, S3, OUTPUT_VALIDATION）。
- 每条含 case_id / run_id / trace_id / root_cause_layer / product_commit / fix_commit / regression_runs 关联。

## 6. Historical Evolution Evidence（保留，不覆盖）

- 已有 `PRE-M1 / Before Fix / After Integration` 历史文档原样保留：`baseline-current.md`、`baseline-phase0.md`、`baseline-after-integration.md`、`evolution-m2.md`、`historical-vs-current.md`。
- 008/035/037/038 已作为历史 Evolution Evidence 接入 Registry（`bad-case-registry.json → historical_evolution_evidence`）：008 FIXED（BC-008）、035 FIXED 结构部分（BC-035 code-only，r3 能力边界保留）、037 FIXED at M1、038 FIXED at M2 Phase 1/2；M3 状态 008 PASS / 035 UNVERIFIED / 037 PASS / 038 PASS，与 After Integration 一致，无回退。

## 7. 验证（§10，全部通过）

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 error |
| Eval Runner own tests（`npx vitest run --config tests/eval/vitest.config.ts`） | 44 tests 全过（39 注册断言 + 10 Case 回归断言 + manifest/env 快照断言） |
| 已实现 Case adapters | 29 A deterministic + 7 B probe + 3 C placeholder 全部就位/执行 |
| 原 10 Case regression | 与 `phase0-20260909-115825` 基线逐项一致，**零漂移**（008/009/011/032/037/038 PASS、010/022 MR、012/035 UNVERIFIED） |
| 产品边界 | `git diff 43364c3 -- app components lib supabase` 为空；`data/knowledge/knowledge-objects-v1.json` 已恢复 HEAD 原字节（026 fixture 清理） |

## 8. 交付物

| 文件 | 说明 |
|---|---|
| `docs/eval/m3-case-inventory.md` | 39 Case 全量清单（CASE_ID/severity/category/automation_level/execution_status/missing_capability/required_trace_fields） |
| `docs/eval/m3-runner-coverage.md` | 39/39 Registry + 六态计数 + A/B/C 扩展 + 10 Case 回归 + Metrics |
| `docs/eval/bad-case-registry.json` | Frozen 15-field Bad Case Registry + 生命周期 + 历史 Evolution Evidence |
| `docs/eval/m3-p1-summary.md` | 本文件（含 AGENT_HANDOFF） |
| `docs/eval/manual-review/els-eval-{006,016,017,018,019,023,030}.md` | 7 个 B 级 Manual Review Packet |
| `docs/eval/special-tool/els-eval-{013,034,039}.md` | 3 个 C 级 Special-Tool Requirement |

---

## AGENT_HANDOFF

```
TASK_ID:            M3-P1
STATUS:             COMPLETE（交付物齐备、验证全过；产品 Bad Case 未修，符合 §9/任务单约束）
PRODUCT_BASE:       43364c3
EVAL_RUNNER_BASE:   7ff7fc1
TOTAL_GOLD_CASES:   39
REGISTERED:         39
EXECUTED:           23
PASS:               21
FAIL:               2（026 / 033，真实产品缺口）
MANUAL_REVIEW:      10
UNVERIFIED:         3
NOT_RUN:            0
BLOCKED:            3（013 / 034 / 039，C 级能力缺失）
A_LEVEL_IMPLEMENTED: 29/29
B_LEVEL_PACKETS:    7/7
C_LEVEL_SPECIAL_REQUIREMENTS: 3/3
BAD_CASE_REGISTRY_STATUS: TRIAGED ×2（BC-M3-001=026 S2 RETRIEVAL；BC-M3-002=033 S3 OUTPUT_VALIDATION）
REGRESSIONS:        10 Case 基线零漂移（008/009/011/032/037/038 PASS、010/022 MR、012/035 UNVERIFIED）
NEXT_RECOMMENDATION:
  1. 产品侧（非本任务范围，仅建议）：
     - 026：检索层实现 register/context 冲突检测与消解（conflict_resolution），修复后重跑 026 至 PASS 再升 FIXED_PENDING_REGRESSION。
     - 033：toAppError 透传 LlmError.llmKind（MODEL_SCHEMA_MISMATCH），修复后重跑 033 至 r-error-code PASS。
  2. Runner 侧后续：
     - 为 020/025/035 的 required_trace_fields 缺口（band_leakage_flag / knowledge.retrieved 事件 / knowledge_miss 字段）推动产品埋点，解除 UNVERIFIED/MANUAL_REVIEW。
     - C 级 3 个 special-tool（replay_job / E2E+STT / trace 回溯验收）落地后替换 placeholder。
     - 7 个 B 级 packet 人工终审（decision field 待填写）。
```
