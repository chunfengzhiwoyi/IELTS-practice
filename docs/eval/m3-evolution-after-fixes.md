# ELS Eval — Evolution After Fixes（M3-P1 → EVAL-RUN-M3-02）

> 产品 checkpoint：`55806ba`（BC-026 + BC-033 core + BC-033 safety patch），集成验证（typecheck/build/BC regression/smoke）由 Builder/Integration 侧完成，**本表只采用独立 Eval 真实运行结果**。
> Eval 运行：`m3-20260910-070726`（worktree `D:\Codex\IELTS-eval-m3-run-02`，branch `eval/m3-run-02`，Eval System = `f0ac513`）。
> 说明：M3-02 列均为本轮真实执行结果，非继承上一轮状态。

## 1. 修复目标 Case 演化

| Case | M3-P1 Before Fix（m3-20260909-143153） | M3-02 After Fix（m3-20260910-070726） | 分类 |
|---|---|---|---|
| **ELS-EVAL-026** | FAIL（r-conflict-detected：conflictDetected=true, resolutionTracked=false） | **PASS**（conflictDetected=true, resolutionTracked=true；无伪优先级） | **FIXED → FIXED_PENDING_REGRESSION** |
| **ELS-EVAL-033** | FAIL（r-error-code：kind=MODEL_ERROR 折叠） | **PASS**（LLM 层 / API / response.sent 均为 MODEL_SCHEMA_MISMATCH；无 provider 切换） | **FIXED → FIXED_PENDING_REGRESSION** |

### ELS-EVAL-026 细节

- 修复提交：`48e16c2`（lib/knowledge/conflict.ts 确定性极性冲突检测 + retrieval.ts 输出 conflict_* 字段 + prompt 双源并陈差异提示 + card 路由 retrieval.executed 埋点）。
- 实测证据（r-conflict-detected PASS）：
  - conflict fixture 真实检测：`knowledgeObjectIds=[pt-topic-environment, fx-register-conflict-a, fx-register-conflict-b, lg-register-writing-task2, lg-paraphrase-guidance]`；
  - resolution 被跟踪：`conflict_resolution=dual_source_with_conflict_note`、`conflict_object_ids=[fx-a, fx-b]`；
  - 非静默并列：prompt 末尾附加 `[冲突提示] …两条指引不能同时成立，此处已并陈且不自动取舍…`（r-no-contradiction PASS）；
  - 无伪优先级：产品明确"不自动取舍"，未建立任何 Frozen Gold 禁止的硬优先级规则。

### ELS-EVAL-033 细节

- 修复提交：`f5e4891`（AppError/LlmError 具体 kind 保留）+ `e1464c8`（MODEL_ERROR unknown-message safety patch）。
- 实测证据（3/3 行 PASS）：
  - r-error-code：`error.kind=MODEL_SCHEMA_MISMATCH`（structured=true）；
  - r-readable：message="无法为「galvanize」生成词卡: Schema 校验失败: …"（可读、无部分结果静默返回）；
  - r-no-switch：`fallback.triggered=0`（无 provider 切换）、repairAttempts=1（修复已尝试）；
  - LLM 层 trace：`llm.attempt.llm_error_code=[MODEL_SCHEMA_MISMATCH, MODEL_SCHEMA_MISMATCH]`（主调用 + 修复调用）；
  - trace 事件链：`request.received → retrieval.executed → llm.attempt → validation.result → llm.attempt → validation.result → response.sent`（026 检索 + 033 schema 判定同链路共存，§6 组合回归成立）。

## 2. 既有稳定 PASS Case 回归（无 NEW_REGRESSION）

| Case | M3-P1 | M3-02 | 关键断言 |
|---|---|---|---|
| 008 | PASS | PASS | punctuation 确定性短路（empty/spaces/punct/newline × learn/review 8/8） |
| 009 | PASS | PASS | due 队列读取 |
| 011 | PASS | PASS | 调度状态推进 |
| 032 | PASS | PASS | repair 成功后不误判 |
| 037 | PASS | PASS | duplicate replay 不二次推进（event 单推、幂等响应、无 5xx） |
| 038 | PASS | PASS | Server Repository SSOT（learn/due/review/report 服务端驱动一致） |

> **NEW_REGRESSIONS = 0**。008/037/038 三个重点回归对象全部保持 PASS。

## 3. 其余状态（保持 M3 discipline，未强行变绿）

| 状态 | M3-P1 | M3-02 | Case |
|---|---|---|---|
| MANUAL_REVIEW | 10 | 10 | 006, 010, 016, 017, 018, 019, 020, 022, 023, 030（B 级 packet 未人工终审，维持 MANUAL_REVIEW） |
| UNVERIFIED | 3 | 3 | 012, 025, 035（能力/契约缺口未变化） |
| BLOCKED | 3 | 3 | 013, 034, 039（special-tool 未实现，不伪造执行） |

## 4. 历史演化证据（保留）

- 008 / 035 / 037 / 038 三时点（PRE-M1 → Before Fix → After Integration → M3-P1 → M3-02）演化已同步至 `bad-case-registry.json → historical_evolution_evidence`，历史 FAIL 未覆盖、未改写。
- 旧 run 保留：`m3-20260909-143153`（M3-P1 最终）未被覆盖；本轮新 run `m3-20260910-070726` 独立落盘。

## 5. 计数对比

| 指标 | M3-P1（143153） | M3-02（070726） |
|---|---|---|
| AUTO_ADJUDICATED（PASS+FAIL） | 23 | 23 |
| PASS | 21 | **23** |
| FAIL | 2 | **0** |
| MANUAL_REVIEW | 10 | 10 |
| UNVERIFIED | 3 | 3 |
| BLOCKED | 3 | 3 |
| NOT_RUN | 0 | 0 |
| AUTO_ADJUDICATED_PASS_RATE | 91.3% | **100%** |
