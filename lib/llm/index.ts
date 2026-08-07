/**
 * LLM 层公开 API
 * ------------------------------------------------------------
 * 业务代码只应从本文件 import。
 * 禁止在 app/ 或 lib/agent/ 中直接 import "openai" 或 lib/llm/providers/*.
 */
import "server-only";

export type {
  LlmMessage,
  LlmChatRequest,
  LlmChatResponse,
  LlmStructuredRequest,
  LlmStructuredResponse,
  ModelTier,
  ProviderKind,
} from "@/lib/llm/types";

export type { LlmProvider } from "@/lib/llm/provider";

export { LlmError, shouldFallback, classifyProviderError } from "@/lib/llm/errors";

export { callLlmStructured } from "@/lib/llm/structured-output";

export {
  resolveProviders,
  getProvider,
  __setProviderForTests,
  __resetRegistryForTests,
} from "@/lib/llm/provider-registry";
