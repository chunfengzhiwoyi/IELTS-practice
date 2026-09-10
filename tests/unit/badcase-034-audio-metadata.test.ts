/**
 * BC-034（ELS-EVAL-034）— audio_metadata 错误路径 Trace 摘要
 * ------------------------------------------------------------
 * Frozen Gold Required Trace Fields: trace_id, audio_metadata, llm_error_code, http_status, ui_fallback_offered
 * Uncovered（M3-P3 special-tool）: 错误日志/trace 缺 audio_metadata 摘要。
 *
 * 覆盖（任务书 §7）：
 *   1. audio metadata 落 trace（request.received.audio_metadata）
 *   2. size/content-type 等字段值正确
 *   3. audio bytes 不落 trace
 *   4. base64 不落 trace
 *   5. missing STT config 路径（503）仍有 metadata（关键路径）
 *   6. 正常路径 metadata 存在
 *   7. Trace payload 满足 4KB/redaction Contract
 *   + 上游 5xx（502）路径 metadata 存在
 *   + empty audio（size=0）→ empty_audio_flag=true
 *   + llm_error_code / http_status / ui_fallback_offered（Gold Required Trace Fields）存在
 */
process.env.DATA_PROVIDER = "memory";
process.env.AUTH_MODE = "demo";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.WHISPER_BASE_URL;

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST, buildAudioMetadataSummary } from "@/app/api/speaking/transcribe/route";
import { traceStore } from "@/lib/observability/trace-store";
import { setTraceEnabled } from "@/lib/observability/trace-context";
import type { TraceEvent } from "@/lib/observability/trace-contract";

// 唯一标记：必须绝不进入任何 trace payload（直接内容或其 base64）
const AUDIO_MARKER = "SECRET_AUDIO_BYTES_034";
const AUDIO_MARKER_B64 = Buffer.from(AUDIO_MARKER, "utf8").toString("base64");

const WHISPER_OK_BODY = JSON.stringify({
  text: "I like reading books every day.",
  duration: 2.4,
  words: [
    { word: "I", start: 0, end: 0.2 },
    { word: "like", start: 0.25, end: 0.6 },
    { word: "reading", start: 0.65, end: 1.1 },
    { word: "books", start: 1.15, end: 1.6 },
    { word: "every", start: 1.65, end: 2.0 },
    { word: "day", start: 2.05, end: 2.4 },
  ],
});

interface AudioInput {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

function makeFormRequest(traceId: string, audio: AudioInput): Request {
  const formData = new FormData();
  formData.append("audio", new File([audio.bytes], audio.name, { type: audio.type }));
  return new Request("http://localhost/api/speaking/transcribe", {
    method: "POST",
    headers: { "x-trace-id": traceId },
    body: formData,
  });
}

function traceOf(tid: string) {
  return traceStore.getTrace(tid);
}

function payloadOf<T>(e: TraceEvent): T {
  return e.payload as T;
}

function eventsOfType(events: TraceEvent[] | undefined, type: string): TraceEvent[] {
  return (events ?? []).filter((e) => e.event_type === type);
}

function allPayloadJson(tid: string): string[] {
  const t = traceOf(tid);
  if (!t) return [];
  return t.events.map((e) => JSON.stringify(e.payload));
}

const DEFAULT_AUDIO: AudioInput = {
  name: "recording.webm",
  type: "audio/webm",
  bytes: new TextEncoder().encode(`${AUDIO_MARKER}\u0000\u0001binary-payload`).buffer,
};

describe("BC-034 audio_metadata trace", () => {
  beforeEach(() => {
    traceStore.reset();
    setTraceEnabled(true);
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.WHISPER_BASE_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1+2+6. 正常路径：metadata 落 trace，size/content-type/has_filename/extension 字段正确", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(WHISPER_OK_BODY, { status: 200, headers: { "content-type": "application/json" } })));
    process.env.OPENAI_API_KEY = "sk-test-034";
    const tid = "trc_034_normal";
    const res = await POST(makeFormRequest(tid, DEFAULT_AUDIO));
    expect(res.status).toBe(200);
    const t = traceOf(tid)!;
    const received = payloadOf<{ audio_metadata: Record<string, unknown> }>(eventsOfType(t.events, "request.received")[0]!);
    expect(received.audio_metadata).toBeDefined();
    expect(received.audio_metadata!.content_type).toBe("audio/webm");
    expect(received.audio_metadata!.size_bytes).toBe(DEFAULT_AUDIO.bytes.byteLength);
    expect(received.audio_metadata!.has_filename).toBe(true);
    expect(received.audio_metadata!.extension).toBe("webm");
    expect(received.audio_metadata!.empty_audio_flag).toBe(false);
    // Gold Required Trace Fields 其余项
    expect(t.header.trace_id).toBe(tid);
    expect(t.header.http_status).toBe(200);
    // llm.attempt（whisper）存在
    const attempt = eventsOfType(t.events, "llm.attempt")[0]!;
    expect(attempt.payload).toHaveProperty("provider", "whisper");
    expect(t.header.event_count).toBe(t.events.length);
  });

  it("3+4. 隐私：audio bytes 与 base64 绝不进入任何 trace payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(WHISPER_OK_BODY, { status: 200, headers: { "content-type": "application/json" } })));
    process.env.OPENAI_API_KEY = "sk-test-034";
    const tid = "trc_034_privacy";
    const res = await POST(makeFormRequest(tid, DEFAULT_AUDIO));
    expect(res.status).toBe(200);
    const jsons = allPayloadJson(tid);
    expect(jsons.length).toBeGreaterThan(0);
    for (const json of jsons) {
      expect(json).not.toContain(AUDIO_MARKER);
      expect(json).not.toContain(AUDIO_MARKER_B64);
      expect(json).not.toMatch(/data:(audio|application\/octet-stream);base64/);
    }
  });

  it("5. 关键路径：missing STT config → 503 CONFIG_ERROR，audio_metadata 仍可见", async () => {
    const tid = "trc_034_nokey";
    const res = await POST(makeFormRequest(tid, DEFAULT_AUDIO));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe("CONFIG_ERROR");
    const t = traceOf(tid)!;
    const received = payloadOf<{ audio_metadata: Record<string, unknown> }>(eventsOfType(t.events, "request.received")[0]!);
    expect(received.audio_metadata).toBeDefined();
    expect(received.audio_metadata!.size_bytes).toBe(DEFAULT_AUDIO.bytes.byteLength);
    expect(received.audio_metadata!.content_type).toBe("audio/webm");
    // Gold Required Trace Fields：llm_error_code / http_status / ui_fallback_offered
    const attempt = eventsOfType(t.events, "llm.attempt")[0]!;
    expect(attempt.payload).toHaveProperty("llm_error_code", "CONFIG_ERROR");
    const sent = payloadOf<{ http_status: number; app_error_code: string; ui_fallback_offered: boolean }>(eventsOfType(t.events, "response.sent")[0]!);
    expect(sent.http_status).toBe(503);
    expect(sent.app_error_code).toBe("CONFIG_ERROR");
    expect(sent.ui_fallback_offered).toBe(true);
    expect(t.header.http_status).toBe(503);
    expect(t.header.app_error_code).toBe("CONFIG_ERROR");
  });

  it("上游 5xx → 502 MODEL_ERROR，metadata 仍可见，错误响应结构化", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream boom", { status: 500 })));
    process.env.OPENAI_API_KEY = "sk-test-034";
    const tid = "trc_034_up5xx";
    const res = await POST(makeFormRequest(tid, DEFAULT_AUDIO));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe("MODEL_ERROR");
    expect(body).not.toHaveProperty("analysis");
    const t = traceOf(tid)!;
    const received = payloadOf<{ audio_metadata: Record<string, unknown> }>(eventsOfType(t.events, "request.received")[0]!);
    expect(received.audio_metadata).toBeDefined();
    const attempt = eventsOfType(t.events, "llm.attempt")[0]!;
    expect(attempt.payload).toHaveProperty("llm_error_code", "MODEL_ERROR");
  });

