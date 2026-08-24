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
import { logger } from "@/lib/observability/logger";
import type { SpeakingAnalysisResult, SpeakingQuestion, IeltsSpeakingAnalysis, DimensionAnalysis } from "@/lib/speaking/types";
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
  "prioritizedSuggestions": ["每天 5 分钟不间断自由口语练习", "使用过渡词连接观点", "跟读 native speaker 音频提升语速"]
}`;

// =============================================================
// Main Function
// =============================================================

export interface AnalyzeSpeakingOptions {
  overrideProviders?: CallStructuredOptions["overrideProviders"];
}

/**
 * 使用 LLM 深度分析口语回答。
 * @param answer - 用户回答文本（转写或手动输入）
 * @param question - 题目信息
 * @param traceId - 追踪 ID
 * @param audioMetadata - 音频元数据（语音回答时提供，文字回答为 undefined）
 * @param abilityContext - 用户历史能力上下文（Phase 4.3）
 * @param opts - 可选配置
 */
export async function analyzeSpeakingWithLlm(
  answer: string,
  question: SpeakingQuestion,
  traceId: string,
  audioMetadata?: AudioMetadata,
  abilityContext?: AbilityMemoryContext,
  opts?: AnalyzeSpeakingOptions,
): Promise<SpeakingAnalysisResult> {
  try {
    // 构造 prompt，根据是否有 audioMetadata 调整
    const systemPrompt = buildSystemPrompt(!!audioMetadata);
    const userPrompt = buildUserPrompt(answer, question, audioMetadata, abilityContext);

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

    // ─── Feedback Quality Gate ───────────────────────────────
    const qualityCheck = validateFeedbackQuality(llmResult, answer);

    if (qualityCheck.status === "FAIL") {
      logger.warn("llm.speaking.quality.fail", {
        trace_id: traceId,
        score: qualityCheck.score,
        issues: qualityCheck.issues.map((i) => i.type),
      });
      // 质量不合格 → fallback 到规则引擎
      return ruleBasedAnalysis(answer, question);
    }

    if (qualityCheck.status === "NEEDS_REVIEW") {
      logger.info("llm.speaking.quality.review", {
        trace_id: traceId,
        score: qualityCheck.score,
        issues: qualityCheck.issues.map((i) => i.type),
      });
      // 附加警告但仍返回 LLM 结果
      llmResult.qualityWarning = {
        score: qualityCheck.score,
        issues: qualityCheck.issues.map((i) => i.description),
      };
    }

    return llmResult;
  } catch (err) {
    logger.warn("llm.speaking.fallback", {
      trace_id: traceId,
      error: err instanceof Error ? err.message : "unknown",
    });
    // 降级到规则引擎（无 ieltsAnalysis）
    return ruleBasedAnalysis(answer, question);
  }
}

// =============================================================
// Prompt Construction
// =============================================================

function buildSystemPrompt(hasAudio: boolean): string {
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

  if (hasAudio) {
    return base + `

⚠️ 本次回答包含音频分析数据（WPM、停顿信息）。请将这些数据作为 Fluency 评估的重要证据：
- WPM 120-150 为自然语速；< 100 偏慢，> 170 可能不清晰
- 长停顿（>2秒）和频繁停顿是 fluency 问题的重要信号
- 但注意：Part 2 的开头思考时间和自然换气停顿不算问题
- 不要把数字直接当成分数公式，要结合整体表现综合判断

只输出 JSON。`;
  }

  return base + `

注意：本次为文字输入回答，没有音频数据。Fluency 分析基于文本结构（是否有逻辑连接、展开是否充分），不涉及语速和停顿。

只输出 JSON。`;
}

function buildUserPrompt(answer: string, question: SpeakingQuestion, audioMetadata?: AudioMetadata, abilityContext?: AbilityMemoryContext): string {
  let prompt = `题目类型：IELTS Speaking ${question.part}
话题：${question.topic}
问题：${question.question}
学生回答：${answer}
预期字数：${question.expectedLength.min}-${question.expectedLength.max}`;

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
