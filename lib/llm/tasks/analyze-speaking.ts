/**
 * LLM Task: IELTS Speaking 深度分析（Phase 3）
 * -------------------------------------------------------
 * 基于 transcript + audioMetadata 综合判断，覆盖：
 *   - Fluency and Coherence（需 audioMetadata）
 *   - Lexical Resource
 *   - Grammatical Range and Accuracy
 *   - Pronunciation（Phase 4，当前 null）
 *
 * 降级策略：LLM 失败时回退到规则引擎（仅文本分析）
 */
import { z } from "zod";

import { callLlmStructured, type CallStructuredOptions } from "@/lib/llm/structured-output";
import { analyzeSpeakingAnswer as ruleBasedAnalysis } from "@/lib/speaking/analysis";
import { validateFeedbackQuality } from "@/lib/speaking/feedback-quality";
import { sanitizeUngroundedAnalysis } from "@/lib/speaking/evidence-sanitizer";
import {
  conservativeEvidenceForTargets,
  validateTargetExpressionEvidence,
} from "@/lib/speaking/target-expression-evidence-validator";
import { logger } from "@/lib/observability/logger";
import { traceStore } from "@/lib/observability/trace-store";
import { EVENT_TYPE_TO_LAYER, type TraceEvent } from "@/lib/observability/trace-contract";
import { isTraceEnabled } from "@/lib/observability/trace-context";
import type {
  SpeakingAnalysisResult,
  SpeakingQuestion,
  IeltsSpeakingAnalysis,
  DimensionAnalysis,
  SuggestedExpression,
  TargetExpressionUsageEvidence,
  TargetExpressionEvidenceSummary,
} from "@/lib/speaking/types";
import type { AudioMetadata } from "@/lib/speaking/audio-types";
import type { AbilityMemoryContext } from "@/lib/ability/memory-retriever";

// =============================================================
// Schema
// =============================================================

