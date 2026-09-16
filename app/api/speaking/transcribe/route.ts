/**
 * POST /api/speaking/transcribe
 * -------------------------------------------------------
 * 接收音频 blob → 调 STT Provider（DashScope/Qwen ASR PRIMARY，OpenAI Whisper FALLBACK）
 * → 返回 transcript + audioMetadata
 *
 * 输入：multipart/form-data，field "audio" 为音频文件
 * 输出：TranscribeResponse { transcript, duration, audioMetadata }
 *
 * Provider 契约（MOBILE-04D-FIX）：
 *   - STT_PROVIDER=dashscope → DashScope ASR（qwen-audio-3.0-asr-flash）
 *     m4a → Base64 Data URI 直发 provider（不上传 Supabase Storage、不落盘、不写日志）
 *   - STT_PROVIDER=openai / 未设置 → OpenAI Whisper（whisper-1，verbose_json + word timestamps）
 *   - DEEPSEEK_API_KEY 永远不作为 STT credential
 *   - 缺配置 → 503 CONFIG_ERROR（结构化，只报缺失键名）
 *   - word timestamps 为 optional（DashScope 同步 ASR 不返回 → []，消费端不依赖）
 *
 * M2（M2-P3B 补全）：接入 Trace（Contract §1.3 transcribe 行）
 *   - request.received + llm.attempt(provider 动态, prompt 字段 null, §1.6 特例)
 *   - response.sent 错误路径带 ui_fallback_offered（Case 034 前端文字回退）
 *   - 隐私：绝不记录音频字节，只记 metadata 指标（duration/wpm/pause）
 *
 * BC-034（ELS-EVAL-034 Required Trace Fields: audio_metadata）：
 *   - request.received 携带结构化 audio_metadata 摘要（content_type / size_bytes /
 *     has_filename / extension / empty_audio_flag）
 *   - FormData 在 startTrace 前解析：即使 STT config 缺失（503 CONFIG_ERROR）或
 *     上游 5xx（502 MODEL_ERROR），audio_metadata 仍然可见（关键路径）
 *   - 错误日志（logger.error）同样携带 audio_metadata 摘要
 *   - 绝不记录：audio bytes / base64 / 原始音频内容 / Authorization / 完整 filename
 */
import { NextResponse } from "next/server";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { logger } from "@/lib/observability/logger";
import { startTrace, endTraceSuccess } from "@/lib/observability/trace-api-helper";
import { requireUser } from "@/lib/auth/session";
import type { AudioMetadata, PauseInfo, TranscribeResponse } from "@/lib/speaking/audio-types";
import type { RequestReceivedPayload } from "@/lib/observability/trace-contract";
import { resolveSttProvider } from "@/lib/stt/provider";
import { SttProviderError, type SttProvider } from "@/lib/stt/types";

export const runtime = "nodejs";

