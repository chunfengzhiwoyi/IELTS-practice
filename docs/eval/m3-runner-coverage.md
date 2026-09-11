# ELS Eval — M3-P1 Runner Coverage（39/39 Registry + 执行纪律）

> run：`m3-20260909-142124`（最新全量运行；此前迭代 `133635 / 135931 / 141902` 均为修复轮）
> 产物：`docs/eval/runs/m3-20260909-142124/results.json`
> product_base=`43364c3`；eval_runner_base=`7ff7fc1`；分支 `integration/m3-p1`

## 1. 核心口径（§2）

- **进入 Registry ≠ 已执行 ≠ PASS**：39/39 全部注册（`tests/eval/runner/registry.ts`），只有 23 个 Case 被真实执行（PASS+FAIL）。
- 未执行 Case 状态 ∈ {UNVERIFIED, MANUAL_REVIEW, BLOCKED, NOT_RUN}，**禁止把未执行算 PASS**。
- 禁止用部分执行结果生成“总体通过率”：EVAL-M1 分母 = 已执行 Case（23），不是 39。

## 2. Coverage 快照（m3-20260909-142124）

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

状态分布：

| status | count | cases |
|---|---|---|
| PASS | 21 | 001, 002, 003, 004, 005, 007, 008, 009, 011, 014, 015, 021, 024, 027, 028, 029, 031, 032, 036, 037, 038 |
| FAIL | 2 | 026（S2 冲突检测缺失）, 033（S3 错误码折叠） |
| MANUAL_REVIEW | 10 | 006, 010, 016, 017, 018, 019, 020, 022, 023, 030 |
| UNVERIFIED | 3 | 012（runner 缺 replay 重建能力）, 025（retrieval precision warning 能力缺失）, 035（r3 契约层 BLOCKED 语义） |
| BLOCKED | 3 | 013, 034, 039（C 级 special-tool 缺失） |

## 3. A 级扩展（29/29 deterministic adapter）

- 全部 29 个 A Case 均有真实执行的 deterministic adapter（`tests/eval/cases/els-eval-*.eval.ts`），复用同一套 harness：
  `runner/harness.ts`（reset/clock/script/rec）+ `runner/stub-llm.ts`（scripted providers + 构造器）+ `runner/http.ts`（callRoute/evalTraceId）+ `runner/store.ts` + `runner/metrics.ts`（冻结分级表）。未为每个 Case 复制测试框架。
- 语义映射冻结（Gold intent ↔ 产品枚举）：NEW_ITEM/SHOW_WORD_CARD→START_LEARN、REVIEW/OPEN_REVIEW→START_REVIEW、SPEAKING/OPEN_SPEAKING→START_SPEAKING、REPORT/SHOW_REPORT→VIEW_REPORT、UNSUPPORTED→NONE。
- 适配器修复记录（仅 runner 侧，产品零修改）：
  - `http.ts` evalTraceId 转义（`trc_eval_001-learn_0` → `trc_eval_001_learn_0`，修复 traceIdFromHeaders 全丢）；
  - review/submit 请求补 `skipped` 字段、learn/card 响应字段 `item.id`（非 itemId）；
  - `speakingGateOf` helper：validation.result 需区分 `zod:SpeakingAnalysis` 与 `speaking_quality_gate`（同一 trace 两次事件）；
  - stub `speakingAnalysisJson` 支持 levels 覆盖（维度 level 不再硬编码）；
  - 031 env cache reset（`resetServerEnvCacheForTests` 在改 env 后调用）；
  - 026 fixture 前置 unshift（检索 top-5 截断问题）；
  - 020 band 扫描口径收窄（排除 quality_gate_scores 内部数字误报）；
  - 014 statusDistribution 零计数键口径、029/002 断言极性修正。

## 4. B 级 Manual Review Packet（7/7 就绪）

