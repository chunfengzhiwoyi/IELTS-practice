# PRODUCT-LOOP-04A — Speaking → Vocabulary Correct-Usage Evidence Audit

**AGENT**: 豆包c
**TASK_ID**: PRODUCT-LOOP-04A
**TYPE**: PRODUCT_EVIDENCE_DESIGN_AND_VALIDATION（AUDIT_AND_DESIGN）
**MODE**: 只读审计 + 设计；不实施任何状态写回
**CANONICAL_BASE**: `0b7d7736fcee43d953a18c9e69ab9cbe1fc026cc`（repo/arch-consolidate）
**AUDIT_BRANCH**: `audit/product-loop-04a-speaking-vocab-evidence`
**DATE**: 2026-09-12

---

## 0. 结论摘要（TL;DR）

- **核心问题**：当前 `Vocabulary → Speaking`（02C）是单向的。Speaking 完成后词汇状态零写回，因为"字符串出现 ≠ 正确使用"。本任务回答：**什么样的口语证据足以可靠判断"用户真的正确使用了某个目标表达"**。
- **审计发现**：
  1. `applicationLevel` 是**死字段**——全仓库无任何递增路径，仅 target-selection 读取作排序信号；文档只有 0–2 范围、无操作化定义。→ `SEMANTICS_PARTIAL`。
  2. **关键接线缺口**：`suggestedExpressions` 只在 session 创建响应中存在，**未持久化到 SpeakingSession、analyze 请求也不携带**。analyzer 拿不到"系统给了哪些目标表达"，04B 必须先接线。
  3. 现有 speaking analyzer 是**单次 LLM 结构化调用**（EnhancedAnalysisSchema → quality gate → sanitizer），可扩展新增 `targetExpressionUsageEvidence` 可选子对象，**无需第二个 LLM 调用**。
  4. 已有 `evidence-grounding.ts` 词级 grounding 原语（BC-M3-004 先例），但 04A 要求**quote 级精确子串 grounding**（更严），validator 需新增。
- **实验**：53 个 gold cases（57 个 item 级标签，A–P 全类别，人工冻结先于运行）经"宽松句法 extractor + 严格 validator"双层实验：
  - CORRECT precision **0.8077**（21/26），recall **1.0**；ISSUE precision **0.9167**；NOT_USED accuracy **1.0**；UNCERTAIN rate **5.3%**；grounding violations **0**。
  - **FALSE_CORRECT = 5**（E20–E23 语义误用 ×4 + G31 定义式回声 ×1）——**全部集中在需要 LLM 语义判断的类别**，结构性规则无法捕获。
  - 若把所有 upgrade candidates（26）直接写回，其中 5/26 = **19.2% 是虚假升级** → 当前**禁止任何长期状态写回**。
- **产品决策**：`EVIDENCE_PIPELINE_NEEDS_TARGETED_FIX`
- **证据安全决策**：`SAFE_FOR_EVIDENCE_ONLY`（证据管线设计可用，但 CORRECT 写回必须先过 LLM 语义层 + 独立验证）
- **下一阶段**：`PRODUCT-LOOP-04B`（IMPLEMENT-EVIDENCE-PIPELINE：接线 + schema 扩展 + prompt 规则 + validator + 对黄金语料验证 LLM；**仍只记录 evidence，不写长期 Learner State**）
- **冻结确认**：`LONG_TERM_STATE_WRITEBACK = NO`；`applicationLevel / recallLevel / status / nextReviewAt / currentIntervalDays / consecutiveCorrect` 全部未动；无新 DB schema；无新 LLM runtime 调用；M3 保持 PAUSED；未创建任何 M3 RUN。

---

## 1. Current System Audit（现状审计）

### 1.1 单向链路（02C 现状，已入 canonical）

```
learned items (UserItemState)
  → target-selection.ts（≤2 个 suggestedExpressions，只读 UserItemState）
  → question-matching.ts（自然匹配才带 target；无匹配 → SAFE FALLBACK 普通出题）
  → POST /api/speaking/session 响应 { session, questionData, suggestedExpressions }
  → 用户口语回答
  → POST /api/speaking/analyze
  → LLM 分析 / 规则引擎降级
  → 词汇长期状态：**零写回（Frozen）**
```

