# Bad Case 008 — Deterministic Empty-Answer Boundary

> 状态：已修复（产品代码，隔离 worktree `fix/eval-008-empty-boundary`）
> 关联：ELS-EVAL-008（ANSWER_JUDGEMENT, S3）/ Frozen Gold：`ELS_EVALUATION_V1_1`
> 本文档为证据产物；**不得据此声称 ELS-EVAL-008 PASS**——需 Eval Runner 在集成后真实重跑确认。

## Problem

对「没有可评价语义内容」的答案，learn/submit 与 review/submit 仍会调用 LLM 判题。
具体：仅 trim-empty（`!answer.trim()`）会被短路；纯标点（`.`）、纯符号（`!!!`）、
emoji-only 等输入穿透到 `judgeAnswerWithLlm`，每次白白消耗一次 LLM 调用，
且结果可以预测（必然判错），属于确定性的成本浪费与行为缺口。

## Frozen Gold（未修改）

- spec：`docs/eval/spec/ELS_EVALUATION_V1_1.json`（`ELS_EVALUATION_V1_1`，case 008 = ANSWER_JUDGEMENT）
- pass_criteria（原文要点）：4 类输入（empty / spaces / newline / punctuation-only）均要求 LLM 调用计数 = 0
- 本 Bad Case 修复**不修改 Gold**，只修改产品实现使其满足 Gold。

## Before Evidence（Eval Runner 真实运行，run `phase0-20260909-072521`）

| 输入 | learn 链路 llm_calls | review 链路 llm_calls | 状态 |
|---|---|---|---|
| `""` | 0 | 0 | PASS（短路正确） |
| `"   "` | 0 | 0 | PASS（短路正确） |
| `"\n"` | 0 | 0 | PASS（短路正确） |
| `"."` | **1** | **1** | **FAIL（Bad Case）** |

- 违反行：`learn-punct`、`review-punct`（expected `llmCalls:0`，actual `llmCalls:1`）
- Case 008 整体：6/8 行通过，`status=FAIL`，`failure_layer=BUSINESS_RULE`

## Trace（修复前，M2 证据）

- `rule.applied` 事件中 **不存在** `empty_answer_short_circuit`（对 `"."`）
- 实际仅 `learning_branch_map`（learn）被触发，payload 记录 `llm_call_count: 1`
- 对照：`""` 的 trace 中有 `rule.applied(empty_answer_short_circuit)`，
  `inputs.answer_empty=true`，`outputs.llm_call_count=0` → 证明规则机制正常，
  只是触发条件 `answer.trim()===""` 过窄。

## RCA（Root Cause）

```
judgeLearnAnswer（app/api/learn/submit/route.ts）:   if (!answer.trim()) → 短路
review/submit（app/api/review/submit/route.ts）:     else if (!answer.trim()) → 短路
```
- 触发条件只覆盖「trim 后为空」；`"."` trim 后仍为 `"."`（非空）→ 未短路 → LLM。
- 两个端点各写一份相同的 trim 判空（重复实现），契约没有单一来源。
- 附带：`lib/client/demo-service.ts` 与 `tests/unit/els-eval-037-038.test.ts` 模拟器
  同样各写一份 trim 判空 → 契约漂移风险。

## Failure Layer（真实证据判定）

**BUSINESS_RULE**（learn 与 review 判定链路的确定性短路规则覆盖不足）。

依据：
1. trace 显示规则引擎（`rule.applied`）与 LLM 层（`llm.attempt`）本身工作正常——
   是业务规则（短路谓词）的触发条件过窄，不是 LLM 层故障；
2. 非 STATE_WRITE / RETRIEVAL / FALLBACK：状态写入、检索、回退均无异常，
   与 Eval Runner 记录的 `failure_layer=BUSINESS_RULE` 一致。
结论：Failure Layer = **BUSINESS_RULE**（与运行证据一致，非为迎合预设而写）。

## Options & Product Decision

| 选项 | 定义 | False Positive | False Negative | 复杂度 | IELTS 领域适配 |
|---|---|---|---|---|---|
| **A. 仅 trim-empty**（现状） | `!answer.trim()` | 无 | `"."` `"..."` `"!!!"` emoji 全部漏判 → 多余 LLM 调用 | 最低 | 不足：纯符号/emoji 仍烧 LLM |
| **B. 无字母/数字即判空** | trim 后无 `[\p{L}\p{N}]` → empty-like | 极低：IELTS 词汇释义的合法短答案必然含字母（或数字），纯标点/emoji 不可能是合法答案 | 有界：纯数字（如 `"123"`）被判为有内容 → 仍调 LLM，但结果仍是确定性 FAIL，成本有界 | 低（单条 Unicode 正则） | 覆盖全部要求输入；`"word"` `"take it for granted"` 中文均正确放行 |
| **C. 通用语义内容谓词** | 分词/词性/词典等 NLP 判定 | 取决于实现 | 取决于实现 | 高 | 过度设计；违反「不做通用 NLP parser」约束 |

