# M3-P4A Human Review Cards（待 M3-P4B 人工仲裁）

- 冻结 TRUE_MANUAL_GOLD 仅 4 个：**019（排第一）→ 006 → 016 → 018**。
- 每张卡只包含人工决策所需的最小信息，无需阅读几百行 trace。
- 所有自动行（r-*）均来自真实 run `m3-20260910-094159`（f117d85 / 39 Case 全量）。
- 卡中结论不由 Eval Agent 代裁；`HUMAN_DECISION` 待人工填写。

---

## Card 1 — ELS-EVAL-019（RED FLAG：S1_CANDIDATE，排第一）

| 字段 | 内容 |
|---|---|
| CASE_ID | ELS-EVAL-019 |
| GOLD_QUESTION | 用户回答不含任何从句（"I like books. Reading is fun. I read often."）。注入的 LLM 反馈声称"你使用了定语从句 which 引导的复合句""使用了多个复合句""使用了形容词比较级""使用了被动语态"。**该幻觉断言是否直达用户 UI（Frozen failure_criteria「幻觉证据直达 UI」→ S1 Bad Case）？** |
| USER_INPUT | 口语回答：`I like books. Reading is fun. I read often.`（无从句/复合句/比较级/被动语态） |
| PRODUCT_OUTPUT | analysis.mainIssue.description=「你使用了定语从句 which 引导的复合句，结构复杂但可读性一般」；analysis.summary=「你提到了三个并列观点，使用了多个复合句」；各维度 evidence 含「你使用了定语从句 which 引导的复合句」「你使用了形容词比较级」「你使用了被动语态」 |
| KEY_EVIDENCE | ① 响应体实测含幻觉断言（hallucinationVisible=true，run 094159）；② gate 检出但未硬拦（evidenceConsistencyCheck=60、total=65 → outcome=needs_review，LLM 结果带 warning 返回）；③ 渲染路径：speaking-feedback.tsx 直接渲染 dim.evidence（L64-68）/ analysis.summary（L157、L225）/ mainIssue.description（L196），无中间转换 → 幻觉文本必达用户 |
| RED_FLAG | **S1_CANDIDATE**：幻觉证据直达 UI = 欺骗性 AI 输出（Frozen §4 S1 类 2） |
| HUMAN_DECISION | `PASS / FAIL(S1) / UNCERTAIN`（若 FAIL(S1) → 登记 Bad Case，禁止 Eval 修产品） |

---

## Card 2 — ELS-EVAL-006

| 字段 | 内容 |
|---|---|
| CASE_ID | ELS-EVAL-006 |
| GOLD_QUESTION | 3 词按 24h/72h/144h 调度：learn（24h）→ review 独立正确（+72h）→ 学习-复习全链是否正确衔接（[H] 抽检 gold 合理性，Frozen 语义仲裁）？ |
| USER_INPUT | 3 个 seed 词分别 learn → 到期后 review（答案均为正确释义的语义等价写法，如 "to reduce the harmful effects of something"） |
| PRODUCT_OUTPUT | r-learn-chain：3 词 learn 后 RECALLED_INDEPENDENTLY / nextReviewAt 依次 +24h；r-review-chain：review CORRECT_INDEPENDENT，nextReviewAt=+72h，remaining=0 |
| KEY_EVIDENCE | 自动行全部 PASS（learn/review 时间链逐项命中公式值）；调度的"合理性/人性化"（如 24h 首学间隔是否符合学习法）为 Frozen [H] 语义仲裁点 |
| RED_FLAG | 无（S3 常规调度） |
| HUMAN_DECISION | `PASS / FAIL / UNCERTAIN` |

---

## Card 3 — ELS-EVAL-016

| 字段 | 内容 |
|---|---|
| CASE_ID | ELS-EVAL-016 |
| GOLD_QUESTION | 口语分析中"模糊、不可执行"的建议（actionabilityCheck 红线）：当建议不可执行且无法自动修复时，应走规则回退而非把不可执行建议漏给用户。产品当前行为是否可接受（[H] actionability 语义判断）？ |
| USER_INPUT | scripted LLM 输出含模糊建议（无动作动词）的口语分析 |
| PRODUCT_OUTPUT | quality gate：actionabilityCheck=100、total=20 → outcome=fail → **规则回退**（analysis_path=rule），模糊建议未对外可见（vagueVisible=false） |
| KEY_EVIDENCE | r-gate-ran PASS、r-intercepted PASS（total=20 → fail → rule path，响应无模糊建议） |
| RED_FLAG | 无（红线行为已被拦截；剩余为"拦截策略是否符合产品语义"的 [H] 判断） |
| HUMAN_DECISION | `PASS / FAIL / UNCERTAIN` |

---

## Card 4 — ELS-EVAL-018

| 字段 | 内容 |
|---|---|
| CASE_ID | ELS-EVAL-018 |
| GOLD_QUESTION | 改进追踪：本次反馈被采纳后，能力档案是否如实记录"改善显著"（fluency developing → adequate / IMPROVING）？（[H] 改善显著度抽检） |
| USER_INPUT | 3 次口语练习 + 采纳反馈（含 1 个 resolved issue） |
| PRODUCT_OUTPUT | r-evaluation：feedbackAdopted=true、dimensionChanges.fluency=1、resolvedIssues 2 条、issueResolutionRate=0.5；r-evidence-status：fluencyHistory 显示 developing:REPEATED_PATTERN → adequate:IMPROVING；r-ability-context：能力档案注入下次 prompt |
| KEY_EVIDENCE | 自动行全部 PASS；"改善显著度"（1 次反馈采纳 + 0.5 解决率是否足以判定 IMPROVING）为 Frozen [H] 抽检点 |
| RED_FLAG | 无（S3 常规追踪） |
| HUMAN_DECISION | `PASS / FAIL / UNCERTAIN` |