- `MAX_TARGET_EXPRESSIONS = 2`；suggestion 是 **OPTIONAL**（UI 明确"自然表达优先，不用也没关系"）。
- `SpeakingSession` schema **无** target 字段；`suggestedExpressions` 仅存在于创建响应（`CreateSpeakingSessionResponse`）。

### 1.2 analyze 流水线（现状，可直接扩展）

`app/api/speaking/analyze/route.ts`：
1. `RequestSchema`：`{ sessionId, answer(1..5000), isSecondAnswer, audioMetadata?, abilityContext? }`。
2. load session → `getQuestionById` → 构建 abilityContext（客户端或服务端）。
3. `analyzeSpeakingWithLlm(answer, question, traceId, audioMetadata?, abilityContext?, opts?)`：
   - 单次 `callLlmStructured`（`tier: main`，temperature 0.3，schema `EnhancedAnalysisSchema`，schemaName `SpeakingAnalysis`）。
   - → 构建 `SpeakingAnalysisResult`（candidateIssues/mainIssue/microDrill/metrics/summary/ieltsAnalysis）。
   - → `validateFeedbackQuality`（quality gate：PASS / NEEDS_REVIEW / FAIL）。
   - → `BAND_SCORE_LEAK` redline（强制规则引擎降级，ELS-EVAL-020）。
   - → `sanitizeUngroundedAnalysis`（BC-M3-004：移除未支撑断言）。
   - LLM 失败 → 规则引擎 `analyzeSpeakingAnswer` 降级。
4. updateFirst/SecondAnswer → `writeAbilityObservationsServer` → (isSecond) `computeSessionEvaluation`。

**对证据管线的意义**：
- 用户**原始 answer 在分析阶段完整可得**（quote grounding 可行）。
- **同一 LLM 调用内新增可选结构化子对象**即可承载 target-expression evidence，**不默认加第二个 LLM 调用**（符合 V1.1 契约 §3"与 ieltsAnalysis 平级或嵌套"）。
- 已有 quality gate（generator/evaluator 分离）与 sanitizer（grounding enforcement）是成熟先例，evidence validator 可仿照其模式。

### 1.3 接线缺口（Finding #1 —— 04B 前置条件）

| 环节 | 现状 |
|---|---|
| session 创建响应 | 返回 `suggestedExpressions: SuggestedExpression[]` |
| SpeakingSession 持久化 | **无 target 字段** |
| analyze 请求体 | **不携带 suggestedExpressions** |
| LLM 分析输入 | 只有 answer/question/abilityContext —— **看不到系统给过哪些表达** |

→ 04B 实施 evidence 前**必须**二选一（或组合）：
- **方案 A（推荐，客户端传参）**：analyze 请求附带 `suggestedExpressions`（客户端已有该数据，来自 session 创建响应）；服务端校验 itemId 属于该 session 的 suggestion 集后传入 LLM。无 DB 变更。
- 方案 B：session 持久化 suggestedExpressions（需 schema/migration，由 Control Plane 批准）。
> 注：即使接线完成，evidence 判断**只能以用户 answer 实际产生的 span 为准**，suggestedExpressions 只作为"目标集合 + 提示原文"输入（见 §20 提示泄漏）。

### 1.4 可复用原语

- `lib/speaking/evidence-grounding.ts`：`buildAnswerWordSet / isEvidenceGrounded / filterGroundedEvidence / hasAnyGroundedEvidence / isDataEvidence` —— 词级匹配（evidence 中 >3 字母词 ∈ answer 词集），用于 band-leak 清洗。**04A 需要更严的 quote 级精确子串**，以它为基线但新增 `quoteInAnswer(quote, answer)`（规范化后 `answer.includes(quote)`）。
- `lib/speaking/feedback-quality.ts` + `feedback-quality-types.ts`：QualityStatus / 9 类 QualityIssueType（EVIDENCE_MISMATCH / NO_EVIDENCE / BAND_SCORE_LEAK 等）—— 模式可仿照。
- `lib/speaking/evidence-sanitizer.ts`：未支撑断言清除 —— 未来可对 evidence 子对象复用同一 enforce 模式。

