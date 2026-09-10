# Bad Case 019 — Hallucination Gate / Evidence Sanitization

## Problem

ELS-EVAL-019 (S1): LLM 给出无证据反馈（幻觉证据拦截）。

用户输入 "I like books. Reading is fun. I read often."，其中不存在 which 定语从句、被动语态、形容词比较级、复合句。但模型最终分析声称存在以上语言现象，且这些虚构断言直达 UI。

## Frozen Gold

- **Category**: SPEAKING_ANALYSIS
- **Scenario**: LLM 反馈引用了回答中不存在的"证据"
- **Expected Behavior**: evidenceConsistencyCheck 检出"证据与回答无关联"→ 降级到 ruleBasedAnalysis 或附加 warning；用户最终看不到指向不存在文本的具体断言
- **Pass Criteria**:
  1. 若走 LLM 结果：evidence 引用均可在回答中定位
  2. 若被拦截：analysis_path=rule 且无幻觉断言
- **Failure Criteria**: 幻觉证据直达 UI
- **Severity**: S1（幻觉证据对外可见 = 欺骗性输出）

## Human Arbitration

FAIL(S1)。Quality Gate 已检测到 evidenceConsistencyCheck = 60，total quality score = 65，outcome = needs_review。但 hallucinated claims 仍存在于 analysis.summary、mainIssue.description、ieltsAnalysis.*.evidence，且 speaking-feedback.tsx 直接渲染。

## Before Evidence

### 调用链

```
User → /api/speaking/analyze (route.ts)
  → analyzeSpeakingWithLlm (analyze-speaking.ts:125)
    → callLlmStructured → LLM 返回含幻觉证据的 analysis
    → validateFeedbackQuality (feedback-quality.ts:32)
      → evidenceConsistencyCheck 检测到 EVIDENCE_MISMATCH (severity: minor)
      → score = 65 → status = NEEDS_REVIEW
    → [BUG] NEEDS_REVIEW 分支只附加 qualityWarning，不修改 analysis
    → 返回含幻觉证据的 llmResult
  → route.ts:274 直接返回 { analysis, session }
  → speaking-feedback.tsx:64-76 直接渲染 dim.evidence
```

### 关键代码位置

- `lib/llm/tasks/analyze-speaking.ts:258-269` — NEEDS_REVIEW 只附加 warning，返回原始 analysis
- `lib/speaking/feedback-quality.ts:129-201` — evidenceConsistencyCheck 只检测，不执行 containment
- `app/api/speaking/analyze/route.ts:274-277` — 直接返回 analysis，无后处理
- `components/speaking/speaking-feedback.tsx:64-76` — 直接渲染 evidence

## Root Cause

**不是"LLM 产生了幻觉"**。LLM 产生错误只是输入风险。

真正的产品问题是：**系统已经通过 evidenceConsistencyCheck 检测到不可信 evidence（EVIDENCE_MISMATCH），但 NEEDS_REVIEW 状态的 containment policy 是"warn and proceed"——只附加 qualityWarning，不 sanitize 或移除 ungrounded evidence。** 这导致已被标记为不可信的具体虚构断言继续通过 API 边界到达 UI。

Quality Gate 的设计是"Generator 与 Evaluator 分离"——Evaluator（feedback-quality.ts）只返回 issues/score，不修改 analysis。但 Generator（analyze-speaking.ts）在收到 NEEDS_REVIEW 后没有执行任何 containment action，这是缺失的产品决策执行层。

## Why LLM Hallucination Alone Is Not Root Cause

- LLM 幻觉是统计性必然，无法通过 prompt 完全消除
- 产品的职责是在检测到不可信输出后建立边界
- 当前系统已经有检测器（evidenceConsistencyCheck），但没有执行器（containment）
- 这是 OUTPUT_VALIDATION 层的执行缺口，不是 MODEL 层的能力问题

## Failure Layer

OUTPUT_VALIDATION — Quality Gate 检测到问题但无 enforcement/containment policy for NEEDS_REVIEW。

## Options

