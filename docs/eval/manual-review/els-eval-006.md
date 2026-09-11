# Manual Review Packet — ELS-EVAL-006

| 字段 | 值 |
|---|---|
| CASE_ID | ELS-EVAL-006 |
| severity | S2 |
| category | ANSWER_JUDGEMENT |
| automation_level | B（MANUAL / SEMI-AUTO） |
| execution_status | MANUAL_REVIEW |
| run | `m3-20260909-142124` |
| product_base / runner_base | `43364c3` / `7ff7fc1` |
| current_expected（Gold） | UNVERIFIED |
| packet 状态 | 确定性部分已自动执行；语义判定待人工 |

## 1. Gold（Frozen 契约）

- **precondition**：词 `mitigate`；已配置 acceptedAnswers/answerKeywords 作为判题输入。
- **expected_behavior**：全部判对；正确率映射独立正确分支（学习 INDEPENDENT / 复习 CORRECT_INDEPENDENT，若未看提示）。
- **pass_criteria**：各行 gold 均为 correct=true 且实际判定一致；学习提交 → INDEPENDENT + 对应初始档；复习提交 → CORRECT_INDEPENDENT（+72h、recall_level+1）。事件层与状态层值须经 trace 核验，不得以 api_result 直接代写。
- **failure_criteria**：任一行 False Reject；或该 Case 与 005 出现同侧系统性偏移。
- **notes（人工复核项）**：LLM 判"对"本身仍需抽样人工确认 gold 合理（防止把错误 gold 固化成回归）。

## 2. Actual output（自动 probe 结果）

- `r-learn-chain` **PASS**：scripted judge=true 下 3 个近义表述（"to reduce the harmful effects of something" / "make the damage less severe" / "to make something bad less harmful"）全部判定正确，状态推进 `RECALLED_INDEPENDENTLY`，nextReviewAt 符合初始档。
- `r-review-chain` **PASS**：复习提交 → `CORRECT_INDEPENDENT`（+72h，recallLevel 1→2），state 写入一致（consecutiveCorrect=2, currentIntervalDays=3）。

## 3. Trace evidence

- learn 链路：3× `state.write`（inserted），`status=RECALLED_INDEPENDENTLY`，`nextReviewAt=2026-09-02T10:00:00.000Z`。
- review 链路：`response.eventId=evt-1788256800000-xrc5pr`，`result=CORRECT_INDEPENDENT`，`stateAfter.recallLevel=2`、`nextReviewAt=2026-09-04T10:00:00.000Z`；trace 事件含 `request.received → judge (rule/llm) → state.write → response.sent`。
- 状态层与事件层值一致（非 api_result 直写）。

## 4. Human question

> 这 3 个近义表述被 scripted judge 判为 correct=true 的 gold 是否合理？（多义词/文化背景词另建 Case 不在此堆量）判题链条是否存在与 005 同侧的系统性偏移风险？

## 5. Decision field（待人工填写）

```json
{
  "case_id": "ELS-EVAL-006",
  "reviewer": "产品负责人（M3-P4B Human Arbitration）",
  "reviewed_at": "2026-09-10",
  "decision": "PASS",
  "comment": "M3-P4B 人工仲裁：产品负责人明确判定 PASS（source run m3-20260910-094159）。"
}
```
