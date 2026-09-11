/**
 * 客户端协议分发器：按 cfg.protocol 调用户自带模型，统一返回文本。
 * 与 web 端 lib/llm/providers 同构，但跑在小程序/ H5 前端（直连用户模型）。
 * 任一协议失败（网络/鉴权/解析）都返回 null，由调用方回退离线逻辑。
 */
import { request } from "./api";
import type { ModelConfig } from "@ielts/core";

export interface CallUserModelOpts {
  jsonMode?: boolean;
  timeout?: number;
  temperature?: number;
  maxTokens?: number;
}

export async function callUserModel(
  cfg: ModelConfig,
  system: string,
  user: string,
  opts: CallUserModelOpts = {},
): Promise<string | null> {
  const protocol = cfg.protocol ?? "openai";
  const jsonMode = opts.jsonMode ?? true;
  const timeout = opts.timeout ?? 60000;
  const temperature = opts.temperature ?? 0.7;
  const maxTokens = opts.maxTokens ?? 800;
  const base = cfg.baseUrl.replace(/\/$/, "");
  if (!cfg.baseUrl || !cfg.modelName || !cfg.apiKey) return null;

  try {
    if (protocol === "openai") {
      const data = (await request({
        url: base + "/chat/completions",
        method: "POST",
        header: { Authorization: `Bearer ${cfg.apiKey}` },
        data: {
          model: cfg.modelName,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: jsonMode ? { type: "json_object" } : undefined,
        },
        timeout,
      })) as any;
      return data?.choices?.[0]?.message?.content ?? null;
    }

    if (protocol === "anthropic") {
      const data = (await request({
        url: base + "/v1/messages",
        method: "POST",
        header: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        data: {
          model: cfg.modelName,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: "user", content: user }],
        },
        timeout,
      })) as any;
      return data?.content?.[0]?.text ?? null;
    }

    // gemini 原生
    const url =
      base.replace(/\/models$/, "") +
      `/models/${encodeURIComponent(cfg.modelName)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const data = (await request({
      url,
      method: "POST",
      data: {
        contents: [{ role: "user", parts: [{ text: user }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          responseMimeType: jsonMode ? "application/json" : "text/plain",
        },
      },
      timeout,
    })) as any;
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}
