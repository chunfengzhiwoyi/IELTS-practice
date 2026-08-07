/**
 * DeepSeek 官方 API Provider
 * ------------------------------------------------------------
 * base_url: https://api.deepseek.com
 * 只允许 deepseek-v4-flash / deepseek-v4-pro；旧型号已在 env schema 中禁用。
 *
 * DeepSeek 偶尔会返回空 content（如 finish_reason=content_filter 或空回复）。
 * 本 Provider 直接把原始 content 透传（可能为空字符串），
 * 由 structured-output pipeline 检测并触发修复重试。
 *
 * 结构化输出使用 response_format: { type: "json_object" }。
 * 提示词层负责在 messages 中明确"必须返回 JSON"并给出示例。
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

export interface DeepSeekProviderConfig {
  apiKey: string;
  baseUrl: string;
  fastModel: string;
  mainModel: string;
}

export function createDeepSeekProvider(
  cfg: DeepSeekProviderConfig,
  inject?: OpenAICompatClient,
): LlmProvider {
  const client: OpenAICompatClient =
    inject ??
    (new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl,
    }) as unknown as OpenAICompatClient);

  return {
    kind: "deepseek",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const model = resolveModelName("deepseek", req.tier);
      const params: OpenAICompatChatParams = {
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      };

      logger.debug("llm.deepseek.request", {
        trace_id: req.traceId,
        model,
        tier: req.tier,
        json_mode: req.jsonMode === true,
      });

      try {
        // 加 30 秒超时保护，防止无限等待
        const timeoutSignal = AbortSignal.timeout(30_000);
        const combinedSignal = req.signal
          ? AbortSignal.any([req.signal, timeoutSignal])
          : timeoutSignal;
        const resp: OpenAICompatChatResult = await client.chat.completions.create(params, {
          signal: combinedSignal,
        });
        // 保留空 content 让 structured-output pipeline 判定
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
        throw classifyProviderError(err, { provider: "deepseek", model }, req.traceId);
      }
    },
  };
}