---

## 2. applicationLevel Semantics（语义审计）

**结论：`SEMANTICS_PARTIAL`** —— 有范围、无操作化定义、无任何写路径。

证据：
1. **类型**：`UserItemState.applicationLevel: number`（`lib/learning/types.ts:70`）。
2. **写路径**：全仓库检索 `applicationLevel\s*[+\-]?=` 仅命中 `target-selection.ts` 的**读取**（`=== 0 → +1`、`>= 2 → -1`，作为选择优先级信号）。初始化恒 0（demo-service / memory repo / learn route / review route / replay-harness）。**没有任何产品代码递增它** —— 死字段。
3. **文档**：`docs/architecture/v2-system-audit.md` 标注 `applicationLevel(0-2)`；V1.1 契约草案提出未来"cap 2"递增。均无"0/1/2 分别代表什么"的操作化定义。
4. **语义推断（未脑补）**：从 target-selection 的使用可推断"0=从未在口语中应用（优先补机会）、≥2=已多次应用（让位）"这层**排序语义**；但"1 次正确使用是否 = level 1"无定义。

**对 04A 的结论**：在补操作化定义 + evidence history 之前，`applicationLevel` **不适合承载 Speaking correct-use evidence**（不能 A 类直写）。建议 04C 先补语义（见 §12 State Mapping）。

---

---

## 3. Candidate Evidence Contract（候选证据契约）

### 3.1 最小结构（在现有 EnhancedAnalysisSchema 中新增可选子对象）

```ts
// 新增子对象（与 ieltsAnalysis 平级；缺省 = 无建议项）
targetExpressionUsageEvidence: TargetExpressionUsageEvidence[]  // optional

interface TargetExpressionUsageEvidence {
  itemId: string;                       // 必须 ∈ 本 session suggestedExpressions
  attempted: boolean;                   // 用户是否尝试使用该表达
  quote: string | null;                 // 用户 answer 的真实文本 span（quote grounding 必需）
  assessment: "CORRECT" | "ISSUE" | "UNCERTAIN" | "NOT_USED";
  reason: string;                       // 判定理由（简短）
}
```

- **每个 itemId 一条**（per-item 独立，禁止"用了其中一个 → 两个都升级"）。
- 不默认增加 numeric confidence score（现有系统无可靠语义）。
- 与 V1.1 契约 `TargetExpressionUsage` 的差异：assessment 增加 **NOT_USED**（显式区分"未使用"与"用了但错"），quote/attempted 语义一致。
- 输出位置：`analyzeSpeakingWithLlm` 的同一结构化结果（zod 校验），**同一次 LLM 调用**。

### 3.2 Assessment 判定规则（草案）

| assessment | 含义 | 必要条件 |
|---|---|---|
| CORRECT | 真实、语义与结构正确的使用 | grounded quote + 语义 fit + 句法 fit + 非 prompt echo |
| ISSUE | 尝试了但语义/语法/搭配错 | grounded quote（允许错误 span）+ attempted=true |
| UNCERTAIN | 无法可靠判断 | quote 缺失 / 语境歧义 / 低置信 |
| NOT_USED | 未使用（完全允许，非失败） | quote 必须为空 |

### 3.3 Correctness 四维度（§9）

判断 CORRECT 时至少检查：
- **A. Expression identity**：确为目标表达或其合法形态变化。
- **B. Semantic fit**：在当前句语义中正确（核心：是否表达"把…当作理所当然"）。
- **C. Syntactic fit**：搭配/结构未破坏核心用法。
- **D. Grounding**：quote 真实出现在 answer。
- 不要求整句 IELTS 高分：用户可有其他错误，目标表达本身正确即可 CORRECT。

### 3.4 Allowed Variation（§10）

