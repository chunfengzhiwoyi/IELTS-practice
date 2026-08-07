/**
 * Agent 输入 / 输出契约
 * ------------------------------------------------------------
 * 严格对齐交接单 §6.2：
 *   type AgentResponse = {
 *     intent: "NEW_ITEM" | "REVIEW" | "SPEAKING" | "REPORT" | "UNSUPPORTED";
 *     reply: string;
 *     ui_action: {
 *       type: "SHOW_WORD_CARD" | "OPEN_REVIEW" | "OPEN_SPEAKING"
 *           | "SHOW_REPORT" | "SHOW_MESSAGE";
 *       payload: Record<string, unknown>;
 *     };
 *     persistence_required: boolean;
 *     trace_id: string;
 *   }
 *
 * 使用 Zod 做单一事实来源，避免 TS 类型与运行时校验脱节。
 */
import { z } from "zod";

/** 四类顶层意图 + UNSUPPORTED 兜底 */
export const IntentSchema = z.enum([
  "NEW_ITEM",
  "REVIEW",
  "SPEAKING",
  "REPORT",
  "UNSUPPORTED",
]);
export type Intent = z.infer<typeof IntentSchema>;

/** UI 动作类型 —— 与交接单 §4.1 保持一致 */
export const UiActionTypeSchema = z.enum([
  "SHOW_WORD_CARD",
  "OPEN_REVIEW",
  "OPEN_SPEAKING",
  "SHOW_REPORT",
  "SHOW_MESSAGE",
]);
export type UiActionType = z.infer<typeof UiActionTypeSchema>;

export const UiActionSchema = z.object({
  type: UiActionTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});
export type UiAction = z.infer<typeof UiActionSchema>;

export const AgentResponseSchema = z.object({
  intent: IntentSchema,
  reply: z.string().min(1),
  ui_action: UiActionSchema,
  persistence_required: z.boolean(),
  trace_id: z.string().min(1),
});
export type AgentResponse = z.infer<typeof AgentResponseSchema>;

/** Agent 入口请求体 */
export const AgentMessageRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  /** 前端可选携带；后端会覆盖或生成 */
  client_trace_id: z.string().optional(),
});
export type AgentMessageRequest = z.infer<typeof AgentMessageRequestSchema>;