每个 B Case 一份标准 Packet（`docs/eval/manual-review/els-eval-00X.md`）：Gold / actual output / trace evidence / human question / decision field。
确定性断言已自动执行（结构、状态机、gate 行为），语义判定（actionability 可执行性、复读识别质量、改善显著性、S1 幻觉红线、无据进步结论）留待人工终审。

| Case | 确定性断言（自动） | 人工判定项 |
|---|---|---|
| 006 | scripted judge=true 语义等价链路 | judge 判定是否合理 |
| 016 | gate 运行 + 空泛建议拦截/标记 | 最终建议可执行性与回答对应 |
| 017 | bigram 重合率 0.84 + 语义识别 + fluency 不给高分 | 复读识别质量抽检 |
| 018 | evaluation=improved + evidenceStatus=IMPROVING + abilityContext 注入 | 改善是否真实显著 |
| 019 | gate 检出 EVIDENCE_MISMATCH + 幻觉可见性事实收集 | S1 红线仲裁（不自动判） |
| 023 | 语义召回 miss 记录 + 词卡不污染 | 语义检索缺口定级（P0-4） |
| 030 | API 响应全文无进步/提升/突破词汇 | UI E2E 前端文案层全面扫描 |

## 5. C 级 Special-Tool Requirement（3/3 就绪，不伪造执行）

每个 C Case 一份契约文档（`docs/eval/special-tool/els-eval-00X.md`）：special-tool requirement + input/output contract + adapter placeholder。
工具不存在 → 状态 = BLOCKED（BLOCKED_BY_CAPABILITY），不伪造执行。

| Case | 所需 special-tool | 状态 |
|---|---|---|
| 013 | replay_job（离线重放器：事件流→状态重建 + checksum 比对） | BLOCKED |
| 034 | E2E browser（文字输入回退路径可达性）+ 真实 Whisper/STT 管线 | BLOCKED |
| 039 | special trace/context acceptance tool（memory write ↔ trace_id 回溯验收） | BLOCKED |

## 6. 10 Case 回归（无漂移）

FROZEN_10_CASE_BASELINE（`cases/index.ts` 硬编码）已与旧 run `phase0-20260909-115825/results.json` 实际结果核对一致；
M3 全量运行下该 10 Case 状态与基线逐项一致：

| Case | phase0 基线 | m3-20260909-142124 | 漂移 |
|---|---|---|---|
| 008 | PASS | PASS | 无 |
| 009 | PASS | PASS | 无 |
| 010 | MANUAL_REVIEW | MANUAL_REVIEW | 无 |
| 011 | PASS | PASS | 无 |
| 012 | UNVERIFIED | UNVERIFIED | 无 |
| 022 | MANUAL_REVIEW | MANUAL_REVIEW | 无 |
| 032 | PASS | PASS | 无 |
| 035 | UNVERIFIED | UNVERIFIED | 无 |
| 037 | PASS | PASS | 无 |
| 038 | PASS | PASS | 无 |

## 7. Metrics（EVAL-M1 … EVAL-M10）

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

> 行级：已执行 103 行（PASS 101 / FAIL 2）。**M1 是已执行 Case 的通过率，不是 39 Case 总体通过率**。
> M10 阻断型 S2 判定随 `bad-case-registry.json`（026 已登记 S2，评估中，暂不按阻断行计入）。

## 8. 验证（§10）

- `npx tsc --noEmit` → 0 error。
- Eval Runner own tests：`npx vitest run --config tests/eval/vitest.config.ts` → 44 tests 全过（含 39 注册断言 + 10 Case 回归断言 + run_id/env 快照断言）。
- 已实现 adapters：29 A + 7 B probe + 3 C placeholder 全部真实执行/占位。
- 原 10 Case regression 状态零漂移（见 §6）。
- 产品树：`git diff 43364c3 -- app components lib supabase` 为空（产品代码零修改）；`data/knowledge/knowledge-objects-v1.json` 已恢复为 HEAD 原字节（026 fixture 注入后 finally 恢复，语义一致）。