canonical string 不是唯一合法形式。例如 `take something for granted` 合法形态含：
- `take it for granted` / `take them for granted`（代词替代）
- `took it for granted` / `taken ... for granted` / `taking ... for granted`（时态/非谓语）
- `take my health for granted`（宾语替换 something）
- `take it for granted that ...`（从句结构）
- 否定形式 `shouldn't take ... for granted` 仍正确。
- 本任务不实现通用语言学 parser；只需明确"exact canonical ≠ 唯一合法"。

---

## 4. Grounding Rules（quote grounding 规则）

1. **CORRECT / ISSUE 必须 quote 非空**，且 quote 必须是用户 answer 的**真实文本 span**（规范化后精确子串：小写 + 仅边缘标点宽容）。
2. **quote 不在 answer → 强制降级 UNCERTAIN**（无论 LLM 置信多高）。
3. **NOT_USED → quote 必须为空**（带 quote 的 NOT_USED = contract violation → 降级 UNCERTAIN）。
4. **UNCERTAIN 永不成为 upgrade candidate**。
5. 禁止 LLM"自己改写一句话然后说这是用户证据"。
6. 复用/扩展 `evidence-grounding.ts` 词级原语，但 04A 要求**更严的 quote 级**：`quoteInAnswer(quote, answer) = normalize(answer).includes(normalize(quote))`，而非关键词宽松匹配。

---

## 5. Repetition / Prompt Echo / Suggestion Leakage（§11 / §20）

- **suggestedExpressions 是系统提供给用户的提示**，不是用户语言能力证明。analyzer 知道提示原文是**必要的**（判断是否使用了目标），但 evidence 只能从用户 answer 实际产生的 span 判定。
- **Prompt echo 不等于应用证据**：
  - 照读 `Take something for granted.` → 至少 UNCERTAIN（结构守卫可捕获）。
  - 定义式复述 `take something for granted means to not appreciate something` → **需要 LLM 语义判断**（结构守卫对长句失效，见 §9 实验）。
  - 元语言提及 `I can say take something for granted in my answer` → 同上。
- **Validator 兜底**（结构性）：quote 覆盖回答绝大部分 + 回答很短，或 quote == 提示原文 + 回答 ≤10 词 → 降级 UNCERTAIN。

---

## 6. Self-Correction / Multiple Mentions / Multi-Target（§12–14）

- **Self-correction**：以**最终明确正确的 span** 为 evidence（提取规则取最后一次合法出现）；earlier issue 写入 reason（如 `earlier_issue: "for grant" → corrected`）。若最终**改错**（正确后接 make 误用），以最终错误为准 → ISSUE。
- **Multiple mentions**：存在 grounded CORRECT 且最终语义明确 → 可 CORRECT，reason 说明存在修正/冲突；证据冲突无法明确 → UNCERTAIN。
- **Multi-target**：**按 itemId 分别判断**。两目标一正确一未用 / 一正确一错 → 分别给 CORRECT / NOT_USED / ISSUE。

---

## 7. Deterministic Validator Design（严格 validator，04A 设计产物）

```ts
function validateEvidence(e, answer, sessionItemIds): ValidatedEvidence {
  // 1. itemId ∈ session suggestedExpressions —— 否则 INVALID → UNCERTAIN
  // 2. assessment ∈ enum —— 否则 INVALID → UNCERTAIN
  // 3. CORRECT/ISSUE：quote 非空 且 normalize(answer).includes(normalize(quote))
  //    —— 否则 GROUNDING_VIOLATION → UNCERTAIN（记录 violation）
  // 4. NOT_USED：quote 必须为空 —— 否则 CONTRACT_VIOLATION → UNCERTAIN
  // 5. UNCERTAIN：永不 upgradeCandidate
  // 6. Echo 结构守卫（仅短回声）：见 §5
  // 7. upgradeCandidate = (assessment === CORRECT)   // 校验后
}
```

- **generator/evaluator 分离**（仿 quality gate）：extractor/LLM 生成 → validator 强制约束。validator 不信任 LLM 原始结构。
- 对抗性行为已在实验中验证（见 §8）：伪造 quote / 空 quote / NOT_USED 带 quote / 非 session itemId / 非枚举 assessment → **全部正确降级 UNCERTAIN**；合法 quote 通过。
- 局限（明示）：validator 只能做**结构/身份/quote 层**守卫；**语义 fit 与定义式回声必须由 LLM prompt 承担**（结构性规则无法覆盖）。

