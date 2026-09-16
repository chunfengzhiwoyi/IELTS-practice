/**
 * STT Provider 抽象 — 共享类型
 * -------------------------------------------------------
 * MOBILE-04D-FIX：将 transcribe 的 provider 调用抽象为统一契约，
 * 支持 DashScope/Qwen ASR（PRIMARY）与 OpenAI Whisper（FALLBACK）。
 *
 * 归一化输出契约：
 *  - transcript：必填（非空转写文本）
 *  - duration：秒；provider 不返回时由本地容器解析（m4a/mp4 mvhd）提供；
 *    仍无法解析时为 0（诚实缺失，不伪造）
 *  - wordTimestamps：provider 不支持时返回 []（契约已定义 optional，
 *    消费端不依赖其必定存在）
 */
export type SttProviderName = "dashscope" | "openai";

export interface SttAudioInput {
  /** 音频字节（multipart 收到的原始数据，不落盘） */
  buffer: Buffer;
  /** MIME 类型，如 audio/mp4 */
  mimeType: string;
  /** 原始文件名（仅用于推断格式/扩展名） */
  filename: string;
}

/** 词级时间戳（provider 支持时返回；DashScope 同步 ASR 不返回 → []） */
export interface WordTimestamp {
  word: string;
  start: number; // 秒
  end: number; // 秒
}

export interface SttTranscriptResult {
  transcript: string;
  duration: number;
  wordTimestamps: WordTimestamp[];
  provider: SttProviderName;
  model: string;
}

/** 归一化 provider 错误（路由层统一映射为产品级错误，不泄漏 provider 细节） */
export class SttProviderError extends Error {
  readonly kind: "AUTH" | "RATE_LIMITED" | "UPSTREAM" | "INVALID_RESPONSE" | "CONFIG";
  readonly status?: number;

  constructor(kind: SttProviderError["kind"], message: string, status?: number) {
    super(message);
    this.name = "SttProviderError";
    this.kind = kind;
    this.status = status;
  }
}

export interface SttProvider {
  readonly name: SttProviderName;
  /** Trace/observability 中的 provider 标签（openai 路径保留历史 "whisper" 标签，兼容既有 trace 契约） */
  readonly traceProvider: string;
  readonly model: string;
  transcribe(input: SttAudioInput, traceId: string): Promise<SttTranscriptResult>;
}
