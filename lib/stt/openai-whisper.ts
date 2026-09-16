/**
 * OpenAI Whisper STT Provider（FALLBACK）
 * -------------------------------------------------------
 * 保留既有 Whisper 行为（MOBILE-04C 契约）：
 *  - endpoint: {base}/audio/transcriptions
 *  - model: whisper-1
 *  - response_format: verbose_json + timestamp_granularities[]=word
 *  - word-level timestamps → AudioMetadata
 * STT key 契约：WHISPER_API_KEY ?? OPENAI_API_KEY
 * 禁止 DEEPSEEK_API_KEY 充当 Whisper credential（DeepSeek chat key 不是 Whisper key）。
 */
import type { SttAudioInput, SttProvider, SttTranscriptResult, WordTimestamp } from "./types";
import { SttProviderError } from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export interface OpenAiWhisperConfig {
  apiKey: string;
  baseUrl: string;
  /** 测试注入点（生产不传，使用全局 fetch） */
  fetchImpl?: typeof fetch;
}

interface WhisperVerboseResponse {
  text?: string;
  duration?: number;
  words?: Array<{ word: string; start: number; end: number }>;
}

export function createOpenAiWhisperProvider(cfg: OpenAiWhisperConfig): SttProvider {
  const baseUrl = (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = cfg.fetchImpl ?? fetch;

  return {
    name: "openai",
    traceProvider: "whisper", // 历史 trace 契约标签（badcase-034 冻结）
    model: "whisper-1",
    async transcribe(input: SttAudioInput, traceId: string): Promise<SttTranscriptResult> {
      const form = new FormData();
      form.append("file", new Blob([Uint8Array.from(input.buffer)]), input.filename || "recording.webm");
      form.append("model", "whisper-1");
      form.append("language", "en");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");

      const res = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        body: form,
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "whisper request failed";
        throw new SttProviderError("UPSTREAM", msg, 0);
      });

      if (!res.ok) {
        // 不记录响应原文中的潜在敏感内容；只按状态分类
        let kind: SttProviderError["kind"] = "UPSTREAM";
        if (res.status === 401 || res.status === 403) kind = "AUTH";
        else if (res.status === 429) kind = "RATE_LIMITED";
        throw new SttProviderError(kind, `whisper http ${res.status}`, res.status);
      }

      let data: WhisperVerboseResponse;
      try {
        data = (await res.json()) as WhisperVerboseResponse;
      } catch {
        throw new SttProviderError("INVALID_RESPONSE", "whisper invalid json");
      }

      const transcript = (data.text ?? "").trim();
      if (!transcript) {
        throw new SttProviderError("INVALID_RESPONSE", "whisper empty transcript");
      }

      return {
        transcript,
        duration: data.duration ?? 0,
        wordTimestamps: extractWordTimestamps(data),
        provider: "openai",
        model: "whisper-1",
      };
    },
  };
}

function extractWordTimestamps(data: WhisperVerboseResponse): WordTimestamp[] {
  if (data.words && data.words.length > 0) {
    return data.words.map((w) => ({ word: w.word.trim(), start: w.start, end: w.end }));
  }
  return [];
}
