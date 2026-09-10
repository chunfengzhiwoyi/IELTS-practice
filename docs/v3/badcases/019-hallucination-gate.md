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

### 新增测试：`tests/unit/badcase-019-hallucination-gate.test.ts`（20 tests）

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

## Files Changed

1. `lib/speaking/evidence-sanitizer.ts` — 新增，evidence sanitization 逻辑
2. `lib/speaking/types.ts` — qualityWarning 增加可选 sanitization 字段
3. `lib/llm/tasks/analyze-speaking.ts` — Quality Gate 后调用 sanitizer，Trace 记录 sanitization
4. `tests/unit/badcase-019-hallucination-gate.test.ts` — 新增，20 tests
5. `docs/v3/badcases/019-hallucination-gate.md` — 本文档
