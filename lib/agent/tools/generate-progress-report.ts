/**
 * 工具：汇总真实数据并生成报告结构
 * ------------------------------------------------------------
 * 交接单 §6.3。写库权限：只读。
 * P0 占位；P4 接入 lib/domain/report-service.ts
 */
import { z } from "zod";

export const GenerateProgressReportInputSchema = z.object({
  user_id: z.string().uuid(),
  period: z.enum(["7d", "30d"]).default("7d"),
});
export type GenerateProgressReportInput = z.infer<typeof GenerateProgressReportInputSchema>;

export const ProgressReportSchema = z.object({
  period: z.enum(["7d", "30d"]),
  memory: z.object({
    newItems: z.number().int().min(0),
    reviewed: z.number().int().min(0),
    dueSoon: z.number().int().min(0),
  }),
  speakingObservations: z.array(
    z.object({
      dimension: z.string(),
      status: z.enum(["SINGLE_OBSERVATION", "REPEATED_PATTERN", "IMPROVING", "DISPUTED"]),
      evidence: z.array(z.string()),
    }),
  ),
  nextTasks: z.array(
    z.object({
      taskType: z.string(),
      reason: z.string(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
    }),
  ),
});
export type ProgressReport = z.infer<typeof ProgressReportSchema>;

export async function generateProgressReport(
  _input: GenerateProgressReportInput,
): Promise<ProgressReport> {
  return {
    period: _input.period,
    memory: { newItems: 0, reviewed: 0, dueSoon: 0 },
    speakingObservations: [],
    nextTasks: [],
  };
}
