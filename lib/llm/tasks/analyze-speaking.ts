/**
 * LLM Task: 口语深度分析
 * 降级策略：LLM 失败时回退到规则引擎
 */
import { z } from "zod";

import { callLlmStructured } from "@/lib/llm/structured-output";
import { analyzeSpeakingAnswer as ruleBasedAnalysis } from "@/lib/speaking/analysis";
import { logger } from "@/lib/observability/logger";
import type { SpeakingAnalysisResult, SpeakingQuestion } from "@/lib/speaking/types";

const LlmAnalysisSchema = z.object({
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
  wordCount: z.number(),
  strengths: z.array(z.string()).optional(),
});

const JSON_EXAMPLE = `{
  "mainIssue": {
    "dimension": "coherence",
    "severity": "major",
    "description": "回答缺乏过渡词和逻辑连接，导致观点之间跳跃。",
    "suggestion": "使用 firstly, moreover, however 等连接词串联观点。"
  },
  "microDrill": {
    "prompt": "请在下面的句子之间加入合适的连接词重新表达...",
    "exampleImprovement": "Firstly, I believe... Moreover, this leads to..."
  },
  "summary": "回答内容充实但连贯性不足，建议加强过渡词的使用。",
  "wordCount": 85,
  "strengths": ["词汇使用较丰富", "观点明确"]
}`;

/**
 * 使用 LLM 深度分析口语回答。
 * 失败时降级到规则引擎。
 */
export async function analyzeSpeakingWithLlm(
  answer: string,
  question: SpeakingQuestion,
  traceId: string,
): Promise<SpeakingAnalysisResult> {
  try {
    const result = await callLlmStructured({
      tier: "main",
      messages: [
        {
          role: "system",
          content: `你是一个雅思口语分析专家。分析学生的文字回答并给出改善建议。

规则：
- 每次只选择一个最值得改善的主要问题（mainIssue）
- dimension 可选：fluency / vocabulary / coherence / development / argumentation
- severity: major 表示明显影响分数，minor 表示可优化但不严重
- microDrill 针对 mainIssue 给出具体练习
- summary 一句话概括
- 不要给虚假高分或过度表扬

只输出 JSON。`,
        },
        {
          role: "user",
          content: `题目类型：IELTS Speaking ${question.part}
话题：${question.topic}
问题：${question.question}
学生回答：${answer}
预期字数：${question.expectedLength.min}-${question.expectedLength.max}

请分析这个回答。`,
        },
      ],
      schema: LlmAnalysisSchema,
      schemaName: "SpeakingAnalysis",
      jsonExample: JSON_EXAMPLE,
      traceId,
      temperature: 0.3,
    });

    const llmData = result.data;
    const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

    // Convert LLM result to SpeakingAnalysisResult format
    return {
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
        connectorCount: 0, // LLM path doesn't need this
        uniqueWordRatio: 0,
        paraphraseScore: 0,
      },
      summary: llmData.summary,
    };
  } catch (err) {
    logger.warn("llm.speaking.fallback", {
      trace_id: traceId,
      error: err instanceof Error ? err.message : "unknown",
    });
    // 降级到规则引擎
    return ruleBasedAnalysis(answer, question);
  }
}
