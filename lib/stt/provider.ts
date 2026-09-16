/**
 * STT Provider 工厂 — 配置解析与校验
 * -------------------------------------------------------
 * MOBILE-04D-FIX：
 *   STT_PROVIDER=dashscope → DashScope/Qwen ASR（PRIMARY，要求
 *     DASHSCOPE_API_KEY + DASHSCOPE_BASE_URL + DASHSCOPE_ASR_MODEL）
 *   STT_PROVIDER=openai / 未设置 → OpenAI Whisper（FALLBACK，要求
 *     WHISPER_API_KEY ?? OPENAI_API_KEY）
 *   DEEPSEEK_API_KEY 永远不得作为 STT credential。
 * 缺配置 → 结构化 CONFIG_ERROR（不泄漏值，只报缺失键名）。
 */
import { createDashScopeAsrProvider } from "./dashscope";
import { createOpenAiWhisperProvider } from "./openai-whisper";
import type { SttProvider } from "./types";

export type SttConfigResult =
  | { ok: true; provider: SttProvider }
  | { ok: false; kind: "CONFIG_ERROR"; message: string };

export interface SttConfigEnv {
  [key: string]: string | undefined;
  STT_PROVIDER?: string;
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_BASE_URL?: string;
  DASHSCOPE_ASR_MODEL?: string;
  WHISPER_API_KEY?: string;
  OPENAI_API_KEY?: string;
  WHISPER_BASE_URL?: string;
}

const DASHSCOPE_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com";
const DASHSCOPE_DEFAULT_MODEL = "qwen-audio-3.0-asr-flash";

export function resolveSttProvider(env: SttConfigEnv): SttConfigResult {
  const providerName = env.STT_PROVIDER === "dashscope" ? "dashscope" : "openai";

  if (providerName === "dashscope") {
    const missing: string[] = [];
    if (!env.DASHSCOPE_API_KEY) missing.push("DASHSCOPE_API_KEY");
    if (!env.DASHSCOPE_BASE_URL) missing.push("DASHSCOPE_BASE_URL");
    if (!env.DASHSCOPE_ASR_MODEL) missing.push("DASHSCOPE_ASR_MODEL");

    if (missing.length > 0) {
      return {
        ok: false,
        kind: "CONFIG_ERROR",
        message: `未配置 DashScope STT：缺少 ${missing.join(" / ")}`,
      };
    }

    return {
      ok: true,
      provider: createDashScopeAsrProvider({
        apiKey: env.DASHSCOPE_API_KEY!,
        baseUrl: env.DASHSCOPE_BASE_URL ?? DASHSCOPE_DEFAULT_BASE_URL,
        model: env.DASHSCOPE_ASR_MODEL ?? DASHSCOPE_DEFAULT_MODEL,
      }),
    };
  }

  // openai（默认）
  const apiKey = env.WHISPER_API_KEY ?? env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      kind: "CONFIG_ERROR",
      message: "未配置 STT API Key（WHISPER_API_KEY）",
    };
  }

  return {
    ok: true,
    provider: createOpenAiWhisperProvider({
      apiKey,
      baseUrl: env.WHISPER_BASE_URL ?? "https://api.openai.com/v1",
    }),
  };
}