| Option | 描述 | hallucination containment | false-positive cost | UX continuity | determinism | complexity | latency | diagnosability |
|--------|------|---------------------------|---------------------|---------------|-------------|------------|---------|----------------|
| A | evidence inconsistency → 整体 ruleBasedAnalysis fallback | 完全 containment | 高（所有 evidence 问题都丢 LLM 分析） | 差（丢失 level/issues/suggestions） | 高 | 低 | 无增加 | 中 |
| **B** | **删除/sanitize unsupported evidence，保留其余可信分析** | **精确 containment** | **低（只移除不可信项）** | **好（保留 level/issues/suggestions）** | **高** | **中** | **无增加** | **高** |
| C | repair/regenerate 一次，再不过则 fallback | 依赖 LLM 再次输出 | 中 | 中 | 低（LLM 可能再幻觉） | 高 | +1 LLM call | 中 |
| D | 仅附 quality warning，仍返回原始 analysis | 无 containment | 无 | 最好 | 高 | 最低 | 无增加 | 低 |

Option D 已被 ELS-EVAL-019 证明不可接受。

## Product Decision

**Option B — Sanitize unsupported evidence while preserving the rest of the LLM analysis.**

理由：
1. 仅 evidence 不可信时，level/issues/suggestions 仍可能有产品价值，full fallback 过度损失
2. Sanitization 是确定性操作，不增加延迟，不依赖 LLM 再次输出
3. 可精确记录移除了哪些 evidence、哪些字段被替换，便于诊断
4. 符合 Gold Pass Criteria 1："若走 LLM 结果：evidence 引用均可在回答中定位"

## Containment Policy

### 执行位置
`lib/speaking/evidence-sanitizer.ts` — 在 `analyze-speaking.ts` 的 Quality Gate 之后、返回之前执行。

### 处理规则

| 字段 | 策略 | 方法 |
|------|------|------|
| `ieltsAnalysis.*.evidence` | 逐条 grounding check，移除 ungrounded 项 | `isEvidenceGrounded()` 复用 evidenceConsistencyCheck heuristic |
| `mainIssue.description` | 含 ungrounded linguistic claim → 替换为安全确定性文案 | `detectUngroundedLinguisticClaims()` + `buildSafeMainIssueDescription()` |
| `candidateIssues[].description` | 同上 | 同上 |
| `summary` | 含 ungrounded linguistic claim → 替换为安全确定性文案 | `detectUngroundedLinguisticClaims()` + `buildSafeSummary()` |
| `ieltsAnalysis.overallDiagnosis` | 含 ungrounded linguistic claim → 替换为安全文案 | 同上 |
| `mainIssue.suggestion` / `microDrill.*` / `*.suggestions` | **不处理** — 这些是教学建议/练习，不是关于用户的 factual claim | N/A |

### Grounding Heuristic

复用 `evidenceConsistencyCheck` 的逻辑：
- 数据型 evidence（WPM/秒/次/%）视为 grounded（来自 audioMetadata）
- 否则要求 evidence 中至少一个 >3 字母的英文词出现在回答中（去除词尾标点）

### Linguistic Claim Detection

保守的 pattern-based 检查，覆盖 ELS-EVAL-019 冻结的高风险模式：
- which/that 定语从句
- 被动语态
- 形容词/副词比较级
- 复合句/从句
- 具体时态

不做通用 NLP parsing（任务限制）。

## False Positive Risk

- **风险**: 合法但抽象的 evidence（如"表达流畅"）因无具体英文关键词匹配而被移除
- **缓解**: 这是正确行为——"表达流畅"不是可定位的具体 evidence，移除它不影响 level/issues/suggestions
- **保护**: Test B 验证用户确实使用了 which/比较级时，对应 evidence 不被移除
- **不删除**: level、issues、suggestions 字段不受 evidence sanitization 影响

## API Boundary

修复后 API-visible analysis 中：
- `ieltsAnalysis.*.evidence` 只包含 grounded evidence
- `mainIssue.description` / `summary` / `overallDiagnosis` 不含 ungrounded linguistic claims
- `qualityWarning.sanitization` 记录移除详情（evidenceRemoved、affectedDimensions、replacedFields）

## UI Boundary

`speaking-feedback.tsx` 无需修改——API 已保证安全。UI 继续直接渲染 evidence，但 evidence 已被 sanitize。

## Trace Evidence

`validation.result` payload 新增 `evidence_sanitization` 字段：
```json
{
  "evidence_removed": 5,
  "affected_dimensions": ["fluency", "grammaticalRange"],
  "replaced_fields": ["mainIssue.description", "summary", "ieltsAnalysis.overallDiagnosis"],
  "ungrounded_claims": ["which/that 定语从句", "被动语态", "比较级"]
}
```

