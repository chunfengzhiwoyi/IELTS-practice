/**
 * Anthropic Claude 原生 Provider
 * ------------------------------------------------------------
 * 不走 OpenAI SDK，直接用 fetch 调 /v1/messages：
 *   - Header：x-api-key + anthropic-version: 2023-06-01
 *   - system 是顶层字段，不进 messages
 *   - 无 response_format；jsonMode 依赖业务层提示词 + structured-output 修复重试保证 JSON
 * 其余差异（消息格式、usage 字段）在内部消化，对外仍是统一的 LlmProvider.chat()。
 */
import { classifyProviderError, LlmError } from "@/lib/llm/errors";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { logger } from "@/lib/observability/logger";

export interface AnthropicProviderConfig {
  apiKey: string;
  /** 形如 https://api.anthropic.com/v1 */
  baseUrl: string;
  modelName: string;
}

export function createAnthropicProvider(cfg: AnthropicProviderConfig): LlmProvider {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const endpoint = `${base}/messages`;

  return {
    kind: "user",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const systemParts = req.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content);
      const convo = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));

      const body: Record<string, unknown> = {
        model: cfg.modelName,
        max_tokens: req.maxTokens ?? 1024,
        messages: convo,
        temperature: req.temperature ?? 0.7,
      };
      if (systemParts.length) body.system = systemParts.join("\n\n");

      logger.debug("llm.anthropic.request", {
        trace_id: req.traceId,
        model: cfg.modelName,
        base_url: base,
        json_mode: req.jsonMode === true,
      });

      try {
        const timeoutSignal = AbortSignal.timeout(30_000);
        const combinedSignal = req.signal
          ? AbortSignal.any([req.signal, timeoutSignal])
          : timeoutSignal;
        const resp = await fetch(endpoint, {
          method: "POST",
          signal: combinedSignal,
          headers: {
            "content-type": "application/json",
            "x-api-key": cfg.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw classifyProviderError(
            { status: resp.status, message: text || resp.statusText, name: "HttpError" },
            { provider: "user", model: cfg.modelName },
            req.traceId,
          );
        }

        const data = (await resp.json()) as {
          content?: Array<{ type?: string; text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const content =
          data.content?.map((c) => c.text ?? "").join("") ?? "";

        return {
          content,
          model: cfg.modelName,
          usage: {
            input_tokens: data.usage?.input_tokens,
            output_tokens: data.usage?.output_tokens,
          },
        };
      } catch (err) {
        if (err instanceof LlmError) throw err;
        throw classifyProviderError(err, { provider: "user", model: cfg.modelName }, req.traceId);
      }
    },
  };
}