const DimensionSchema = z.object({
  label: z.string(),
  level: z.enum(["strong", "adequate", "developing", "weak"]),
  evidence: z.array(z.string()),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

/** 04B: 目标表达使用证据（LLM 原始输出契约；与 ieltsAnalysis 平级的可选子对象） */
const TargetExpressionUsageEvidenceSchema = z.object({
  itemId: z.string(),
  attempted: z.boolean(),
  quote: z.string().nullable(),
  assessment: z.enum(["CORRECT", "ISSUE", "UNCERTAIN", "NOT_USED"]),
  reason: z.string(),
});

const EnhancedAnalysisSchema = z.object({
  mainIssue: z.object({
    dimension: z.string(),
    severity: z.enum(["minor", "major"]),
    description: z.string(),
    suggestion: z.string(),
  }),
  microDrill: z.object({
    prompt: z.string(),
    exampleImprovement: z.string(),
  }),
  summary: z.string(),
  strengths: z.array(z.string()).optional(),
  // IELTS 四维度分析
  fluency: DimensionSchema.nullable(),
  lexicalResource: DimensionSchema.nullable(),
  grammaticalRange: DimensionSchema.nullable(),
  overallDiagnosis: z.string(),
  prioritizedSuggestions: z.array(z.string()),
  // 04B: 可选目标表达使用证据（0..N 条，validator 会按 session frozen targets 白名单过滤/补齐）
  targetExpressionUsageEvidence: z.array(TargetExpressionUsageEvidenceSchema).optional(),
});

const JSON_EXAMPLE = `{
  "mainIssue": {
    "dimension": "fluency",
    "severity": "major",
    "description": "回答中有多处明显停顿（最长 3.2 秒），语速偏慢（98 WPM），影响流利度评价。",
    "suggestion": "练习不停顿地说完一个完整观点，哪怕用简单表达。"
  },
  "microDrill": {
    "prompt": "用 30 秒不停顿地描述你今天做了什么，只求流畅不求完美。",
    "exampleImprovement": "Well, today I woke up early, had breakfast, then went to work where I spent most of my time in meetings..."
  },
  "summary": "内容有一定深度，但流利度和语法准确性需要加强。",
  "strengths": ["话题展开有条理", "使用了一些不常见词汇"],
  "fluency": {
    "label": "流利度与连贯性",
    "level": "developing",
    "evidence": ["语速 98 WPM（偏慢）", "3 次明显停顿", "最长停顿 3.2 秒"],
    "issues": ["多次中途犹豫", "观点之间缺乏自然过渡"],
    "suggestions": ["练习 shadowing（跟读）提高语速", "准备几个万能过渡句"]
  },
  "lexicalResource": {
    "label": "词汇资源",
    "level": "adequate",
    "evidence": ["使用了 significant、inevitable 等学术词汇", "有一定的同义替换"],
    "issues": ["部分表达重复（said 出现 4 次）"],
    "suggestions": ["将 said 替换为 mentioned/stated/argued", "积累话题相关的 collocations"]
  },
  "grammaticalRange": {
    "label": "语法广度与准确性",
    "level": "adequate",
    "evidence": ["使用了定语从句和条件句"],
    "issues": ["主谓一致错误 1 处", "时态混用"],
    "suggestions": ["注意第三人称单数", "叙述过去事件统一用过去时"]
  },
  "overallDiagnosis": "当前最大瓶颈在流利度——频繁停顿导致表达不连贯。词汇和语法基础可以支撑更流畅的表达，建议优先练习连续输出。",
  "prioritizedSuggestions": ["每天 5 分钟不间断自由口语练习", "使用过渡词连接观点", "跟读 native speaker 音频提升语速"],
  "targetExpressionUsageEvidence": [
    {
      "itemId": "seed-003",
      "attempted": true,
      "quote": "I take my health for granted",
      "assessment": "CORRECT",
      "reason": "在回答中自然使用 take...for granted 表达把健康视为理所当然，语义与搭配正确。"
    }
  ]
}`;

// =============================================================
// Main Function
// =============================================================

export interface AnalyzeSpeakingOptions {
  overrideProviders?: CallStructuredOptions["overrideProviders"];
  /**
   * PRODUCT-LOOP-04B — session frozen suggestedExpressions（server authority）。
   * 由 analyze route 从 session 读回传入；analyze 阶段绝不重新 selectTargetExpressions。
   */
  suggestedExpressions?: SuggestedExpression[];
}

/**
 * 使用 LLM 深度分析口语回答。
 * @param answer - 用户回答文本（转写或手动输入）
 * @param question - 题目信息
 * @param traceId - 追踪 ID
 * @param audioMetadata - 音频元数据（语音回答时提供，文字回答为 undefined）
 * @param abilityContext - 用户历史能力上下文（Phase 4.3）
 * @param opts - 可选配置（含 04B session frozen suggestedExpressions）
 */
export async function analyzeSpeakingWithLlm(
  answer: string,
  question: SpeakingQuestion,
  traceId: string,
  audioMetadata?: AudioMetadata,
  abilityContext?: AbilityMemoryContext,
  opts?: AnalyzeSpeakingOptions,
): Promise<SpeakingAnalysisResult> {
  // 04B: session frozen targets（server authority；无则 []，不影响主分析）
  const suggestedExpressions = opts?.suggestedExpressions ?? [];
  const targetItemIds = suggestedExpressions.map((s) => s.itemId);
  const canonicalOf = (itemId: string): string | null =>
    suggestedExpressions.find((s) => s.itemId === itemId)?.canonicalForm ?? null;
  try {

    // 构造 prompt，根据是否有 audioMetadata 调整
    const systemPrompt = buildSystemPrompt(!!audioMetadata, suggestedExpressions);
    const userPrompt = buildUserPrompt(answer, question, audioMetadata, abilityContext, suggestedExpressions);

    const result = await callLlmStructured({
      tier: "main",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      schema: EnhancedAnalysisSchema,
      schemaName: "SpeakingAnalysis",
      jsonExample: JSON_EXAMPLE,
      traceId,
      temperature: 0.3,
    }, { overrideProviders: opts?.overrideProviders });

    const llmData = result.data;
    const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

    // 构建 IELTS 四维度分析
    const ieltsAnalysis: IeltsSpeakingAnalysis = {
      fluency: llmData.fluency as DimensionAnalysis | null,
      lexicalResource: llmData.lexicalResource as DimensionAnalysis | null,
      grammaticalRange: llmData.grammaticalRange as DimensionAnalysis | null,
      pronunciation: null, // Phase 4
      overallDiagnosis: llmData.overallDiagnosis,
      prioritizedSuggestions: llmData.prioritizedSuggestions,
    };

    const llmResult: SpeakingAnalysisResult = {
      candidateIssues: [
        {
          dimension: llmData.mainIssue.dimension as SpeakingAnalysisResult["mainIssue"]["dimension"],
          severity: llmData.mainIssue.severity,
          description: llmData.mainIssue.description,
          suggestion: llmData.mainIssue.suggestion,
        },
      ],
      mainIssue: {
        dimension: llmData.mainIssue.dimension as SpeakingAnalysisResult["mainIssue"]["dimension"],
        severity: llmData.mainIssue.severity,
        description: llmData.mainIssue.description,
        suggestion: llmData.mainIssue.suggestion,
      },
      microDrill: {
        prompt: llmData.microDrill.prompt,
        exampleImprovement: llmData.microDrill.exampleImprovement,
        targetDimension: llmData.mainIssue.dimension as SpeakingAnalysisResult["mainIssue"]["dimension"],
      },
      metrics: {
        wordCount,
        sentenceCount: answer.split(/[.!?]+/).filter((s) => s.trim()).length,
        connectorCount: 0,
        uniqueWordRatio: 0,
        paraphraseScore: 0,
      },
      summary: llmData.summary,
      ieltsAnalysis,
    };

    // ─── PRODUCT-LOOP-04B: raw → validated evidence（确定性 validator）───
    const rawEvidence: TargetExpressionUsageEvidence[] = llmData.targetExpressionUsageEvidence ?? [];
    const { evidence: validatedEvidence, summary: evidenceSummary } = validateTargetExpressionEvidence({
      raw: rawEvidence,
      answer,
      targetItemIds,
      canonicalOf,
    });
    if (targetItemIds.length > 0) {
      llmResult.targetExpressionEvidence = validatedEvidence;
    }

    // ─── Feedback Quality Gate ───────────────────────────────
    const qualityCheck = validateFeedbackQuality(llmResult, answer);

    // ---- ELS-EVAL-020 S1 REDLINE: BAND_SCORE_LEAK forces safe fallback ----
    // Band score / equivalent capability judgement must never reach user-visible
    // feedback without formal assessment basis. Any BAND_SCORE_LEAK (1 or more)
    // deterministically routes to the rule engine safe path (no LLM band text).
    const bandLeakIssues = qualityCheck.issues.filter((i) => i.type === "BAND_SCORE_LEAK");
    const bandRedline = bandLeakIssues.length > 0;

    // ─── BC-M3-004: Evidence Sanitization ────────────────────
    // Quality Gate 检测到 EVIDENCE_MISMATCH 后，移除未在用户回答中获得支持的具体断言。
    const { analysis: sanitizedResult, report: sanitizationReport } = sanitizeUngroundedAnalysis(
      llmResult,
      answer,
      qualityCheck,
    );
    const finalResult = sanitizedResult;

    // M2: validation.result（口语四门质量门）
    if (isTraceEnabled()) {
      const gateScores: Record<string, number> = {};
      for (const issue of qualityCheck.issues) {
        const gate = (issue.type.split("_")[0] ?? "unknown").toLowerCase();
        gateScores[gate] = (gateScores[gate] ?? 100) - 10;
      }
      const valEvent: TraceEvent = {
        trace_id: traceId,
        event_id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
        seq: Date.now(),
        ts: new Date().toISOString(),
        event_type: "validation.result",
        layer: EVENT_TYPE_TO_LAYER["validation.result"],
        status: qualityCheck.status === "PASS" ? "ok" : qualityCheck.status === "NEEDS_REVIEW" ? "degraded" : "error",
        duration_ms: null,
        error_code: null,
        error_message: null,
        payload: {
          validator: "speaking_quality_gate",
          band_leakage_flag: bandRedline,
          analysis_path: bandRedline ? "rule_based_analysis" : "llm_analysis",
          final_response_redacted: bandRedline,
          outcome: qualityCheck.status.toLowerCase(),
          repair_attempts: 0,
          quality_gate_scores: {
            schemaCheck: gateScores["schema"] ?? 100,
            evidenceConsistencyCheck: gateScores["evidence"] ?? 100,
            actionabilityCheck: gateScores["actionability"] ?? 100,
            ieltsAlignmentCheck: gateScores["ielts"] ?? 100,
            total: qualityCheck.score,
          },
          quality_warning: qualityCheck.issues.map((i) => i.description).join("; ").slice(0, 300),
          evidence_sanitization: sanitizationReport.sanitized
            ? {
                evidence_removed: sanitizationReport.evidenceRemoved,
                affected_dimensions: sanitizationReport.affectedDimensions,
                replaced_fields: sanitizationReport.replacedFields,
                ungrounded_claims: sanitizationReport.ungroundedClaims.map((cl) => cl.label),
              }
            : null,
          target_expression_evidence: summarizeTraceEvidence(evidenceSummary),
        },
      };
      traceStore.appendEvent(valEvent);
    }

    if (qualityCheck.status === "FAIL" || bandRedline) {
      logger.warn("llm.speaking.quality.fail", {
        trace_id: traceId,
        score: qualityCheck.score,
        issues: qualityCheck.issues.map((i) => i.type),
      });
      // M2: fallback.triggered（质量门失败 → rule_based_analysis）
      if (isTraceEnabled()) {
        const fbEvent: TraceEvent = {
          trace_id: traceId,
          event_id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
          seq: Date.now() + 1,
          ts: new Date().toISOString(),
          event_type: "fallback.triggered",
          layer: EVENT_TYPE_TO_LAYER["fallback.triggered"],
          status: "degraded",
          duration_ms: null,
          error_code: bandRedline ? "BAND_SCORE_LEAK_REDLINE" : "QUALITY_GATE_FAIL",
          error_message: `score=${qualityCheck.score}`,
          payload: {
            trigger_error_code: "QUALITY_GATE_FAIL",
            chain_snapshot: [
              { step: "llm_analysis", from: "llm", to: "llm", status: "used" },
              { step: "quality_gate", from: "llm", to: "quality_gate", status: "used" },
              { step: "rule_engine", from: "quality_gate", to: "rule_engine", status: "used" },
            ],
            degradation_flag: true,
            to_kind: "rule_based_analysis",
          },
        };
        traceStore.appendEvent(fbEvent);
        traceStore.updateHeader(traceId, { degradation_flag: true });
      }
      // 质量不合格 → fallback 到规则引擎；04B: evidence 保守化（不伪造 CORRECT）
      return attachConservativeEvidence(ruleBasedAnalysis(answer, question), targetItemIds);
    }

    if (qualityCheck.status === "NEEDS_REVIEW") {
      logger.info("llm.speaking.quality.review", {
        trace_id: traceId,
        score: qualityCheck.score,
        issues: qualityCheck.issues.map((i) => i.type),
        sanitized: sanitizationReport.sanitized,
        evidence_removed: sanitizationReport.evidenceRemoved,
      });
      // qualityWarning 已在 sanitizeUngroundedAnalysis 中设置（含 sanitization 信息）
      if (!sanitizationReport.sanitized) {
        finalResult.qualityWarning = {
          score: qualityCheck.score,
          issues: qualityCheck.issues.map((i) => i.description),
        };
      }
    }

    return finalResult;
  } catch (err) {
    logger.warn("llm.speaking.fallback", {
      trace_id: traceId,
      error: err instanceof Error ? err.message : "unknown",
    });
    // 降级到规则引擎（无 ieltsAnalysis）；04B: evidence 保守化
    return attachConservativeEvidence(ruleBasedAnalysis(answer, question), targetItemIds);
  }
}

/** 04B: 主 LLM 分析被 fallback 接管时，全部 session targets → UNCERTAIN（不产生正向 CORRECT）。 */
function attachConservativeEvidence(
  result: SpeakingAnalysisResult,
  targetItemIds: string[],
): SpeakingAnalysisResult {
  if (targetItemIds.length === 0) return result;
  const { evidence } = conservativeEvidenceForTargets(targetItemIds);
  return { ...result, targetExpressionEvidence: evidence };
}

function summarizeTraceEvidence(s: TargetExpressionEvidenceSummary): Record<string, unknown> {
  return {
    target_count: s.targetCount,
    raw_evidence_count: s.rawEvidenceCount,
    validated_evidence_count: s.validatedEvidenceCount,
    correct_count: s.correctCount,
    issue_count: s.issueCount,
    uncertain_count: s.uncertainCount,
    not_used_count: s.notUsedCount,
    grounding_downgrade_count: s.groundingDowngradeCount,
    dropped_item_ids: s.droppedItemIds,
  };
}

// =============================================================
// Prompt Construction
// =============================================================

const EVIDENCE_RULES = `## 目标表达使用证据（targetExpressionUsageEvidence）

本回答可能附带了系统给学生的「建议表达」（见问题下方）。它们只是 OPTIONAL 提示：
- 学生**没有使用**某个建议表达 → NOT_USED。NOT_USED 不是错误、不影响口语质量评分、不代表词汇失败。
- 只有当学生**真正在回答中使用了**目标表达时才输出证据条目；每个建议表达按 itemId 单独判定（禁止"用了一个 → 两个都算"）。

判定 CORRECT 必须同时满足：
1. 确为目标表达或其合法形态变化（如 take it for granted / took it for granted / taking things for granted 都是 take something for granted 的合法变体；不要求 canonical 逐字一致）。
2. 语义适合当前句子（表达核心义，如"把…当作理所当然"；**语义角色错误、搭配对象错误、句意不成立 → ISSUE，即使短语完整出现**）。
3. 核心搭配/结构正确。
4. quote 必须逐字来自学生原始回答（grounding 的文本 span）。
5. 不是单纯重复提示词。

以下情况**不得**判 CORRECT：
- **定义式/元语言回声**：学生只是在念出表达、解释"这个短语是什么意思"、讨论"我可以说 take something for granted"等 → 至少 UNCERTAIN（视语言而定）。
- **自我怀疑**：如 "... for granted? maybe" → UNCERTAIN。
- **先正确后改错**：如果最终表达意图改为错误说法，以最终错误为准 → ISSUE；无法可靠判断最终意图 → UNCERTAIN。

自纠（先错后改，最终出现清晰、正确、grounded 的使用）→ 可以 CORRECT，quote 指向最终正确 span，reason 说明 self-corrected。

当无法可靠判断（语义 fit 不明 / 是否属于目标表达不明 / 是否只是回声不明 / 最终修正意图不明）→ 必须输出 UNCERTAIN，不要强行二选一。本产品 precision-first。

quote 规则：CORRECT/ISSUE 必须给出真实 quote；NOT_USED 的 quote 必须为 null；找不到可定位的 quote 就不要输出 CORRECT。`;

function buildSystemPrompt(hasAudio: boolean, suggestedExpressions: SuggestedExpression[]): string {
  const base = `你是一位经验丰富的 IELTS Speaking 考官和教练。请根据 IELTS Speaking 评分标准分析学生的口语回答。

你需要从三个维度评估（第四维度 Pronunciation 需要专用工具，本次不评估）：

1. **Fluency and Coherence** — 流利度与连贯性
   - 语速是否自然（非过快或过慢）
   - 是否有不自然的停顿或犹豫
   - 观点之间是否有逻辑连接和过渡
   - 是否能持续表达而非零散碎片

2. **Lexical Resource** — 词汇资源
   - 词汇范围是否足够
   - 是否使用了不常见词汇或 collocations
   - 是否有效使用 paraphrase（同义替换）
   - 是否有词汇使用不当

3. **Grammatical Range and Accuracy** — 语法广度与准确性
   - 是否使用了多种句式结构
   - 复合句/从句使用情况
   - 语法错误频率及严重程度

评估规则：
- 每个维度给出 level: strong / adequate / developing / weak
- level 不是分数，是定性描述，基于 IELTS Band Descriptors 的公开描述
- evidence 必须引用用户的原话或具体数据作为证据
- 不要给出具体 Band 分数（如 Band 6.5），只给定性评估
- mainIssue 选择当前最需要改善的一个问题
- overallDiagnosis 综合判断当前最大瓶颈
- prioritizedSuggestions 给出 2-3 条按优先级排序的改善建议`;

  const evidenceSection = suggestedExpressions.length > 0 ? EVIDENCE_RULES : "";

  if (hasAudio) {
    return base + `

⚠️ 本次回答包含音频分析数据（WPM、停顿信息）。请将这些数据作为 Fluency 评估的重要证据：
- WPM 120-150 为自然语速；< 100 偏慢，> 170 可能不清晰
- 长停顿（>2秒）和频繁停顿是 fluency 问题的重要信号
- 但注意：Part 2 的开头思考时间和自然换气停顿不算问题
- 不要把数字直接当成分数公式，要结合整体表现综合判断
` + evidenceSection + `

只输出 JSON。`;
  }

  return base + `

注意：本次为文字输入回答，没有音频数据。Fluency 分析基于文本结构（是否有逻辑连接、展开是否充分），不涉及语速和停顿。
` + evidenceSection + `

只输出 JSON。`;
}

function buildUserPrompt(
  answer: string,
  question: SpeakingQuestion,
  audioMetadata?: AudioMetadata,
  abilityContext?: AbilityMemoryContext,
  suggestedExpressions?: SuggestedExpression[],
): string {
  let prompt = `题目类型：IELTS Speaking ${question.part}
话题：${question.topic}
问题：${question.question}
学生回答：${answer}
预期字数：${question.expectedLength.min}-${question.expectedLength.max}`;

  // 04B: 系统建议表达（仅 OPTIONAL 提示上下文；itemId/canonicalForm/meaning 最小信息，
  // 不暴露 recallLevel / review schedule / mastery state）
  if (suggestedExpressions && suggestedExpressions.length > 0) {
    const lines = suggestedExpressions
      .map(
        (s, i) =>
          `${i + 1}. itemId: ${s.itemId} | 表达: ${s.canonicalForm} | 含义: ${s.meaning}`,
      )
      .join("\n");
    prompt += `

系统建议表达（OPTIONAL 提示，学生可自由使用或忽略）：
${lines}`;
  }

  if (audioMetadata) {
    prompt += `

音频分析数据：
- 录音总时长：${audioMetadata.duration.toFixed(1)} 秒
- 实际说话时间：${audioMetadata.speakingTime.toFixed(1)} 秒
- 语速：${audioMetadata.wpm} WPM
- 停顿次数：${audioMetadata.pauses.pauseCount}
- 总停顿时长：${audioMetadata.pauses.totalPauseDuration} 秒
- 最长停顿：${audioMetadata.pauses.longestPause} 秒
- 停顿占比：${((audioMetadata.pauses.totalPauseDuration / audioMetadata.duration) * 100).toFixed(1)}%`;
  }

  // Phase 4.3: 注入历史能力上下文
  if (abilityContext && abilityContext.totalSessions >= 2) {
    prompt += buildMemorySection(abilityContext);
  }

  prompt += `\n\n请按照评分标准分析这个回答。`;
  return prompt;
}

// =============================================================
// Memory Context Section (Phase 4.3)
// =============================================================

const DIMENSION_LABELS: Record<string, string> = {
  fluency: "流利度与连贯性",
  lexicalResource: "词汇资源",
  grammaticalRange: "语法广度与准确性",
  pronunciation: "发音",
};

const LEVEL_LABELS: Record<string, string> = {
  weak: "薄弱",
  developing: "发展中",
  adequate: "合格",
  strong: "优秀",
};

const TREND_LABELS: Record<string, string> = {
  improving: "改善中",
  stable: "稳定",
  declining: "下滑",
};

function buildMemorySection(ctx: AbilityMemoryContext): string {
  const lines: string[] = [];
  lines.push(`\n\n学习者历史背景（基于过去 ${ctx.totalSessions} 次练习）：`);

  // 最薄弱维度
  if (ctx.weakestDimension && ctx.weakestLevel) {
    const dimLabel = DIMENSION_LABELS[ctx.weakestDimension] ?? ctx.weakestDimension;
    const levelLabel = LEVEL_LABELS[ctx.weakestLevel] ?? ctx.weakestLevel;
    lines.push(`- 最薄弱维度：${dimLabel}（当前水平：${levelLabel}）`);
  }

  // 反复出现的问题
  if (ctx.recurringIssues.length > 0) {
    const issueList = ctx.recurringIssues.map((issue, i) => `${i + 1}. ${issue}`).join("；");
    lines.push(`- 反复出现的问题：${issueList}`);
  }

  // 各维度趋势
  const trendParts: string[] = [];
  for (const [dim, trend] of Object.entries(ctx.recentTrends)) {
    const dimLabel = DIMENSION_LABELS[dim] ?? dim;
    const trendLabel = TREND_LABELS[trend] ?? trend;
    trendParts.push(`${dimLabel} ${trendLabel}`);
  }
  if (trendParts.length > 0) {
    lines.push(`- 近期趋势：${trendParts.join("，")}`);
  }

  // 引导 LLM 关注但不机械判断
  lines.push(`- 请关注：以上是该学习者的历史模式。如果本次回答中这些问题有改善，请在 evidence 中明确标注进步。不要因为历史有此问题就机械判定本次仍然存在。`);

  return lines.join("\n");
}
