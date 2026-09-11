# Manual Review Packet — ELS-EVAL-018

| 字段 | 值 |
|---|---|
| CASE_ID | ELS-EVAL-018 |
| severity | S2 |
| category | SPEAKING_ANALYSIS |
| automation_level | B（MANUAL / SEMI-AUTO） |
| execution_status | MANUAL_REVIEW |
| run | `m3-20260909-142124` |
| product_base / runner_base | `43364c3` / `7ff7fc1` |
| current_expected（Gold） | UNVERIFIED |
| packet 状态 | 确定性状态机断言全过；"改善真实显著"待人工抽检 |

## 1. Gold（Frozen 契约）

- **precondition**：用户已有 ≥1 次历史会话（满足 totalSessions≥2 注入条件）；本次会话创建；quality gate 正常。
- **expected_behavior**：第二次 analyze 的 abilityContext 注入含历史最弱维度；computeSessionEvaluation 显示维度改善；新 ability observation evidenceStatus 判定为 IMPROVING（而非 REPEATED）。
- **pass_criteria**：重答分析质量 ≥ 首答（维度级别变化为正）；observation.evidenceStatus=IMPROVING 且带正确 source 关联；注入的 abilityContext 与历史观察一致（≤150 字，含最弱维度）。
- **failure_criteria**：改善未被识别；状态机升迁错。
- **notes（辅助人工评分）**：维度改善是否"真实显著"需人工抽检，防止把 LLM 自评当金标。

## 2. Actual output（自动 probe 结果）

- `r-evaluation` **PASS**：`computeSessionEvaluation` 结果 `overallChange=improved`、`feedbackEffectiveness=effective`、`issueResolutionRate=0.5`、`dimensionChanges.fluency=1`，evaluation 已持久化。
- `r-evidence-status` **PASS**：ability observation 状态机 `fluency: developing(REPEATED_PATTERN) → adequate(IMPROVING)`，`evidenceStatus=IMPROVING`（非 REPEATED）。
- `r-ability-context` **PASS**：第二次 analyze 注入 abilityContext（≤150 字、含最弱维度"流利度与连贯性（当前水平：发展中）"、历史反复问题与趋势、含"请关注…如果本次回答中这些问题有改善，请在 evidence 中明确标注进步"指令）。

## 3. Trace evidence

- evaluation 事件：`evaluation.evaluatedAt=2026-09-01T10:00:00.000Z`、`resolvedIssues=["观点之间缺乏过渡","回答展开不足，流利度受限。"]`、`unresolvedIssues=["词汇范围有限","缺少复合句"]`。
- observation 事件：`fluencyHistory=["developing:SINGLE_OBSERVATION","developing:REPEATED_PATTERN","developing:REPEATED_PATTERN","adequate:IMPROVING"]`。
- prompt 注入事件：abilityContext 完整文本已入 trace（含历史模式 + 不机械判定的指令）。

## 4. Human question

> 该次维度改善（fluency: developing→adequate）是否**真实显著**？——需要人工抽检 scripted 重答的语义，确认"改善被识别"不是 LLM 自评/脚本自证（gold 明确要求防止把 LLM 自评当金标）。

## 5. Decision field（待人工填写）

```json
{
  "case_id": "ELS-EVAL-018",
  "reviewer": "产品负责人（M3-P4B Human Arbitration）",
  "reviewed_at": "2026-09-10",
  "decision": "PASS",
  "comment": "M3-P4B 人工仲裁：产品负责人明确判定 PASS（source run m3-20260910-094159）。"
}
```
