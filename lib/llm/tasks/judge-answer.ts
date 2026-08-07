/**
 * LLM Task: 语义判题
 * 用于 /learn submit 和 /review submit
 * 降级策略：LLM 失败时回退到关键词匹配
 */
import { z } from "zod";

import { callLlmStructured } from "@/lib/llm/structured-output";
import { logger } from "@/lib/observability/logger";

const JudgeSchema = z.object({
  correct: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  explanation: z.string(),
});

const JSON_EXAMPLE = `{"correct": true, "confidence": "high", "explanation": "答案准确表达了核心含义"}`;

export interface LlmJudgeResult {
  correct: boolean;
  confidence: string;
  explanation: string;
  source: "llm" | "fallback";
}

/**
 * 使用 LLM 判断答案是否正确。
 * 失败时降级到关键词匹配。
 */
export async function judgeAnswerWithLlm(params: {
  term: string;
  coreMeaning: string;
  userAnswer: string;
  acceptedAnswers: string[];
  answerKeywords: string[];
  traceId: string;
}): Promise<LlmJudgeResult> {
  const { term, coreMeaning, userAnswer, acceptedAnswers, answerKeywords, traceId } = params;

  // 空答案直接判错，不调 LLM
  if (!userAnswer.trim()) {
    return { correct: false, confidence: "high", explanation: "未提供答案", source: "fallback" };
  }

  try {
    const result = await callLlmStructured({
      tier: "fast",
      messages: [
        {
          role: "system",
          content: `你是一个英语学习答案判断器。判断用户对单词/短语含义的回忆是否正确。
规则：
- 只要用户答案表达了核心含义的意思就算正确（不要求精确措辞）
- 同义表述、近义词、口语化表达都可以接受
- 明显错误、完全无关、或遗漏核心含义则判错
- confidence: high=非常确定, medium=比较确定, low=不太确定

只输出 JSON。`,
        },
        {
          role: "user",
          content: `词条：${term}
正确含义：${coreMeaning}
可接受答案示例：${acceptedAnswers.join("、")}
用户回答：${userAnswer}

请判断用户回答是否正确。`,
        },
      ],
      schema: JudgeSchema,
      schemaName: "JudgeResult",
      jsonExample: JSON_EXAMPLE,
      traceId,
      temperature: 0,
    });

    return { ...result.data, source: "llm" };
  } catch (err) {
    // 降级到关键词匹配
    logger.warn("llm.judge.fallback", {
      trace_id: traceId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return fallbackJudge(userAnswer, acceptedAnswers, answerKeywords);
  }
}

function fallbackJudge(
  answer: string,
  acceptedAnswers: string[],
  answerKeywords: string[],
): LlmJudgeResult {
  const normalized = answer.trim().toLowerCase().replace(/[^\u4e00-\u9fff\w\s]/g, "");

  // Exact match
  const exactMatch = acceptedAnswers.some(
    (a) => a.toLowerCase().replace(/[^\u4e00-\u9fff\w\s]/g, "") === normalized,
  );
  if (exactMatch) {
    return { correct: true, confidence: "high", explanation: "精确匹配", source: "fallback" };
  }

  // Keyword match
  const allKeywords = answerKeywords.length > 0 && answerKeywords.every(
    (kw) => normalized.includes(kw.toLowerCase()),
  );
  if (allKeywords) {
    return { correct: true, confidence: "medium", explanation: "关键词匹配", source: "fallback" };
  }

  return { correct: false, confidence: "medium", explanation: "未匹配到核心含义", source: "fallback" };
}
