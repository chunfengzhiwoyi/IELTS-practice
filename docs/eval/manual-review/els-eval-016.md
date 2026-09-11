# Manual Review Packet — ELS-EVAL-016

| 字段 | 值 |
|---|---|
| CASE_ID | ELS-EVAL-016 |
| severity | S2 |
| category | SPEAKING_ANALYSIS |
| automation_level | B（MANUAL / SEMI-AUTO） |
| execution_status | MANUAL_REVIEW |
| run | `m3-20260909-142124` |
| product_base / runner_base | `43364c3` / `7ff7fc1` |
| current_expected（Gold） | UNVERIFIED |
| packet 状态 | 确定性部分已自动执行；actionability 语义待人工 |

## 1. Gold（Frozen 契约）

- **precondition**：同 015；actionabilityCheck 开启。
- **expected_behavior**：actionabilityCheck 将空泛建议判为不通过 → 反馈被降级（NEEDS_REVIEW warning）或走规则引擎；最终建议必须可执行、与该回答相关。
- **pass_criteria**：若返回 LLM 结果，`quality_warning` 存在且 actionable 建议与回答内容可对应；无 actionability 的通用建议被拦截。
- **failure_criteria**：泛化建议无标记直达用户。
- **notes**：部分依赖人工评分（建议是否"可执行"需语义判断），建议 LLM+人工双轨。

## 2. Actual output（自动 probe 结果）

- `r-gate-ran` **PASS**：quality gate 真实运行，`actionabilityCheck=100`、`evidenceConsistencyCheck=70`、total=20 → outcome=`fail`。
- `r-intercepted` **PASS**：泛化建议（actionability 不达标）被拦截——`ieltsPresent=false`、`vagueVisible=false`，走规则引擎路径（`rulePath=true`），响应为规则候选问题，无空泛 LLM 建议直达用户。

## 3. Trace evidence

- validation.result（`speaking_quality_gate`）：`quality_warning="summary 为空或过短（< 10 字符）; ieltsAnalysis.fluency.evidence 中未找到与用户回答相关的引用; …"`。
- 规则路径：`fallback.triggered` / `analysis_path=rule`，响应 snippet 为 `candidateIssues`（回答过短、连接词不足等），非 LLM 泛化建议。
- 注入：scripted LLM 输出含空泛建议（"继续练习"风格），gate 正确降级。

## 4. Human question

> 被 gate 拦截后的规则引擎反馈，其最终建议对该回答是否可执行、与回答相关？（gold 要求"最终建议必须可执行、与该回答相关"——需语义确认规则引擎候选建议的质量）

## 5. Decision field（待人工填写）

```json
{
  "case_id": "ELS-EVAL-016",
  "reviewer": "产品负责人（M3-P4B Human Arbitration）",
  "reviewed_at": "2026-09-10",
  "decision": "PASS",
  "comment": "M3-P4B 人工仲裁：产品负责人明确判定 PASS（source run m3-20260910-094159）。"
}
```