  it("empty audio（size=0）→ empty_audio_flag=true；MIME 原样记录（异常 MIME 可排查）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(WHISPER_OK_BODY, { status: 200, headers: { "content-type": "application/json" } })));
    process.env.OPENAI_API_KEY = "sk-test-034";
    const tid = "trc_034_empty";
    const res = await POST(makeFormRequest(tid, { name: "empty.wav", type: "application/octet-stream", bytes: new ArrayBuffer(0) }));
    expect(res.status).toBe(200);
    const t = traceOf(tid)!;
    const received = payloadOf<{ audio_metadata: Record<string, unknown> }>(eventsOfType(t.events, "request.received")[0]!);
    expect(received.audio_metadata!.empty_audio_flag).toBe(true);
    expect(received.audio_metadata!.size_bytes).toBe(0);
    expect(received.audio_metadata!.content_type).toBe("application/octet-stream");
    expect(received.audio_metadata!.extension).toBe("wav");
    expect(received.audio_metadata!.has_filename).toBe(true);
  });

  it("无 filename → has_filename=false，extension 缺省（隐私：不落文件名原文）", () => {
    // node FormData 往返会丢弃空 filename 文件，故直接覆盖 summary helper 边界（浏览器 Blob 录音无 name 的真实场景）
    const f = new File([new ArrayBuffer(1)], "");
    const m = buildAudioMetadataSummary(f);
    expect(m.has_filename).toBe(false);
    expect(m.extension).toBeUndefined();
    expect(m.size_bytes).toBe(1);
  });

  it("7. 所有事件 payload 满足 4KB 上限（序列化后 < 4096）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(WHISPER_OK_BODY, { status: 200, headers: { "content-type": "application/json" } })));
    process.env.OPENAI_API_KEY = "sk-test-034";
    const tid = "trc_034_4kb";
    const res = await POST(makeFormRequest(tid, DEFAULT_AUDIO));
    expect(res.status).toBe(200);
    const t = traceOf(tid)!;
    for (const e of t.events) {
      const size = JSON.stringify(e.payload).length;
      expect(size).toBeLessThan(4096);
      expect(e.payload).not.toHaveProperty("audio_bytes");
      expect(e.payload).not.toHaveProperty("audio_base64");
      expect(e.payload).not.toHaveProperty("authorization");
    }
  });

  it("400 路径（缺 audio 文件）：结构化错误，无 metadata（无文件可描述），不崩溃", async () => {
    const tid = "trc_034_noaudio";
    const formData = new FormData();
    formData.append("other", "x");
    const res = await POST(new Request("http://localhost/api/speaking/transcribe", {
      method: "POST",
      headers: { "x-trace-id": tid },
      body: formData,
    }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe("INVALID_INPUT");
    const t = traceOf(tid)!;
    const received = payloadOf<{ audio_metadata?: unknown }>(eventsOfType(t.events, "request.received")[0]!);
    expect(received.audio_metadata).toBeUndefined();
    expect(t.header.app_error_code).toBe("INVALID_INPUT");
  });
});