// STT provider 支持的最大文件大小：25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** 结构化音频元数据摘要（BC-034；不落音频字节/文件名原文）。导出供单测覆盖边界（如空 filename）。 */
export function buildAudioMetadataSummary(file: File): NonNullable<RequestReceivedPayload["audio_metadata"]> {
  const name = file.name ?? "";
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : undefined;
  return {
    content_type: file.type || undefined,
    size_bytes: file.size,
    has_filename: name.length > 0,
    extension,
    empty_audio_flag: file.size === 0,
  };
}

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const started = Date.now();

  // ---- BC-034: 先解析 FormData，构造 audio_metadata 摘要（错误路径也可见）----
  let audioFile: File | null = null;
  let formParseError: string | null = null;
  try {
    const formData = await request.formData();
    const candidate = formData.get("audio");
    if (candidate instanceof File) {
      audioFile = candidate;
    }
  } catch (err) {
    formParseError = err instanceof Error ? err.message : "formData parse failed";
  }

  const audioMetadataSummary = audioFile ? buildAudioMetadataSummary(audioFile) : undefined;
  const inputSummary = audioFile
    ? `audio upload: ${audioFile.type || "unknown-mime"} ${audioFile.size}B`
    : `speaking transcribe (no audio file${formParseError ? `; formData error: ${formParseError.slice(0, 80)}` : ""})`;

  const tctx = startTrace(traceId, "/api/speaking/transcribe", {
    input_summary: inputSummary,
    method: "POST",
    ...(audioMetadataSummary ? { audio_metadata: audioMetadataSummary } : {}),
  });

  // 当前 provider 信息（解析后填充；Trace llm.attempt 动态使用）
  let activeProvider: SttProvider | null = null;

  // 失败路径统一出口：错误响应 + ui_fallback_offered（前端可回退文字输入）
  function fail(httpStatus: number, kind: string, message: string, llmErrorCode: string | null = null) {
    if (llmErrorCode) {
      tctx.trace.emitLlmAttempt(
        {
          attempt_purpose: "primary",
          provider: activeProvider?.traceProvider ?? "whisper",
          model_name: activeProvider?.model ?? "whisper-1",
          tier: "fast",
          prompt_key: null, // §1.6 whisper 特例：prompt 字段允许 null
          prompt_version: null,
          token_usage: {},
          latency_ms: Date.now() - started,
          raw_output: message.slice(0, 256),
          raw_output_truncated: message.length > 256,
          llm_error_code: llmErrorCode,
        },
        "error",
      );
    }
    tctx.trace.emitResponseSent({
      http_status: httpStatus,
      app_error_code: kind,
      output_summary: message.slice(0, 500),
      fallback_used_flag: false,
      ui_fallback_offered: true, // Case 034: 前端文字回退可用
    });
    tctx.trace.finalize(httpStatus, kind);
    // BC-034: 错误日志含 trace_id 与 audio_metadata 摘要
    logger.error("speaking.transcribe.failed", {
      trace_id: traceId,
      http_status: httpStatus,
      kind,
      error: message.slice(0, 500),
      ...(audioMetadataSummary ? { audio_metadata: audioMetadataSummary } : {}),
    });
    return NextResponse.json(
      { error: { kind, message } },
      { status: httpStatus, headers: { "x-trace-id": traceId } },
    );
  }

  try {
    // 0. 鉴权（MOBILE-04C：transcribe 与其它 Speaking 路由一致，必须 authenticated）
    //    FormData 解析已在 startTrace 前完成，audio_metadata 摘要始终可见。
    const authUser = await requireUser(traceId).catch(() => null);
    if (!authUser) {
      return fail(401, "AUTH_REQUIRED", "请先登录", null);
    }

    // 1. 校验 audio 文件（FormData 解析已在 startTrace 前完成）
    if (!audioFile) {
      return fail(400, "INVALID_INPUT", formParseError ? `表单解析失败: ${formParseError}` : "缺少 audio 文件");
    }

    if (audioFile.size > MAX_FILE_SIZE) {
      return fail(400, "INVALID_INPUT", "音频文件超过 25MB 限制");
    }

    // 2. 解析 STT provider 配置（MOBILE-04D-FIX）
    //    STT_PROVIDER=dashscope → DASHSCOPE_API_KEY/BASE_URL/ASR_MODEL
    //    否则 → WHISPER_API_KEY ?? OPENAI_API_KEY（禁止 DEEPSEEK）
    const config = resolveSttProvider(process.env);
    if (!config.ok) {
      return fail(503, "CONFIG_ERROR", config.message, "CONFIG_ERROR");
    }
    activeProvider = config.provider;

    // 3. 调用 provider（音频字节只进内存 → Base64 Data URI / multipart，不落盘、不写日志）
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const result = await activeProvider.transcribe(
      {
        buffer: audioBuffer,
        mimeType: audioFile.type || "audio/mp4",
        filename: audioFile.name || "recording.m4a",
      },
      traceId,
    );

    // 4. 构造 audioMetadata（word timestamps optional：provider 不返回时 pauses 为空）
    const transcript = result.transcript;
    const duration = result.duration;
    const wordTimestamps = result.wordTimestamps;
    const pauses = computePauses(wordTimestamps, duration);
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    const speakingTime = Math.max(0, duration - pauses.totalPauseDuration);
    const wpm = speakingTime > 0 ? Math.round((wordCount / speakingTime) * 60) : 0;

    const audioMetadata: AudioMetadata = {
      duration,
      speakingTime,
      wpm,
      pauses,
      wordTimestamps: wordTimestamps.length > 0 ? wordTimestamps : undefined,
    };

    const response: TranscribeResponse = {
      transcript,
      duration,
      audioMetadata,
    };

    // 5. Trace: llm.attempt（provider 动态；raw 只存 transcript 摘要）
    const transcriptTruncated = transcript.length > 512;
    tctx.trace.emitLlmAttempt({
      attempt_purpose: "primary",
      provider: activeProvider.traceProvider,
      model_name: activeProvider.model,
      tier: "fast",
      prompt_key: null,
      prompt_version: null,
      token_usage: {},
      latency_ms: Date.now() - started,
      raw_output: transcriptTruncated ? `${transcript.slice(0, 256)}...[truncated]...${transcript.slice(-256)}` : transcript,
      raw_output_truncated: transcriptTruncated,
      temperature: undefined,
    });

    logger.info("speaking.transcribe.success", {
      trace_id: traceId,
      provider: activeProvider.name,
      model: activeProvider.model,
      duration,
      wordCount,
      wpm,
      pauseCount: pauses.pauseCount,
      latency_ms: Date.now() - started,
      ...(audioMetadataSummary ? { audio_metadata: audioMetadataSummary } : {}),
    });

    const resp = NextResponse.json(response, {
      status: 200,
      headers: { "x-trace-id": traceId },
    });
    return endTraceSuccess(tctx, resp, `transcript=${transcript.slice(0, 200)}, duration=${duration}, wpm=${wpm}`, false);
  } catch (err) {
    let message: string;
    let httpStatus = 500;
    let kind = "INTERNAL";
    let llmCode: string | null = "MODEL_ERROR";

    if (err instanceof SttProviderError) {
      // provider 上游错误：产品级文案，不泄漏 provider 内部细节/响应原文
      httpStatus = 502;
      kind = "MODEL_ERROR";
      llmCode = "MODEL_ERROR";
      message = `语音识别失败${err.status ? ` (${err.status})` : ""}`;
    } else {
      message = err instanceof Error ? err.message : "transcribe failed";
    }

    logger.error("speaking.transcribe.error", {
      trace_id: traceId,
      http_status: httpStatus,
      kind,
      error: message,
      ...(audioMetadataSummary ? { audio_metadata: audioMetadataSummary } : {}),
    });
    return fail(httpStatus, kind, message, llmCode);
  }
}

// =============================================================
// Helpers
// =============================================================

/** 计算停顿信息（将 >0.8 秒的词间间隔视为停顿）；无词级时间戳时返回空停顿 */
export function computePauses(words: { start: number; end: number }[], totalDuration: number): PauseInfo {
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