---

## 8. Evaluation Corpus & Results（53 gold cases / 57 item 级标签）

### 8.1 Corpus 构成

- 全量语料：`docs/product/evidence-cases/gold-cases.json`（53 cases；多目标 case 按 itemId 分别给标签 → 57 个 item 级标签）。
- **Gold 先于模型/规则结果冻结**（人工逐条判定 + gold reason；冻结于 2026-09-12）。
- 类别覆盖（A–P）：A NOT_USED(8) / B exact(5) / C inflected(3) / D pronoun(3) / E semantic misuse(4) / F grammar misuse(4) / G prompt echo(4) / H partial(3) / I self-correction(3) / J wrong-then-right(2) / K correct-then-wrong(2) / L two-targets correct+unused(2) / M two-targets correct+issue(2) / N similar-words(3) / O short-answer(2) / P long-noisy(3)。

### 8.2 实验设计（双层）

- **Layer 1 宽松句法 extractor（确定性 baseline）**：只做句法/形态检测（take/bear/pros/broaden 变体正则 + 缺 -ed / 缺宾语 / 错动词 / 单复数搭配检查），**无语义判断、无回声判断** —— 作为未来 LLM 结构化输出的确定性占位。
- **Layer 2 严格 validator**（§7 设计产物）作用于 extractor 输出。
- 目标：测量"纯确定性管线"能到哪、**FALSE_CORRECT 集中在哪**，从而界定 LLM 语义层必须承担的部分。

### 8.3 Gold 分布 vs 系统输出

| 标签 | Gold | 系统（extractor+validator） | 一致性 |
|---|---|---|---|
| CORRECT | 21 | 26（21 TP + 5 FP） | precision **0.8077** / recall **1.0** |
| ISSUE | 15 | 12（11 TP + 1 FP） | precision **0.9167** |
| NOT_USED | 16 | 16 | accuracy **1.0** |
| UNCERTAIN | 5 | 3（2 命中） | rate **5.3%** |
| 合计 | 57 | 57 | — |

### 8.4 逐例结果（gold → got）

| id | cat | gold | got | 失败/备注 |
|---|---|---|---|---|
| A01–A08 | A | NOT_USED | NOT_USED | ✓ 全对 |
| B09–B13 | B | CORRECT | CORRECT | ✓ |
| C14–C16 | C | CORRECT | CORRECT | ✓ 形态变化识别 |
| D17–D19 | D | CORRECT | CORRECT | ✓ 代词替代 |
| E20–E23 | E | ISSUE | **CORRECT** | ✗ **FALSE_CORRECT ×4（语义误用）** |
| F24–F27 | F | ISSUE | ISSUE | ✓ 语法/搭配 |
| G28–G30 | G | UNCERTAIN | UNCERTAIN | ✓ 短回声被结构守卫捕获（G30 词数恰好=10） |
| G31 | G | UNCERTAIN | **CORRECT** | ✗ **FALSE_CORRECT（定义式回声，长句逃逸结构守卫）** |
| H32–H33 | H | ISSUE | ISSUE | ✓ |
| H34 | H | UNCERTAIN | **ISSUE** | ✗ ISSUE FP（baseline 正则被 `...` 打断 → 落入"片段"分支；伪影，LLM 管线不适用） |
| I35–I36 | I | CORRECT | CORRECT | ✓ 自纠取最终 span |
| I37 | I | ISSUE | ISSUE | ✓ 自纠到错（make 在 take 后） |
| J38 | J | CORRECT | CORRECT | ✓ 错→对 |
| J39 / K41 | J/K | ISSUE | ISSUE | ✓ 对→错取最终错 |
| K40 | K | CORRECT | CORRECT | ✓ 两次都对 |
| L42 / L43 | L | CORRECT+NOT_USED | 同 | ✓ per-item 独立 |
| M44 / M45 | M | CORRECT+ISSUE | 同 | ✓ 含 bare-in-mind、单数 is+pros 捕获 |
| N46–N48 | N | NOT_USED | NOT_USED | ✓ 相似词不误判 |
| O49–O50 | O | NOT_USED | NOT_USED | ✓ |
| P51–P52 | P | CORRECT | CORRECT | ✓ 长句/噪音中 grounding |
| P53 | P | NOT_USED | NOT_USED | ✓ |

