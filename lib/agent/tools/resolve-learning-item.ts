/**
 * 工具：标准化并查重单词 / 短语 / 语块
 * ------------------------------------------------------------
 * 交接单 §6.3
 *   输入: raw_text, context
 *   输出: item 或候选项
 *   写库权限: 无
 *
 * P0 阶段：仅返回类型化占位。真实解析将在 P1 引入。
 */
import { z } from "zod";

export const ResolveLearningItemInputSchema = z.object({
  raw_text: z.string().min(1),
  context: z.string().optional(),
});
export type ResolveLearningItemInput = z.infer<typeof ResolveLearningItemInputSchema>;

export const LearningItemCandidateSchema = z.object({
  itemId: z.string().nullable(), // null = 尚未入库，需二次确认后创建
  itemType: z.enum(["WORD", "PHRASE", "CHUNK"]),
  canonicalForm: z.string(),
  reason: z.string().optional(),
});
export type LearningItemCandidate = z.infer<typeof LearningItemCandidateSchema>;

export const ResolveLearningItemResultSchema = z.object({
  candidates: z.array(LearningItemCandidateSchema).min(1),
});
export type ResolveLearningItemResult = z.infer<typeof ResolveLearningItemResultSchema>;

export async function resolveLearningItem(
  _input: ResolveLearningItemInput,
): Promise<ResolveLearningItemResult> {
  // P0 占位：返回一个空候选
  return {
    candidates: [
      {
        itemId: null,
        itemType: "PHRASE",
        canonicalForm: _input.raw_text.trim(),
        reason: "P0_PLACEHOLDER",
      },
    ],
  };
}
