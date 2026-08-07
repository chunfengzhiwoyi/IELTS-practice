/**
 * 阿里云百炼 Provider（华北 2·北京）
 * ------------------------------------------------------------
 * 走百炼 OpenAI 兼容模式：/compatible-mode/v1
 * 使用 response_format: { type: "json_object" } 做结构化输出。
 *
 * 只在 lib/llm/providers/* 中允许 new OpenAI。
 */
import OpenAI from "openai";

import { classifyProviderError } from "@/lib/llm/errors";
import { resolveModelName } from "@/lib/llm/model-router";
import type {
  LlmProvider,
  OpenAICompatClient,
  OpenAICompatChatParams,
  OpenAICompatChatResult,
} from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { logger } from "@/lib/observability/logger";

export interface BailianProviderConfig {
  apiKey: string;
  baseUrl: string;
  fastModel: string;
  mainModel: string;
}

/**
 * @param cfg    Bailian 配置
 * @param inject （可选）测试用的 OpenAI 兼容客户端注入点。
 *               生产环境不传，由 provider 用 openai SDK 自建。
 */
export function createBailianProvider(
  cfg: BailianProviderConfig,
  inject?: OpenAICompatClient,
): LlmProvider {
  const client: OpenAICompatClient =
    inject ??
    (new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl,
    }) as unknown as OpenAICompatClient);

  return {
    kind: "bailian",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const model = resolveModelName("bailian", req.tier);
      const params: OpenAICompatChatParams = {
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      };

      logger.debug("llm.bailian.request", {
        trace_id: req.traceId,
        model,
        tier: req.tier,
        json_mode: req.jsonMode === true,
      });

      try {
        const resp: OpenAICompatChatResult = await client.chat.completions.create(params, {
          signal: req.signal,
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
        throw classifyProviderError(err, { provider: "bailian", model }, req.traceId);
      }
    },
  };
}
