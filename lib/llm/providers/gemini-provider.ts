/**
 * Google Gemini 原生 Provider
 * ------------------------------------------------------------
 * 不走 OpenAI SDK，直接 POST {baseUrl}/models/{model}:generateContent?key=API_KEY：
 *   - system 进 systemInstruction
 *   - 角色映射 user→user / assistant→model
 *   - jsonMode 用 generationConfig.responseMimeType = "application/json"（原生支持，最稳）
 * 其余差异在内部消化，对外仍是统一的 LlmProvider.chat()。
 */
import { classifyProviderError, LlmError } from "@/lib/llm/errors";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { logger } from "@/lib/observability/logger";

export interface GeminiProviderConfig {
  apiKey: string;
  /** 形如 https://generativelanguage.googleapis.com/v1beta */
  baseUrl: string;
  modelName: string;
}

export function createGeminiProvider(cfg: GeminiProviderConfig): LlmProvider {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const endpoint = `${base}/models/${encodeURIComponent(cfg.modelName)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  return {
    kind: "user",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const systemParts = req.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content);
      const contents = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const generationConfig: Record<string, unknown> = {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 1024,
      };
      if (req.jsonMode) generationConfig.responseMimeType = "application/json";

      const body: Record<string, unknown> = { contents, generationConfig };
      if (systemParts.length) {
        body.systemInstruction = { parts: [{ text: systemParts.join("\n\n") }] };
      }

      logger.debug("llm.gemini.request", {
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
          headers: { "content-type": "application/json" },
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
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        const text =
          data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

        return {
          content: text,
          model: cfg.modelName,
          usage: {
            input_tokens: data.usageMetadata?.promptTokenCount,
            output_tokens: data.usageMetadata?.candidatesTokenCount,
          },
        };
      } catch (err) {
        if (err instanceof LlmError) throw err;
        throw classifyProviderError(err, { provider: "user", model: cfg.modelName }, req.traceId);
      }
    },
  };
}