### 8.5 Metrics（最终口径，57 个 item 级标签）

| metric | value |
|---|---|
| CORRECT precision | **0.8077**（21/26） |
| CORRECT recall | **1.0**（21/21） |
| ISSUE precision | **0.9167**（11/12） |
| NOT_USED accuracy | **1.0**（16/16，0 FP / 0 FN） |
| UNCERTAIN rate | **0.0526**（3/57） |
| grounding violations | **0**（validator 通过；对抗用例确认降级路径工作） |
| FALSE_CORRECT | **5**（E20–E23 语义误用 ×4；G31 定义式回声 ×1） |
| upgrade candidates | 26（21 TP + 5 FP → **19.2% 虚假升级**，若直接写回） |

---

## 9. FALSE_CORRECT Failure Analysis（逐条失败分析）

**全部 5 条 FALSE_CORRECT 集中在"需要语义判断"的两类**，结构性规则无一能捕获：

| id | gold | 模式 | 为什么结构性规则无法捕获 | 04B LLM 层必须承担 |
|---|---|---|---|---|
| E20 | ISSUE | 语义误用：`take my exam for granted because it is very hard` | 句法完整（take+宾语+for granted），无字符串异常 | 检查语义 fit：exam 不是"被理所当然对待"的对象 |
| E21 | ISSUE | 语义误用：`take my teacher for granted to explain...`（当 rely on 用） | 同上 | 语义 fit：与核心义"把…当作理所当然"不符 |
| E22 | ISSUE | 语义误用：`The weather takes the umbrella for granted` | 同上 | 语义 fit：无生命主语 + 荒谬语义 |
| E23 | ISSUE | 语义误用：`take English grammar for granted every morning to practice` | 同上 | 语义 fit：句意不成立 |
| G31 | UNCERTAIN | 定义式回声：`take something for granted means to not appreciate something` | quote 存在、grounded、句法完整、回答 13 词 > 结构守卫阈值 10 | **元语言/定义式复述识别**：提示原文 + 定义语境 ≠ 应用 |

**次要观察（非 FALSE_CORRECT，但值得记录）**：
- **H34**（gold UNCERTAIN，got ISSUE）：baseline 正则被 `...`（省略号）打断锚定 → 落入"片段"分支。这是**确定性正则伪影**，LLM 管线不适用；但设计教训成立：**用户自我怀疑（`... for granted? maybe`）应判 UNCERTAIN**，LLM prompt 需包含该规则。
- **G30**（gold UNCERTAIN，got UNCERTAIN）：`I can say take something for granted in my answer.` 恰好 10 词，被结构守卫（quote==canonical 且 ≤10 词）捕获 —— **临界值侥幸**，不代表结构规则可靠；04B 不得依赖此阈值。

**结论**：FALSE_CORRECT 全部可通过 LLM 层 prompt 规则（语义 fit + 定义式回声 + 自我怀疑）显著消减，validator 负责把它们挡在写回门外（防 LLM 幻觉 quote / 逃逸）。这正是"**extractor 需要 targeted fix（B 方案），而不是结构重设计**"的证据。

---

## 10. Writeback Risk（写回风险）

- **错误成本不对称**：False Positive（系统误认为会用了 → 污染长期 learner state）远危险于 False Negative（暂未确认一次正确使用）。
- **本实验量化**：若把 26 个 upgrade candidates 全部写回，**19.2%（5/26）为虚假升级** —— 直接写回**不可接受**。
- 因此 evidence gate 必须 **precision-first**：
  - CORRECT 写回前必须过 LLM 语义层（语义 fit + 非回声）**且** validator（quote grounding / 身份 / 结构）。
  - `UNCERTAIN 永不升级`、`NOT_USED 永不惩罚`、`ISSUE 不自动降级词汇状态`（Speaking 应用错误 ≠ 词义记忆失败）。
