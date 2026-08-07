/**
 * LlmProvider 接口
 * ------------------------------------------------------------
 * 所有 Provider 实现本接口。业务层只面向此接口编程。
 */
import type { LlmChatRequest, LlmChatResponse, ProviderKind } from "@/lib/llm/types";

export interface LlmProvider {
  readonly kind: ProviderKind;
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
}

/**
 * OpenAI SDK 兼容的最小 chat completions 客户端形状。
 * Bailian / DeepSeek Provider 用这个而不是完整 OpenAI 类型，方便测试注入。
 */
export interface OpenAICompatClient {
  chat: {
    completions: {
      create(
        params: OpenAICompatChatParams,
        options?: { signal?: AbortSignal },
      ): Promise<OpenAICompatChatResult>;
    };
  };
}

export interface OpenAICompatChatParams {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  response_format?: { type: "json_object" | "text" };
  temperature?: number;
  max_tokens?: number;
}

export interface OpenAICompatChatResult {
  choices: Array<{
    message?: { content?: string | null } | null;
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
