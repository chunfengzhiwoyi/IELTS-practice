# Manual Review Packet — ELS-EVAL-017

| 字段 | 值 |
|---|---|
| CASE_ID | ELS-EVAL-017 |
| severity | S3 |
| category | SPEAKING_ANALYSIS |
| automation_level | B（MANUAL / SEMI-AUTO） |
| execution_status | MANUAL_REVIEW |
| run | `m3-20260909-142124` |
| product_base / runner_base | `43364c3` / `7ff7fc1` |
| current_expected（Gold） | PASS |
| packet 状态 | 确定性辅助断言全过；LLM 语义识别质量待人工抽检 |

## 1. Gold（Frozen 契约）

- **precondition**：同 015。
- **expected_behavior**：反馈命中"重复/观点单一"问题（fluency 或 mainIssue 层面）；不给 fluency 高分。
- **pass_criteria**：输出包含重复/内容单一语义；ieltsAnalysis.fluency 级别不与"存在复读"矛盾（如不判 high）。
- **failure_criteria**：判流利高分且未识别重复。
- **notes**：可用确定性重复检测做辅助断言（n-gram 重合率），但主判据是 LLM 语义识别。

## 2. Actual output（自动 probe 结果）

- `r-repetition-signal` **PASS**：确定性辅助——bigram 重合率 **0.84**（回答 "I think reading is good because it helps me relax. Reading is really good. Reading helps me relax a lot."），复读信号显著。
- `r-llm-repetition` **PASS**：scripted LLM 语义识别命中重复（`mainIssue.description="回答存在明显复读：reading/relax 多次重复，观点单一。"`）。
- `r-no-high-fluency` **PASS**：`ieltsAnalysis.fluency.level=developing`，不与"存在复读"矛盾。

## 3. Trace evidence

- 确定性 n-gram 辅助断言：`bigramOverlapRate=0.84`（证据事件 `evaluation.repetition_signal`）。
- LLM 输出：`summary="回答观点单一，多次重复同一表达。"`；`mainIssue.dimension=fluency, severity=major`。
- 级别：`fluencyLevel=developing`（非 high）。

## 4. Human question

> 对 scripted LLM 的语义识别结果做质量抽检：该回答的复读判定（观点单一、fluency 不给高分）是否合理？n-gram 0.84 作为辅助信号是否与产品端识别口径一致？

## 5. Decision field（待人工填写）

```json
{
  "case_id": "ELS-EVAL-017",
  "reviewer": "",
  "reviewed_at": "",
  "decision": "PENDING | PASS | FAIL | REQUEST_CHANGES",
  "comment": ""
}
```
