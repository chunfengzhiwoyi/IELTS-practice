/**
 * 工具：生成结构化词卡与初次任务
 * ------------------------------------------------------------
 * 交接单 §6.3 / §8.2 WordCard 契约
 * P0 阶段：仅返回类型化占位。
 */
import { z } from "zod";

export const CreateWordCardInputSchema = z.object({
  item: z.object({
    canonicalForm: z.string(),
    itemType: z.enum(["WORD", "PHRASE", "CHUNK"]),
  }),
  user_level: z.enum(["A2", "B1", "B2", "C1"]).optional(),
});
export type CreateWordCardInput = z.infer<typeof CreateWordCardInputSchema>;

export const WordCardSchema = z.object({
  itemId: z.string(),
  canonicalForm: z.string(),
  itemType: z.enum(["WORD", "PHRASE", "CHUNK"]),
  pronunciation: z.string().optional(),
  partOfSpeech: z.string().optional(),
  coreMeaningZh: z.string(),
  collocations: z.array(z.string()),
  usageContext: z.string(),
  examples: z.array(z.object({ en: z.string(), zh: z.string().optional() })),
  confusionNote: z.string().optional(),
});
export type WordCard = z.infer<typeof WordCardSchema>;

export const LearningTaskSchema = z.object({
  taskId: z.string(),
  taskType: z.enum(["FILL_IN", "SENTENCE_MAKING", "RECOGNITION_CHOICE"]),
  prompt: z.string(),
});
export type LearningTask = z.infer<typeof LearningTaskSchema>;

export const CreateWordCardResultSchema = z.object({
  word_card: WordCardSchema,
  task: LearningTaskSchema,
});
export type CreateWordCardResult = z.infer<typeof CreateWordCardResultSchema>;

export async function createWordCard(_input: CreateWordCardInput): Promise<CreateWordCardResult> {
  // P0 占位
  return {
    word_card: {
      itemId: "placeholder",
      canonicalForm: _input.item.canonicalForm,
      itemType: _input.item.itemType,
      coreMeaningZh: "（占位）待 P1 生成",
      collocations: [],
      usageContext: "P0_PLACEHOLDER",
      examples: [],
    },
    task: {
      taskId: "placeholder",
      taskType: "SENTENCE_MAKING",
      prompt: "（占位）P1 将生成真实任务",
    },
  };
}