## Regression

### 新增测试：`tests/unit/badcase-019-hallucination-gate.test.ts`（26 tests = 20 original + 6 safety）

**Original 20 tests（主体修复）**：

| 场景 | 用例数 | 覆盖 |
|------|--------|------|
| isEvidenceGrounded 单元 | 3 | 数据型/关键词/无匹配 |
| detectUngroundedLinguisticClaims 单元 | 4 | 幻觉检测/合法不检测 |
| sanitizeUngroundedAnalysis 单元 | 6 | evidence 移除/合法保留/mainIssue/summary/无修改/不修改原对象 |
| A. Frozen hallucination fixture | 1 | 幻觉 claims 不出现在 factual 字段 |
| B. Legitimate evidence | 1 | which/比较级 evidence 保留 |
| C. Minor unrelated warning | 1 | 不触发 full fallback |
| D. Rule fallback | 1 | LLM 失败时 rule engine 行为不变 |
| E. Band leakage (020) | 1 | band guard 不回归 |
| F. Short-answer path (015) | 1 | 正常分析不破坏 |
| G. Vague advice (016) | 1 | actionabilityCheck 仍运行 |

**Safety Patch 新增 6 tests（BC-M3-004-SAFETY-PATCH）**：

| Test | 验证 |
|------|------|
| A. public-response-no-raw-hallucination | factual 字段 JSON 不含 which/被动语态/比较级/复合句；sanitization 不含内部诊断字段 |
| B. internal-trace-can-record-safe-diagnostic | sanitizationReport 可记录 ungrounded claim labels（仅 label，非 raw text） |
| C. legitimate-grammar-evidence-preserved | 用户确实使用 which/better 时，对应 evidence 不被移除 |
| D. no-detection-enforcement-drift | gate 和 sanitizer 使用同一共享 primitive，结果一致 |
| E. all-rendered-factual-fields-contained | 所有 UI 渲染的 factual 字段都在 containment 范围 |
| G. vague-advice direct actionabilityCheck | 直接验证 actionabilityCheck 独立运行，不受 019 修复影响（重写自原 G） |

### Regression Matrix

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 幻觉 evidence 到达 UI | 是 ✗ | 否 ✓ |
| 合法 evidence 保留 | 是 | 是 ✓ |
| LLM 失败 → rule fallback | 是 | 是 ✓ |
| Band 泄漏检测 | 是 | 是 ✓ |
| 短回答分析 | 正常 | 正常 ✓ |

## Expected Independent Eval

ELS-EVAL-019 预期：
- r-evidence-grounded: PASS（API-visible evidence 均可在回答中定位或为空）
- r-no-hallucination: PASS（summary/mainIssue 不含 which/被动/比较级断言）
- r-analysis-path: LLM（sanitized，非 rule fallback）

**不声明 ELS-EVAL-019 PASS**——最终判定由独立 Eval Runner 完成。


## Safety Patch (BC-M3-004-SAFETY-PATCH)

### Public Boundary Contradiction

主体修复后发现：`qualityWarning.sanitization` 为 API-visible，需确认不含 raw hallucinated claims。

**审计结果**：
- `qualityWarning.sanitization`（Public API）只含安全摘要：`applied` / `evidenceRemoved` / `affectedDimensions` / `replacedFields`
- 不含 `ungroundedClaims` / `safeReplacements` / raw claim text / matchedText
- Sanitizer 内部 `SanitizationReport`（进程内对象）含 `ungroundedClaims: { label, matchedText }`，仅用于 containment 决策，不进入 public API，也不被序列化到 Trace
- 序列化的 `validation.result` Trace 中 `ungrounded_claims` 只记录 normalized claim labels（类别名如"which/that 定语从句"），不记录 raw hallucinated sentence 或 matchedText

**Public / Internal Boundary**：
| 层级 | 字段 | 内容 | matchedText |
|------|------|------|-------------|
| Public API | qualityWarning.sanitization | applied, evidenceRemoved, affectedDimensions, replacedFields | 无 |
| In-process only | SanitizationReport.ungroundedClaims | { label, matchedText } — 仅用于 containment 决策 | 有（进程内） |
| Serialized Trace | validation.result.payload.evidence_sanitization.ungrounded_claims | normalized labels only | 无 |

### Grounding SSOT (Single Source of Truth)

