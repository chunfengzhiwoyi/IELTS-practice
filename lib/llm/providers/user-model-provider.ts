/**
 * 用户自带模型 Provider（多协议）
 * ------------------------------------------------------------
 * 用户在前端「模型设置」中填写的 protocol / baseUrl / 模型名 / API Key
 * 经服务端信封加密存于 user_secrets，解密后构建此 Provider。
 *
 * 按 protocol 分发到对应原生适配器：
 *   - openai    ：OpenAI 兼容端点（DeepSeek / 百炼 / SiliconFlow / OpenAI / Ollama 等）
 *   - anthropic ：Claude 原生 Messages API
 *   - gemini    ：Gemini 原生 generateContent API
 *
 * 旧数据缺 protocol 时默认 "openai"，完全向后兼容。
 */
import OpenAI from "openai";

import type { LlmProtocol } from "@/lib/llm/catalog";
import { classifyProviderError } from "@/lib/llm/errors";
import type {
  LlmProvider,
  OpenAICompatClient,
  OpenAICompatChatParams,
  OpenAICompatChatResult,
} from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { createAnthropicProvider } from "@/lib/llm/providers/anthropic-provider";
import { createGeminiProvider } from "@/lib/llm/providers/gemini-provider";
import { logger } from "@/lib/observability/logger";

export interface UserModelProviderConfig {
  apiKey: string;
  baseUrl: string;
  modelName: string;
  protocol?: LlmProtocol;
}

/**
 * 工厂入口：根据 protocol 分发到对应适配器。
 * inject 仅用于 OpenAI 兼容路径的测试注入。
 */
export function createUserModelProvider(
  cfg: UserModelProviderConfig,
  inject?: OpenAICompatClient,
): LlmProvider {
  const protocol = cfg.protocol ?? "openai";

  if (protocol === "anthropic") {
    return createAnthropicProvider({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      modelName: cfg.modelName,
    });
  }
  if (protocol === "gemini") {
    return createGeminiProvider({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      modelName: cfg.modelName,
    });
  }
  // 默认：OpenAI 兼容
  return createOpenAICompatProvider(cfg, inject);
}

/** OpenAI 兼容实现（原有逻辑，未改动行为） */
function createOpenAICompatProvider(
  cfg: UserModelProviderConfig,
  inject?: OpenAICompatClient,
): LlmProvider {
  const client: OpenAICompatClient =
    inject ??
    (new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl,
    }) as unknown as OpenAICompatClient);

  return {
    kind: "user",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const model = cfg.modelName;
      const params: OpenAICompatChatParams = {
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      };

      logger.debug("llm.user.request", {
        trace_id: req.traceId,
        model,
        base_url: cfg.baseUrl,
        json_mode: req.jsonMode === true,
      });

      try {
        const timeoutSignal = AbortSignal.timeout(30_000);
        const combinedSignal = req.signal
          ? AbortSignal.any([req.signal, timeoutSignal])
          : timeoutSignal;
        const resp: OpenAICompatChatResult = await client.chat.completions.create(params, {
          signal: combinedSignal,
        });
        const content = resp.choices?.[0]?.message?.content ?? "";
        return {
          content,
          model,
          usage: {
            input_tokens: resp.usage?.prompt_tokens,
            output_tokens: resp.usage?.completion_tokens,
          },
        };
      } catch (err) {
        throw classifyProviderError(err, { provider: "user", model }, req.traceId);
      }
    },
  };
}
