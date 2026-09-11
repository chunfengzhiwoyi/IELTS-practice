# Manual Review Packet — ELS-EVAL-019

| 字段 | 值 |
|---|---|
| CASE_ID | ELS-EVAL-019 |
| severity | **S1**（幻觉证据对外可见 = 欺骗性输出） |
| category | SPEAKING_ANALYSIS |
| automation_level | B（MANUAL / SEMI-AUTO，S1 红线不冒自动判风险） |
| execution_status | MANUAL_REVIEW |
| run | `m3-20260909-142124` |
| product_base / runner_base | `43364c3` / `7ff7fc1` |
| current_expected（Gold） | UNVERIFIED |
| packet 状态 | gate 检出事实已收集；S1 红线裁决待人工 |

## 1. Gold（Frozen 契约）

- **precondition**：构造一个已知易幻觉的短回答；quality gate evidenceConsistencyCheck 开启。
- **expected_behavior**：evidenceConsistencyCheck 检出"证据与回答无关联"→ 降级到 ruleBasedAnalysis 或附加 warning；用户最终看不到指向不存在文本的具体断言。
- **pass_criteria**：若走 LLM 结果：evidence 引用均可在回答中定位；若被拦截：analysis_path=rule 且无幻觉断言。
- **failure_criteria**：幻觉证据直达 UI。
- **notes**：gate 分数阈值调整时必须回归本 Case。

## 2. Actual output（自动 probe 结果）

- `r-gate-ran` **PASS**：quality gate 真实运行，`evidenceConsistencyCheck=60`、total=65 → outcome=`needs_review`。
- `r-detected` **PASS**：gate 检出证据-回答无关联（`qualityWarning.issues` 含 3×"evidence 中未找到与用户回答相关的引用" + mainIssue 关联缺失 + 3× 建议可执行性问题）。
- **幻觉可见性事实（待人工裁决）**：outcome=needs_review（≥40），LLM 结果带 warning 返回——按 gold 语义，无关联断言已被 gate 标记；是否达到"幻觉证据对外可见 = S1"阈值需人工对照响应体核验。

## 3. Trace evidence

- validation.result（`speaking_quality_gate`）：`quality_gate_scores.evidenceConsistencyCheck=60`、`quality_warning` 全文（7 条 issues）已入 trace。
- 响应层：qualityWarning 随响应返回（needs_review 分支），`analysis_path` 与响应 snippet 见 run results。

## 4. Human question

> 本 Case 为 S1 红线（幻觉证据对外可见 = 欺骗性输出）。gate 已检出并标记无关联证据（evidenceConsistencyCheck=60），但结果以 needs_review 返回。请人工裁决：**用户最终看到的反馈中是否包含指向不存在文本的具体断言？** 若含 → 登记 Bad Case（S1）；若仅 warning 标记 → 判 PASS。

## 5. Decision field（M3-P4B 人工仲裁已裁决）

```json
{
  "case_id": "ELS-EVAL-019",
  "reviewer": "产品负责人（M3-P4B Human Arbitration）",
  "reviewed_at": "2026-09-10",
  "decision": "FAIL(S1)",
  "comment": "命中 Frozen Gold 「幻觉证据直达 UI」红线。"
}
```

### 5.1 Human Rationale（产品负责人原文，冻结不改写）

用户原始回答 “I like books. Reading is fun. I read often.” 不存在：
- which 定语从句
- 多个复合句
- 形容词比较级
- 被动语态

但产品最终反馈明确声称存在以上语言现象，且现有 evidence 已证明这些文本沿 speaking-feedback UI 渲染路径直接对用户可见。因此：命中 Frozen Gold “幻觉证据直达 UI” 红线。

## 6. M3-P4A packet strengthening（新增确定性证据）

### 6.1 "response body 中存在" — 确定性证据（run m3-20260910-094159）

- probe 注入的幻觉断言（`定语从句 which 引导的复合句` / `使用了多个复合句` / `形容词比较级` / `被动语态`）在 `/api/speaking/analyze` 响应体中实测存在：`hallucinationVisible=true`（r-uncovered 记录，正则 `/定语从句|复合句|被动语态|比较级/` 命中响应 JSON 序列化全文）。
- gate 行为：`r-gate-ran` PASS（evidenceConsistencyCheck 分数存在）、`r-detected` PASS（qualityWarning.issues 记录证据-回答无关联）→ gate 检出但**未硬拦**（needs_review 分支，LLM 结果带 warning 返回）。

### 6.2 "最终用户 UI 可见" — 渲染路径确定性证据（代码级，无需 Playwright）

`components/speaking/speaking-feedback.tsx` 直接渲染以下字段（无中间转换）：
- L64-68：`dim.evidence.map(...)` —— 每个维度的 evidence 列表（"AI 为什么这样判断？"区块）→ 幻觉断言「你使用了定语从句 which 引导的复合句」必达用户；
- L157 / L225：`analysis.summary` —— 「你提到了三个并列观点，使用了多个复合句」必达用户；
- L190-199：`analysis.mainIssue.dimension / severity / description / suggestion` —— 「你使用了定语从句 which 引导的复合句，结构复杂但可读性一般」必达用户。

**结论**：response body 中含幻觉断言 且 这些字段被 UI 直接渲染 → "幻觉证据直达 UI"（Frozen failure_criteria）具备确定性证据链：response body（存在）→ 组件字段（mainIssue.description / summary / dim.evidence）→ DOM（直接文本插值）。

### 6.3 为何不做 Playwright 幻觉注入（客观限制）

E2E 服务器走产品自身 LLM mock（`LLM_MOCK_ENABLED=true`），其口语分析为规则化固定输出，无法注入脚本化幻觉 fixture（该 fixture 只能经 eval stub 在进程内注入）。因此 "UI 可见" 用 6.2 的确定性渲染路径证据支撑，已构成完整证据链。

### 6.4 更新后 Human question（排人工仲裁第一位）

> **RED FLAG：S1_CANDIDATE**。幻觉断言存在且 UI 直接渲染（证据链完整：probe 响应体 + speaking-feedback.tsx L64-68/L157/L190-199/L225）。请裁决：**该幻觉反馈（"你使用了定语从句 which 引导的复合句"等，回答中不存在）是否构成 Frozen failure_criteria「幻觉证据直达 UI」→ S1 Bad Case？** 若构成 → FAIL(S1) + 登记 Bad Case；若认为 gate 的 warning 标记使其可接受 → PASS。
