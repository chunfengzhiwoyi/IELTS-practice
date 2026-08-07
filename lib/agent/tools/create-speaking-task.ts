/**
 * 工具：生成 Part 1/2/3 文字口语任务
 * ------------------------------------------------------------
 * 交接单 §6.3。P0 占位；P3 接入真实题库与领域服务。
 */
import { z } from "zod";

export const CreateSpeakingTaskInputSchema = z.object({
  part: z.enum(["P1", "P2", "P3"]),
  topic: z.string().optional(),
  user_state: z
    .object({
      recent_topics: z.array(z.string()).default([]),
    })
    .optional(),
});
export type CreateSpeakingTaskInput = z.infer<typeof CreateSpeakingTaskInputSchema>;

export const SpeakingTaskSchema = z.object({
  taskId: z.string(),
  part: z.enum(["P1", "P2", "P3"]),
  topic: z.string(),
  question: z.string(),
  followUps: z.array(z.string()).default([]),
});
export type SpeakingTask = z.infer<typeof SpeakingTaskSchema>;

export async function createSpeakingTask(
  _input: CreateSpeakingTaskInput,
): Promise<SpeakingTask> {
  return {
    taskId: "placeholder",
    part: _input.part,
    topic: _input.topic ?? "PLACEHOLDER_TOPIC",
    question: "（占位）P3 将生成真实题目",
    followUps: [],
  };
}
