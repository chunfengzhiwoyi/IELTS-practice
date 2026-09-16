/**
 * DashScope / Qwen ASR STT Provider（PRIMARY）
 * -------------------------------------------------------
 * 按阿里云百炼官方 HTTP 契约实现（MOBILE-04D-FIX，非实时语音识别）：
 *  - endpoint: POST {base}/api/v1/services/aigc/multimodal-generation/generation
 *  - model: qwen-audio-3.0-asr-flash（DASHSCOPE_ASR_MODEL，地域须与 key 对应）
 *  - 鉴权: Authorization: Bearer <DASHSCOPE_API_KEY>
 *  - 请求体: input.messages[].content[].input_audio.data = Base64 Data URI
 *    （音频直发 provider：不上传 Supabase Storage、不落盘、不写日志）
 *  - 响应: output.text / output.output.sentence.text（同步 ASR 无 choices 字段）
 *
 * 与 OpenAI Whisper 不是同一 API contract：不使用 /audio/transcriptions。
 * 同步响应不返回 word timestamps / duration：
 *  - wordTimestamps → []（契约 optional，消费端不依赖）
 *  - duration → 由本地 MP4/M4A 容器解析（mvhd）提供真实值；失败为 0（不伪造）
 */
import { parseM4aDurationMs } from "./m4a-duration";
import type { SttAudioInput, SttProvider, SttTranscriptResult } from "./types";
import { SttProviderError } from "./types";

const ASR_PATH = "/api/v1/services/aigc/multimodal-generation/generation";

/** 已知音频扩展名 → format 值（官方同步 ASR 契约的 parameters.format） */
const KNOWN_FORMATS = new Set(["wav", "mp3", "opus", "m4a", "mp4", "aac", "amr", "pcm", "ogg", "flac"]);

export interface DashScopeAsrConfig {
  apiKey: string;
  /** 形如 https://dashscope.aliyuncs.com（或 workspace 专属域名），地域与 key 对应 */
  baseUrl: string;
  model: string;
  /** 测试注入点（生产不传，使用全局 fetch） */
  fetchImpl?: typeof fetch;
}

export function createDashScopeAsrProvider(cfg: DashScopeAsrConfig): SttProvider {
  const baseUrl = (cfg.baseUrl || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
  const model = cfg.model || "qwen-audio-3.0-asr-flash";
  const fetchImpl = cfg.fetchImpl ?? fetch;

  return {
    name: "dashscope",
    traceProvider: "dashscope",
    model,
    async transcribe(input: SttAudioInput, traceId: string): Promise<SttTranscriptResult> {
      const durationMs = parseM4aDurationMs(input.buffer);
      const duration = durationMs > 0 ? durationMs / 1000 : 0;

      const dataUri = `data:${input.mimeType || "audio/mp4"};base64,${input.buffer.toString("base64")}`;
      const ext = extensionOf(input.filename);
      const format = KNOWN_FORMATS.has(ext) ? ext : "m4a";

      const body = {
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [{ type: "input_audio", input_audio: { data: dataUri } }],
            },
          ],
        },
        parameters: { format },
      };

      const res = await fetchImpl(`${baseUrl}${ASR_PATH}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-SSE": "disable",
        },
        body: JSON.stringify(body),
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "dashscope request failed";
        throw new SttProviderError("UPSTREAM", msg, 0);
      });

      if (!res.ok) {
        let kind: SttProviderError["kind"] = "UPSTREAM";
        if (res.status === 401 || res.status === 403) kind = "AUTH";
        else if (res.status === 429) kind = "RATE_LIMITED";
        throw new SttProviderError(kind, `dashscope http ${res.status}`, res.status);
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new SttProviderError("INVALID_RESPONSE", "dashscope invalid json");
      }

      const transcript = extractTranscript(data);
      if (!transcript) {
        throw new SttProviderError("INVALID_RESPONSE", "dashscope empty transcript");
      }

      return {
        transcript,
        duration,
        wordTimestamps: [],
        provider: "dashscope",
        model,
      };
    },
  };
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * 解析同步 ASR 响应中的转写文本。
 * 官方同步契约：output.text（顶层）或 output.output.sentence.text；
 * 兼容 output.output.text 与 choices[].message.content 两种变体，避免响应结构漂移。
 */
function extractTranscript(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const root = data as Record<string, unknown>;
  const output = root.output as Record<string, unknown> | undefined;
  if (!output || typeof output !== "object") return "";

  // 1) output.text（官方同步 ASR 顶层路径）
  if (typeof output.text === "string" && output.text.trim()) return output.text.trim();

  // 2) output.output.sentence.text
  const inner = output.output as Record<string, unknown> | undefined;
  if (inner && typeof inner === "object") {
    if (typeof inner.text === "string" && inner.text.trim()) return inner.text.trim();
    const sentence = inner.sentence as Record<string, unknown> | undefined;
    if (sentence && typeof sentence === "object" && typeof sentence.text === "string" && sentence.text.trim()) {
      return sentence.text.trim();
    }
  }

  // 3) 防御性兼容：标准 multimodal choices 路径（官方文档指明同步 ASR 无该字段，仅为容错）
  const choices = output.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === "string" && message.content.trim()) {
      return message.content.trim();
    }
  }

  return "";
}
