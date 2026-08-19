"use client";
/**
 * 首页连续会话 Schema（客户端 + 服务端共用类型）
 * 不含 server-only，可在客户端 import
 */

/** UiAction 类型 */
export type UiActionType =
  | "NONE"
  | "SHOW_CHOICES"
  | "START_LEARN"
  | "START_REVIEW"
  | "START_SPEAKING"
  | "VIEW_REPORT";

export interface ChoiceOption {
  label: string;
  message: string;
}

export interface UiAction {
  type: UiActionType;
  options?: ChoiceOption[];
  term?: string;
  itemId?: string;
  mode?: "WARM_UP" | "FULL_EXPRESSION" | "DEEP_DISCUSSION";
  topic?: string;
}

/** Conversation State（前端持久化） */
export interface ConversationState {
  currentIntent?: string;
  currentTarget?: string;
  currentTopic?: string;
  difficulty?: string;
  timeConstraint?: string;
  lastSuggestedAction?: string;
  lastCompletedTask?: string;
}

/** 单条消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  ui_action?: UiAction;
  timestamp: number;
  /** 该 assistant 消息是否为本地兜底回复 */
  fallback?: boolean;
}

/** API 请求 */
export interface ChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  conversation_state?: ConversationState;
}

/** API 响应 */
export interface ChatResponse {
  assistant_text: string;
  ui_action: UiAction;
  conversation_state_patch?: Partial<ConversationState>;
  /** 当真实 LLM 不可用时，服务端返回的本地兜底回复 */
  fallback?: boolean;
}