- **一次 CORRECT ≠ mastery**：只能说明"这一次口语回答中出现了一次 grounded correct-use evidence"；不推出 mastered / 稳定能力 / band 提升。
- **Repeated evidence**（设计建议，不实现）：跨 session、不同日期/题目/上下文多次 CORRECT 才可能升级 `applicationLevel`（见 §12）。

---

## 11. Event / Schema Boundary（事件与 schema 边界）

- 本任务未新增正式 LEARNING_EVENT / APPLICATION_EVENT；`eventType ∈ {NEW, REVIEW}` 未变。
- 设计提案（未来 04C，需 Control Plane 批准）：`APPLICATION_EVIDENCE_RECORDED` —— 必须明确它是 **evidence event（记录一条 grounded 证据）**，不是 mastery event（不直接改 status/recallLevel/schedule）。
- 无新增 DB schema / migration；无新增 LLM runtime 调用（04A 全程仅审计 + 临时 harness）。

---

## 12. State Mapping Proposal（04C 提案，仅设计不实施）

| evidence | 建议映射 | 约束 |
|---|---|---|
| CORRECT（validator 通过 + 非回声） | `APPLICATION_EVIDENCE_RECORDED` + `applicationLevel +1`（cap 2）候选 | **需 Control Plane 单独批准**；一次不升 mastery |
| ISSUE | application difficulty evidence（仅记录） | 不自动降级 recall/status/schedule |
| NOT_USED | no-op | 不使用不惩罚、不提前复习（OPTIONAL 契约） |
| UNCERTAIN | no-op | 不升级不惩罚 |

**applicationLevel 具体决策**：`SEMANTICS_PARTIAL` → **在补操作化定义前不直接写**。建议 04C 先：
1. 定义 level 语义：`0 = 从未在口语中有 grounded 正确使用`；`1 = ≥1 次 grounded CORRECT`；`2 = ≥2 次不同 session 的 grounded CORRECT`。
2. 增加 evidence history（`APPLICATION_EVIDENCE_RECORDED` 事件可查询），使"跨 session 多次 CORRECT"成为可审计事实。
3. 之后才允许 target-selection 之外的代码读/写 applicationLevel。

---

## 13. Eval Coverage（产品集成 Eval 缺口，仅报告）

- 现有 39 个 M3 cases 是 **LLM 输出质量 Eval**；**没有覆盖 Speaking→Vocabulary evidence 闭环**的产品集成 Eval。
- 04B 后建议（沿用 V1.1 契约 §5，不现在建）：
  - EVAL-PL-02 `USAGE_DETECTION_TRIPLET`：同一 answer 的三元组（quote 存在/grounded、assessment 正确、reason 与 quote 一致）。
  - EVAL-PL-03 `NO_OVER_PROMOTION`：CORRECT 一次后 status/recallLevel/nextReviewAt 不变。
  - 人工抽样仲裁：LLM assessment vs 人工 gold 的一致性抽查（首批 ≥20 条，直接复用本报告 53 条语料）。

---

## 14. Product Decision & Next Phase

### 14.1 Decision Gate

**PRODUCT_DECISION = `EVIDENCE_PIPELINE_NEEDS_TARGETED_FIX`**

理由：
- 设计（契约 + grounding + validator）经实验验证**结构层成立**：NOT_USED 100%、ISSUE 91.7%、对抗性降级全通过、grounding violations 0。
- 残余 FALSE_CORRECT **全部可归因于 LLM 语义层缺失**（语义 fit ×4、定义式回声 ×1），属于 **prompt/schema 定向修复**，不是结构重设计。
- 尚不能 `EVIDENCE_PIPELINE_READY`，因为：(a) 接线缺口未闭（suggestedExpressions 未达 analyzer）；(b) LLM 语义层未对 53 条 gold 验证；(c) 纯规则 CORRECT precision 80.8% 不足以支撑写回。

### 14.2 Targeted Fixes（04B 清单）