**审计发现**：`feedback-quality.ts` (evidenceConsistencyCheck) 和 `evidence-sanitizer.ts` 各自实现了 grounding matching，存在 drift：
- Gate：`answerWords = answerLower.split(/\s+/)`（不去除词尾标点）
- Sanitizer：`answerWords = answerLower.split(/\s+/).map(w => w.replace(/[.,!?;:，。！？；：]+$/, ""))`（去除标点）

**修复**：抽出共享 primitive `lib/speaking/evidence-grounding.ts`：
- `buildAnswerWordSet(userAnswer)` — 构建关键词集合（去除词尾标点）
- `isDataEvidence(evidence)` — 数据型 evidence 检测
- `isEvidenceGrounded(evidence, answerWords)` — 单条 grounding 判断
- `filterGroundedEvidence(evidenceList, answerWords)` — 批量过滤
- `hasAnyGroundedEvidence(evidenceList, answerWords)` — Gate 用

Gate（detection）和 Sanitizer（enforcement）共用同一 primitive，消除漂移。

### UI Rendered Factual Fields Audit

`speaking-feedback.tsx` 实际渲染字段：
| 字段 | 行号 | 可承载 factual claim | Containment |
|------|------|---------------------|-------------|
| ieltsAnalysis.overallDiagnosis | 155 | 是 | ✓ sanitized |
| analysis.summary | 157, 225 | 是 | ✓ sanitized |
| ieltsAnalysis.*.evidence | 68-74 | 是 | ✓ sanitized |
| **ieltsAnalysis.*.issues** | **83-88** | **是** | **✓ 新增 sanitize** |
| mainIssue.description | 196 | 是 | ✓ sanitized |
| mainIssue.suggestion | 199 | 否（教学建议） | N/A |
| ieltsAnalysis.*.suggestions | 97-99 | 否（教学建议） | N/A |
| prioritizedSuggestions | 209-215 | 否（教学建议） | N/A |
| candidateIssues | — | 是但**未渲染** | ✓ 防御性 sanitize |

**新增**：`ieltsAnalysis.*.issues` sanitization — 含 ungrounded linguistic claim 的 issue 替换为安全通用文案。

### Safety Tests（6 tests = A, B, C, D, E, G）

| Test | 验证 |
|------|------|
| A. public-response-no-raw-hallucination | factual 字段 JSON 不含 which/被动语态/比较级/复合句；sanitization 不含内部诊断字段 |
| B. internal-trace-can-record-safe-diagnostic | sanitizationReport 可记录 ungrounded claim labels（仅 label，非 raw text） |
| C. legitimate-grammar-evidence-preserved | 用户确实使用 which/better 时，对应 evidence 不被移除 |
| D. no-detection-enforcement-drift | gate 和 sanitizer 使用同一共享 primitive，结果一致 |
| E. all-rendered-factual-fields-contained | 所有 UI 渲染的 factual 字段都在 containment 范围 |

## Files Changed

**主体修复（commit 0e367ca）**：
1. `lib/speaking/evidence-sanitizer.ts` — 新增，evidence sanitization 逻辑
2. `lib/speaking/types.ts` — qualityWarning 增加可选 sanitization 字段
3. `lib/llm/tasks/analyze-speaking.ts` — Quality Gate 后调用 sanitizer，Trace 记录 sanitization
4. `tests/unit/badcase-019-hallucination-gate.test.ts` — 新增，20 tests
5. `docs/v3/badcases/019-hallucination-gate.md` — 本文档

**Safety Patch（commit eaeb236）**：
6. `lib/speaking/evidence-grounding.ts` — 新增，共享 grounding primitive（SSOT）
7. `lib/speaking/feedback-quality.ts` — evidenceConsistencyCheck 改用共享 primitive
8. `lib/speaking/evidence-sanitizer.ts` — 改用共享 primitive + 新增 issues sanitization + public boundary 收紧
9. `lib/speaking/types.ts` — sanitization 增加 `applied: boolean` 字段
10. `tests/unit/badcase-019-hallucination-gate.test.ts` — 新增 6 safety tests（共 26 tests）
11. `docs/v3/badcases/019-hallucination-gate.md` — Safety Patch 章节

**Doc Close（本次）**：
12. `docs/v3/badcases/019-hallucination-gate.md` — 测试数量同步为 26，internal boundary 澄清
