/**
 * 工具：分析口语文字回答
 * ------------------------------------------------------------
 * 交接单 §6.3。
 * 关键规则（§3.4 / §7.4）：每轮只挑一个"最值得改善"的主要问题。
 * P0 占位；P3 引入真实分析逻辑。
 */
import { z } from "zod";

export const AnalyzeSpeakingAnswerInputSchema = z.object({
  question: z.string(),
  answer: z.string(),
  history: z
    .array(
      z.object({
        role: z.enum(["assistant", "user"]),
        text: z.string(),
      }),
    )
    .default([]),
});
export type AnalyzeSpeakingAnswerInput = z.infer<typeof AnalyzeSpeakingAnswerInputSchema>;

export const SpeakingAnalysisSchema = z.object({
  candidateIssues: z.array(z.string()),
  /** 主要问题：每轮只允许一个。见交接单 §3.4 */
  mainIssue: z.object({
    dimension: z.string(),
    description: z.string(),
  }),
  microDrill: z.object({
    prompt: z.string(),
    exampleImprovement: z.string().optional(),
  }),
});
export type SpeakingAnalysis = z.infer<typeof SpeakingAnalysisSchema>;

export async function analyzeSpeakingAnswer(
  _input: AnalyzeSpeakingAnswerInput,
): Promise<SpeakingAnalysis> {
  return {
    candidateIssues: [],
    mainIssue: {
      dimension: "PLACEHOLDER",
      description: "（占位）P3 将生成真实分析",
    },
    microDrill: {
      prompt: "（占位）P3 将生成真实微训练",
    },
  };
}