### Product Decision = **Option B**

**契约表述**：`isAnswerContentEmpty(answer) := !/[\p{L}\p{N}]/u.test(answer.trim())`
（trim 后不含任何 Unicode 字母或数字 → 视为「没有可评价语义内容」→ 短路，LLM call = 0）。

**冻结边界（明确，无模糊）**：
- **emoji-only → 短路**（emoji 不属于字母/数字，无词汇语义内容；IELTS 释义场景下 emoji-only 不可能是合法答案）
- **纯数字 `"123"` → 不短路**（数字属 `\p{N}`，保守放行走 LLM；宁多一次有界 LLM 调用，不误伤潜在的合法数字答案）
- 全角标点（`。` `！？`）、`…`、`\t`、U+3000 全角空格 → 短路

**否决 Option A**：无法满足 Gold 的 punctuation-only 要求（Case 008 的核心缺陷）。
**否决 Option C**：复杂度与维护成本远超收益，违反任务约束（不设计通用 NLP parser）。

## Implementation

- 新增共享谓词：`lib/learning/answer-content.ts` → `isAnswerContentEmpty(answer)`（纯函数，无依赖，可被 server / client / test 共用）
- **Learn 与 Review 共享同一契约**（单一定义，禁止各写一份正则）：
  - `app/api/learn/submit/route.ts`：`if (isAnswerContentEmpty(answer))` → 短路（FAIL / EXPOSED / +2h）
  - `app/api/review/submit/route.ts`：`else if (isAnswerContentEmpty(answer))` → 短路（INCORRECT / +4h）
- 同步收敛同契约副本（消除漂移）：
  - `lib/client/demo-service.ts`（demo 模式判题 2 处）
  - `tests/unit/els-eval-037-038.test.ts`（simulateReviewSubmit / simulateLearnSubmit 模拟器）
- Trace：短路时仍发出 `rule.applied`，`rule_key = empty_answer_short_circuit`，
  `outputs.llm_call_count = 0`；`inputs` 保留 `answer_empty: true`（M2 已记录契约）
  并新增 `content_empty: true` 表达新语义。

## Regression

新增 `tests/unit/answer-content.test.ts`（回归表 + 冻结结果契约）：

| 输入 | 判定 | 冻结结果 |
|---|---|---|
| `""` `" "` `"\n"` `"\t"` `"　"(U+3000)` | empty-like | 短路，LLM=0 |
| `"."` `"..."` `"!!!"` `"?"` `"。"` `"！？"` `"…"` | empty-like | 短路，LLM=0 |
| `"😀"` `"😀😀🎉"` | empty-like（冻结） | 短路，LLM=0 |
| `"word"` `"take it for granted"` `"可持续的"` `"sustainable"` `"well-being"` `"word!"` `"word 😀"` | 有内容 | LLM 判题 |
| `"123"` `"3.14"` `"١٢٣"`（阿拉伯-印度数字） | 有内容（冻结：数字不短路） | LLM 判题 |

冻结的短路结果契约（与 route 分支 + 调度表一致）：
- Learn empty-like → `correctness=FAIL / status=EXPOSED / scheduleQuality=FAIL / nextReviewAt=+2h`
- Review empty-like → `result=INCORRECT / nextReviewAt=+4h`

**验证结果**（worktree `D:/Codex/IELTS-badcase-008`）：
- `tsc --noEmit`：**PASS**
- `vitest run`（全量）：**203 passed / 1 failed**——唯一失败为 `tests/unit/llm-safety.test.ts`
  （`ModelSettingsPanel.tsx` import `@/lib/llm` 静态检查），已在纯净基线 `b0ff1bf` 复跑确认
  **为基线既有失败，非本次新增**（本次改动未触及 components/ 与 @/lib/llm 导入）
- `next build`：见提交记录（后台构建结果）

## Expected Eval Outcome

修复后，Case 008 的 4 类输入（empty / spaces / newline / punctuation-only）应全部满足
`llm_call_count = 0`，`learn-punct` / `review-punct` 行应转 PASS；预期 Case 008 整体 PASS
（取决于 Eval Runner 在集成后真实重跑，本文档不代为声称 PASS）。

## Trade-off

- 收益：纯符号/emoji 输入不再触发 LLM（省调用、行为确定）；Learn/Review/Demo/测试四端共享单一定义（消除契约漂移）。
- 成本：纯数字输入（`"123"` 等）仍走 LLM——每次 1 次有界调用，结果仍确定性 FAIL；换取「绝不误伤合法数字答案」的保守方向。
- 边界：不做语义解析；`\p{N}` 覆盖全角数字/阿拉伯-印度数字等 Unicode 数字（保守放行）。
- 风险：若未来引入「数字即答案」的题型，`isAnswerContentEmpty` 无需改动（数字本就走 LLM）；若未来引入「emoji 表意」题型，需重新审视冻结决策（当前冻结：emoji-only 短路）。
