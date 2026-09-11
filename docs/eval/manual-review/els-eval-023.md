# Manual Review Packet — ELS-EVAL-023

| 字段 | 值 |
|---|---|
| CASE_ID | ELS-EVAL-023 |
| severity | S3 |
| category | RETRIEVAL_KNOWLEDGE |
| automation_level | B（MANUAL / SEMI-AUTO） |
| execution_status | MANUAL_REVIEW |
| run | `m3-20260909-142124` |
| product_base / runner_base | `43364c3` / `7ff7fc1` |
| current_expected（Gold） | PASS |
| packet 状态 | 行 2（miss 记录 + 不污染）自动通过；行 1（语义覆盖）为 FUTURE_TARGET 待人工定级 |

## 1. Gold（Frozen 契约）

- **precondition**：知识库含 topic=environmental impact 的 lexical_guidance，其 appliesTo 含概念相关但字面不同词。
- **expected_behavior**：检索能通过 context 规则或语义召回命中相关 lexical_guidance，词卡获得该指导。
- **pass_criteria**：行 1（目标）相关对象被召回（semantic coverage）；行 2 若未召回（当前引擎预期），生成必须仍成功且 generationMeta 标记 knowledge_miss=true，词卡内容**不**与知识库冲突。
- **failure_criteria**：生成被污染（注入无关对象）或在无召回时产生与知识库冲突内容。
- **notes（[FIX-05] capability-oriented）**：Gold 只规定"语义相关内容应被合理召回"，**不绑定实现技术**（关键词/规则/语义向量/混合方案待真实 Baseline Eval 后定，当前能力缺口对应审计 P0-4 检索升级项）。当前关键词引擎按设计会漏召回：改造前按行 2 口径记录 miss 并保证生成不被污染（不当 S1 缺陷上报）；改造后行 1 语义覆盖须达标。AUDIT: FUTURE_TARGET。

## 2. Actual output（自动 probe 结果）

- `r-miss-recorded` **PASS**：检索未命中相关对象时，`generationMeta.knowledgeObjectIds=[]`、`promptVersion="v1.1-knowledge-layer"`，`retrieval.executed` 事件存在（miss 如实记录）。
- `r-unpolluted` **PASS**：生成仍成功（HTTP 200，词卡存在），词卡核心语义（"环保的；对环境友好的" / "IELTS 测试语境"）与知识库**不冲突**。

## 3. Trace evidence

- trace 事件序列：`request.received → retrieval.executed → llm.attempt → validation.result → state.write → state.read → response.sent`。
- generationMeta：`{knowledgeLayerVersion:"v1", knowledgeObjectIds:[], promptVersion:"v1.1-knowledge-layer"}`。

## 4. Human question

> 行 1（语义覆盖）为 FUTURE_TARGET：关键词引擎按设计漏召回属于能力缺口还是产品缺陷？（gold [FIX-05] 明确"改造前按行 2 口径记录 miss 并保证生成不被污染，不当 S1 缺陷上报"——请确认该判定并归档 P0-4 检索升级项。）

## 5. Decision field（待人工填写）

```json
{
  "case_id": "ELS-EVAL-023",
  "reviewer": "",
  "reviewed_at": "",
  "decision": "PENDING | PASS | FAIL | REQUEST_CHANGES",
  "comment": ""
}
```
