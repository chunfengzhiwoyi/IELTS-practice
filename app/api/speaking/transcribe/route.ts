/**
 * POST /api/speaking/transcribe
 * -------------------------------------------------------
 * 接收音频 blob → 调 Whisper API → 返回 transcript + audioMetadata
 *
 * 输入：multipart/form-data，field "audio" 为音频文件
 * 输出：TranscribeResponse { transcript, duration, audioMetadata }
 *
 * Whisper 配置：
 *   - model: whisper-1
 *   - response_format: verbose_json（获取 word-level timestamps）
 *   - language: en（强制英文识别）
 */
import { NextResponse } from "next/server";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { logger } from "@/lib/observability/logger";
import type { AudioMetadata, PauseInfo, TranscribeResponse, WordTimestamp } from "@/lib/speaking/audio-types";

export const runtime = "nodejs";

// Whisper API 支持的最大文件大小：25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const started = Date.now();

  try {
    // 1. 解析 FormData
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json(
        { error: { kind: "INVALID_INPUT", message: "缺少 audio 文件" } },
        { status: 400, headers: { "x-trace-id": traceId } },
      );
    }

    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: { kind: "INVALID_INPUT", message: "音频文件超过 25MB 限制" } },
        { status: 400, headers: { "x-trace-id": traceId } },
      );
    }

    // 2. 调用 Whisper API
    const openaiKey = process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY;
    const whisperBaseUrl = process.env.WHISPER_BASE_URL ?? "https://api.openai.com/v1";

    if (!openaiKey) {
      return NextResponse.json(
        { error: { kind: "CONFIG_ERROR", message: "未配置 STT API Key（OPENAI_API_KEY 或 DEEPSEEK_API_KEY）" } },
        { status: 503, headers: { "x-trace-id": traceId } },
      );
    }

    // 构造 Whisper 请求
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, audioFile.name || "recording.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "en");
    whisperForm.append("response_format", "verbose_json");
    whisperForm.append("timestamp_granularities[]", "word");

    const whisperRes = await fetch(`${whisperBaseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const errBody = await whisperRes.text().catch(() => "unknown");
      logger.error("whisper.api.failed", {
        trace_id: traceId,
        status: whisperRes.status,
        body: errBody.slice(0, 200),
      });
      return NextResponse.json(
        { error: { kind: "MODEL_ERROR", message: `语音识别失败 (${whisperRes.status})` } },
        { status: 502, headers: { "x-trace-id": traceId } },
      );
    }

    const whisperData = await whisperRes.json() as WhisperVerboseResponse;

    // 3. 解析 Whisper 响应，构造 audioMetadata
    const transcript = whisperData.text?.trim() ?? "";
    const duration = whisperData.duration ?? 0;
    const wordTimestamps = extractWordTimestamps(whisperData);
    const pauses = computePauses(wordTimestamps, duration);
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    const speakingTime = Math.max(0, duration - pauses.totalPauseDuration);
    const wpm = speakingTime > 0 ? Math.round((wordCount / speakingTime) * 60) : 0;

    const audioMetadata: AudioMetadata = {
      duration,
      speakingTime,
      wpm,
      pauses,
      wordTimestamps,
    };

    const response: TranscribeResponse = {
      transcript,
      duration,
      audioMetadata,
    };

    logger.info("speaking.transcribe.success", {
      trace_id: traceId,
      duration,
      wordCount,
      wpm,
      pauseCount: pauses.pauseCount,
      latency_ms: Date.now() - started,
    });

    return NextResponse.json(response, {
      status: 200,
      headers: { "x-trace-id": traceId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "transcribe failed";
    logger.error("speaking.transcribe.error", { trace_id: traceId, error: message });
    return NextResponse.json(
      { error: { kind: "INTERNAL", message } },
      { status: 500, headers: { "x-trace-id": traceId } },
    );
  }
}

// =============================================================
// Whisper Response Types
// =============================================================

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperVerboseResponse {
  text?: string;
  duration?: number;
  words?: WhisperWord[];
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

// =============================================================
// Helpers
// =============================================================

function extractWordTimestamps(data: WhisperVerboseResponse): WordTimestamp[] {
  if (data.words && data.words.length > 0) {
    return data.words.map((w) => ({
      word: w.word.trim(),
      start: w.start,
      end: w.end,
    }));
  }
  // Fallback: 无词级时间戳
  return [];
}

/** 计算停顿信息（将 >0.8 秒的词间间隔视为停顿） */
function computePauses(words: WordTimestamp[], totalDuration: number): PauseInfo {
  const PAUSE_THRESHOLD = 0.8; // 秒
  const pauses: number[] = [];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i]!.start - words[i - 1]!.end;
    if (gap >= PAUSE_THRESHOLD) {
      pauses.push(gap);
    }
  }

  // 开头静默
  if (words.length > 0 && words[0]!.start >= PAUSE_THRESHOLD) {
    pauses.push(words[0]!.start);
  }

  // 结尾静默
  if (words.length > 0 && totalDuration - words[words.length - 1]!.end >= PAUSE_THRESHOLD) {
    pauses.push(totalDuration - words[words.length - 1]!.end);
  }

  const totalPauseDuration = pauses.reduce((s, p) => s + p, 0);

  return {
    pauseCount: pauses.length,
    totalPauseDuration: Math.round(totalPauseDuration * 10) / 10,
    longestPause: pauses.length > 0 ? Math.round(Math.max(...pauses) * 10) / 10 : 0,
    averagePauseDuration: pauses.length > 0 ? Math.round((totalPauseDuration / pauses.length) * 10) / 10 : 0,
  };
}
