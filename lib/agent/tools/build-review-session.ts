/**
 * 工具：读取到期内容并生成复习会话
 * ------------------------------------------------------------
 * 交接单 §6.3
 *   输入: user_id, minutes
 *   输出: review_session
 *   写库权限: 只读
 *
 * P0 阶段占位。P2 将接入 lib/domain/review-scheduler.ts
 */
import { z } from "zod";

export const BuildReviewSessionInputSchema = z.object({
  user_id: z.string().uuid(),
  minutes: z.number().int().min(1).max(60).default(5),
});
export type BuildReviewSessionInput = z.infer<typeof BuildReviewSessionInputSchema>;

export const ReviewSessionSchema = z.object({
  sessionId: z.string(),
  dueCount: z.number().int().min(0),
  items: z.array(
    z.object({
      itemId: z.string(),
      canonicalForm: z.string(),
      recallLevel: z.number().int().min(0).max(2),
    }),
  ),
});
export type ReviewSession = z.infer<typeof ReviewSessionSchema>;

export async function buildReviewSession(
  _input: BuildReviewSessionInput,
): Promise<ReviewSession> {
  return {
    sessionId: "placeholder",
    dueCount: 0,
    items: [],
  };
}
