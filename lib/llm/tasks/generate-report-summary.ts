/**
 * LLM Task: 报告自然语言建议
 */
import { z } from "zod";

import { callLlmStructured } from "@/lib/llm/structured-output";
import { logger } from "@/lib/observability/logger";
import type { ProgressReport } from "@/lib/report/types";

const SummarySchema = z.object({
  overallAssessment: z.string(),
  keyInsight: z.string(),
  actionableSuggestion: z.string(),
  encouragement: z.string(),
});

const JSON_EXAMPLE = `{
  "overallAssessment": "过去一周学习频率稳定，词汇积累有进展，但复习正确率有下降趋势。",
  "keyInsight": "口语练习中连贯性问题重复出现，可能是过渡词使用不够熟练。",
  "actionableSuggestion": "建议本周重点：1) 每天复习到期词条 2) 口语练习时刻意使用 however, moreover 等过渡词",
  "encouragement": "坚持每天接触英语，量变会带来质变。加油！"
}`;

export interface ReportLlmSummary {
  overallAssessment: string;
  keyInsight: string;
  actionableSuggestion: string;
  encouragement: string;
}

/**
 * 使用 LLM 为报告生成自然语言总结和建议。
 * 失败时返回 null（不影响报告主体数据）。
 */
export async function generateReportSummaryWithLlm(
  report: ProgressReport,
  traceId: string,
): Promise<ReportLlmSummary | null> {
  if (report.insufficientData) return null;

  try {
    const result = await callLlmStructured({
      tier: "main",
      messages: [
        {
          role: "system",
          content: `你是一个英语学习顾问。根据学生的学习数据，给出简短、个性化、可行动的建议。
规则：
- 基于数据说话，不编造
- overallAssessment: 一句话概括整体情况
- keyInsight: 指出最值得关注的一个发现
- actionableSuggestion: 给出具体的下一步行动建议
- encouragement: 一句鼓励的话

只输出 JSON。`,
        },
        {
          role: "user",
          content: `学习报告数据（${report.period}）：
- 总词条: ${report.memory.totalItems}
- 本期新学: ${report.memory.newItems}
- 本期复习: ${report.memory.reviewedCount}次
- 即将到期: ${report.memory.dueSoon}
- 复习正确率: ${Math.round(report.review.correctRate * 100)}%
- 独立正确: ${report.review.correctIndependent}, 提示正确: ${report.review.correctWithHint}, 未通过: ${report.review.incorrect}
- 口语观察: ${report.speakingObservations.map((o) => `${o.dimension}(${o.occurrenceCount}次${o.isPattern ? ",重复" : ""})`).join(", ") || "暂无"}
- 推荐任务: ${report.recommendations.map((r) => `[${r.priority}]${r.reason}`).join("; ")}

请生成个性化建议。`,
        },
      ],
      schema: SummarySchema,
      schemaName: "ReportSummary",
      jsonExample: JSON_EXAMPLE,
      traceId,
      temperature: 0.5,
    });

    return result.data;
  } catch (err) {
    logger.warn("llm.report_summary.failed", {
      trace_id: traceId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}