1. **接线**：analyze 请求附带 `suggestedExpressions`（推荐客户端传参，无 DB 变更）；服务端校验 itemId 属于本 session 建议集。
2. **Schema**：`EnhancedAnalysisSchema` 新增可选 `targetExpressionUsageEvidence: TargetExpressionUsageEvidence[]`（与 ieltsAnalysis 平级；同一次 LLM 调用；不新增第二 LLM）。
3. **Prompt 规则**（LLM 语义层）：
   - 语义 fit：只有表达核心义（如"把…当作理所当然"）才 CORRECT；句法完整但语义不成立 → ISSUE。
   - 定义式/元语言回声：复述提示原文或解释其含义 ≠ 应用 → UNCERTAIN。
   - 自我怀疑（`... for granted? maybe`）→ UNCERTAIN。
   - 自纠：以最终正确 span 为 evidence，earlier issue 入 reason；最终改错 → ISSUE。
   - quote 必须逐字来自 answer，无法定位 → 不输出 CORRECT。
4. **Validator**：按 §7 实现（身份/枚举/quote grounding/NOT_USED 空 quote/短回声守卫/upgradeCandidate）。
5. **验证**：以本报告 53 条 gold 语料评估 LLM（CORRECT precision ≥ 阈值由 Control Plane 定，建议 ≥0.90 才考虑 evidence 写回）。
6. **边界**：04B **仍只记录 evidence**，不写长期 Learner State（写回 = 04C + Control Plane 批准）。

### 14.3 Next Phase

`PRODUCT-LOOP-04B` — IMPLEMENT-EVIDENCE-PIPELINE（含上述 targeted fixes；evidence-recording only）。
若 04B 后 LLM 语义层仍不稳 → `04B-FIX` 或降级为 **NOT_RELIABLE**，保持 Vocab→Speaking **one-way** 不污染 learner state。

---

## 15. Boundary Confirmations（边界确认）

| 项 | 值 |
|---|---|
| PRODUCT_CODE_MODIFIED | **NO**（未改 app/ components/ lib/ 正式 runtime / supabase / schema / migration） |
| LONG_TERM_STATE_WRITEBACK | **NO** |
| applicationLevel / recallLevel / status / nextReviewAt / currentIntervalDays / consecutiveCorrect | 全部未变 |
| NEW_DATABASE_SCHEMA / MIGRATION | NO |
| NEW_LLM_RUNTIME_CALL | NO（仅审计；未来 04B 在同一调用内扩展） |
| NEW_M3_EVAL_RUN | NO；M3 保持 **PAUSED**；019/020/030 lifecycle 未动；023/025/035 未处理 |
| 临时实验资产 | `tests/unit/_04a-evidence.tmp.test.ts` 已删除；原始输出在 worktree 外 `D:\Codex\_tmp\loop-04a\results.json` |
| 审计资产（保留） | `docs/product/evidence-cases/gold-cases.json`（53 cases gold 语料，可复用于 04B 验证与人工仲裁） |

---

## 16. Findings（Top Findings）

1. **WIRING_GAP**（P1，04B 前置）：suggestedExpressions 未持久化/未随 analyze 传入 —— analyzer 无法判断"系统给了哪些目标表达"。
2. **APPLICATION_LEVEL_SEMANTICS_INCOMPLETE**（P2）：死字段，0–2 无操作化定义；写回前必须先补语义 + evidence history。
3. **RULE_ONLY_CORRECT_PRECISION_INSUFFICIENT**（P1）：纯确定性管线 CORRECT precision 80.8%、虚假升级率 19.2% → 写回必须依赖 LLM 语义层 + validator 双保险。
4. **SEMANTIC_FIT_REQUIRES_LLM**（P1）：FALSE_CORRECT 主模式（4/5）是语义误用，结构规则不可达。
5. **META_ECHO_ESCAPES_STRUCTURAL_GUARD**（P1）：定义式回声（G31）结构守卫不可捕获；LLM prompt 必须显式规则化。
6. **GROUNDING_LAYER_READY**（P2 正向）：evidence-grounding 词级原语可复用为 quote 级；validator 对抗行为已验证。

---
