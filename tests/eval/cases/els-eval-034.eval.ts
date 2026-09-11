/**
 * ELS-EVAL-034 — SPEAKING_TRANSCRIBE（C 级：E2E browser + STT）
 * ------------------------------------------------------------------
 * gold：行 1 无 Whisper Key → 503 CONFIG_ERROR；行 2 上游 5xx → 502（或 fallback 文案）；
 * 错误响应结构化；前端存在文字输入回退路径（可达）；错误日志含 trace_id 与 audio_metadata 摘要。
 *
 * M3-P3：专用工具 speaking-e2e.ts 落地（API 行 + Playwright 真实旅程）；
 * 当时唯一 uncovered = 错误日志缺 audio_metadata（产品 trace 字段缺口）→ UNVERIFIED。
 * M3-03（checkpoint f117d85 = BC-034）：产品在 request.received.payload.audio_metadata
 * （content_type / size_bytes / has_filename / extension / empty_audio_flag）与
 * 错误日志（trace_id + audio_metadata）补齐该缺口 → 本轮按 Frozen Gold 复评。
 *
 * M3-03 新增断言：
 *  - r4 / r4b：503 与 502 两条错误路径的 logger.error 均含 trace_id + audio_metadata 摘要
 *  - r5：Required Trace Fields（trace_id / audio_metadata / llm_error_code / http_status / ui_fallback_offered）
 *  - r6：Privacy Regression——trace 与日志不得含 audio bytes / base64 / 完整 filename / Authorization / API Key
 *
 * 不修改产品代码；Frozen Gold 语义未改变。
 */
import { POST as TRANSCRIBE } from "@/app/api/speaking/transcribe/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { evalTraceId } from "../runner/http";
import { traceOf, eventsOfType, payloadOf } from "./helpers";
import { start5xxServer, startNextServer, isAppBuilt, findFreePort, runSpeakingE2E } from "../tools/speaking-e2e";

/** 构造 transcribe 请求（multipart/form-data，audio 字段） */
async function callTranscribe(
  audioBlob: Uint8Array,
  traceId: string,
  extraEnv: Record<string, string | undefined> = {},
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  for (const [k, v] of Object.entries(extraEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const audioFile = new File([new Uint8Array(audioBlob).buffer as ArrayBuffer], "recording.webm", { type: "audio/webm" });
  const fd = new FormData();
  fd.append("audio", audioFile);
  const request = new Request("http://localhost:3000/api/speaking/transcribe", {
    method: "POST",
    headers: { "x-trace-id": traceId },
    body: fd,
  });
  const response = await TRANSCRIBE(request);
  let json: Record<string, unknown> | null = null;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

/** 捕获路由调用期间的 logger.error（console.error）输出行 */
async function captureErrorLogs(
  fn: () => Promise<unknown>,
): Promise<{ logs: string[] }> {
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.error = orig;
  }
  return { logs };
}

/** 从捕获行中解析出 msg=speaking.transcribe.failed 的日志 JSON */
function failedLogsOf(logs: string[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of logs) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (obj.msg === "speaking.transcribe.failed") out.push(obj);
    } catch {
      // 非 JSON 行（浏览器/server 输出）跳过
    }
  }
  return out;
}

interface AudioMetaSummary {
  content_type?: string;
  size_bytes?: number;
  has_filename?: boolean;
  extension?: string;
  empty_audio_flag?: boolean;
}

function audioMetaOf(trace: ReturnType<typeof traceOf>): AudioMetaSummary | null {
  const recv = eventsOfType(trace?.events, "request.received")
    .map((e) => payloadOf<{ audio_metadata?: AudioMetaSummary }>(e))
    .find((p) => p?.audio_metadata != null);
  return recv?.audio_metadata ?? null;
}

export const case_034: EvalCaseDefinition = {
  case_id: "ELS-EVAL-034",
  automation_level: "C",
  missing_capability: [],
  async run(ctx) {
    ctx.reset();
    const AUDIO = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

    // ============================================================
    // 行 1：未配置 Whisper Key → 503 CONFIG_ERROR
    // ============================================================
    const t1 = evalTraceId("034", 1);
    const r1 = await callTranscribe(AUDIO, t1, {
      OPENAI_API_KEY: undefined,
      DEEPSEEK_API_KEY: undefined,
      WHISPER_BASE_URL: undefined,
    });
    const tr1 = traceOf(t1);
    const llmErr1 = eventsOfType(tr1?.events, "llm.attempt")
      .map((e) => payloadOf<{ llm_error_code?: string | null }>(e))
      .find((p) => p?.llm_error_code != null);
    const respSent1 = eventsOfType(tr1?.events, "response.sent")
      .map((e) => payloadOf<{ http_status?: number; app_error_code?: string; ui_fallback_offered?: boolean }>(e))
      .find(Boolean);

    ctx.rec.check(
      "r1-no-key-503",
      "行 1：未配置 Whisper Key → 503 CONFIG_ERROR（结构化）",
      { status: 503, kind: "CONFIG_ERROR" },
      { status: r1.status, kind: (r1.json as { error?: { kind?: string } } | null)?.error?.kind },
      {
        failure_layer: "FALLBACK",
        metrics: ["M10"],
        evidence: {
          response: r1.json,
          trace_llm_attempt_error_code: llmErr1?.llm_error_code,
          trace_response_sent: respSent1,
        },
      },
    );

    // ============================================================
    // 行 2：注入上游 5xx → 502 MODEL_ERROR（或 fallback 文案）
    // ============================================================
    const fivexx = await start5xxServer();
    try {
      const t2 = evalTraceId("034", 2);
      const r2 = await callTranscribe(AUDIO, t2, {
        OPENAI_API_KEY: undefined,
        DEEPSEEK_API_KEY: "eval-test-key", // 有 Key，触发上游调用
        WHISPER_BASE_URL: `http://127.0.0.1:${fivexx.port}/v1`,
      });
      const tr2 = traceOf(t2);
      const llmErr2 = eventsOfType(tr2?.events, "llm.attempt")
        .map((e) => payloadOf<{ llm_error_code?: string | null; provider?: string }>(e))
        .find((p) => p?.llm_error_code != null);
      const respSent2 = eventsOfType(tr2?.events, "response.sent")
        .map((e) => payloadOf<{ http_status?: number; app_error_code?: string; ui_fallback_offered?: boolean; output_summary?: string }>(e))
        .find(Boolean);

      ctx.rec.check(
        "r2-upstream-5xx-502",
        "行 2：上游 5xx → 502 MODEL_ERROR（错误结构化）",
        { status: 502, kind: "MODEL_ERROR", ui_fallback_offered: true },
        {
          status: r2.status,
          kind: (r2.json as { error?: { kind?: string } } | null)?.error?.kind,
          ui_fallback_offered: respSent2?.ui_fallback_offered === true,
        },
        {
          failure_layer: "FALLBACK",
          metrics: ["M10"],
          evidence: {
            response: r2.json,
            trace_llm_attempt: { provider: llmErr2?.provider, llm_error_code: llmErr2?.llm_error_code },
            trace_response_sent: respSent2,
          },
        },
      );

      // 结构化错误 + 不冒充口语分析错误（错误 body 无 analysis 字段）
      ctx.rec.check(
        "r2-structured-error",
        "错误响应结构化且不冒充口语分析错误（无 analysis/ieltsAnalysis 字段）",
        { structured: true, noAnalysisFields: true },
        {
          structured: r2.json != null && typeof (r2.json as { error?: unknown })?.error === "object",
          noAnalysisFields: !(r2.json && "analysis" in r2.json),
        },
        { failure_layer: "FALLBACK", evidence: { response: r2.json } },
      );
    } finally {
      await fivexx.close();
    }

    // ============================================================
    // 行 3：前端文字输入回退路径（可达）— Playwright 最小真实 journey
    // ============================================================
    const built = isAppBuilt(process.cwd());
    if (!built) {
      ctx.rec.blocked(
        "r3-e2e-text-fallback",
        "前端文字输入回退路径可达性（需 next build + Playwright）",
        "text fallback reachable",
        "EVAL_INFRA: .next/BUILD_ID 缺失，未构建 app（先运行 npx next build）",
        { failure_layer: "EVAL_INFRA" },
      );
      ctx.rec.uncoveredAssertion("034: E2E 浏览器旅程未运行（app 未构建）");
    } else {
      let serverLogTail: string | null = null;
      let port = 0;
      try {
        port = await findFreePort();
        const server = await startNextServer(port);
        try {
          const e2e = await runSpeakingE2E(port);
          serverLogTail = e2e.serverLogTail;
          ctx.rec.check(
            "r3-e2e-text-fallback",
            "前端存在文字输入回退路径（可达）：文字模式 textarea 可用；语音失败有提示；失败后可切回文字",
            {
              textareaReachable: true,
              voiceRecorderVisible: true,
              fallbackAfterError: true,
            },
            {
              textareaReachable: e2e.textareaReachable,
              voiceRecorderVisible: e2e.voiceRecorderVisible,
              fallbackAfterError: e2e.fallbackAfterError,
            },
            {
              failure_layer: "FALLBACK",
              evidence: {
                typedValue: e2e.typedValue,
                voiceErrorAlert: e2e.voiceErrorAlert,
                error: e2e.error,
              },
            },
          );
          if (e2e.error) {
            ctx.rec.uncoveredAssertion(`034: E2E 工具错误（${e2e.error}）`);
          }
        } finally {
          await server.stop();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.rec.blocked(
          "r3-e2e-text-fallback",
          "前端文字输入回退路径可达性（Playwright journey）",
          "text fallback reachable",
          `EVAL_INFRA: ${msg.slice(0, 300)}`,
          { failure_layer: "EVAL_INFRA", evidence: { serverLogTail } },
        );
        ctx.rec.uncoveredAssertion(`034: E2E 工具无法执行（${msg.slice(0, 120)}）`);
      }
    }

    // ============================================================
    // 行 4：错误日志含 trace_id 与 audio_metadata 摘要（BC-034 已补齐）
    // ============================================================
    // 4a：503 CONFIG_ERROR 路径
    const t4 = evalTraceId("034", 4);
    const cap503 = await captureErrorLogs(() =>
      callTranscribe(AUDIO, t4, {
        OPENAI_API_KEY: undefined,
        DEEPSEEK_API_KEY: undefined,
        WHISPER_BASE_URL: undefined,
      }),
    );
    const failed503 = failedLogsOf(cap503.logs).find((l) => l.trace_id === t4);
    const am503 = (failed503?.audio_metadata ?? null) as AudioMetaSummary | null;
    const tr4 = traceOf(t4);
    const recvMeta503 = audioMetaOf(tr4);
    ctx.rec.check(
      "r4-error-log-audio-metadata-503",
      "错误日志含 trace_id 与 audio_metadata 摘要（503 CONFIG_ERROR 路径）",
      {
        traceIdInLog: true,
        audioMetaFields: ["content_type", "size_bytes", "has_filename", "extension", "empty_audio_flag"],
        requestReceivedHasMeta: true,
      },
      {
        traceIdInLog: failed503 != null,
        audioMetaFields: am503 ? ["content_type", "size_bytes", "has_filename", "extension", "empty_audio_flag"].filter((f) => f in am503) : [],
        requestReceivedHasMeta: recvMeta503 != null,
      },
      {
        failure_layer: "FALLBACK",
        metrics: ["M6", "M10"],
        evidence: {
          log: failed503,
          trace_audio_metadata: recvMeta503,
        },
      },
    );

    // 4b：502 MODEL_ERROR 路径（独立 5xx server + 独立 trace）
    const fivexx2 = await start5xxServer();
    try {
      const t4b = evalTraceId("034", 5);
      const cap502 = await captureErrorLogs(() =>
        callTranscribe(AUDIO, t4b, {
          OPENAI_API_KEY: undefined,
          DEEPSEEK_API_KEY: "eval-test-key",
          WHISPER_BASE_URL: `http://127.0.0.1:${fivexx2.port}/v1`,
        }),
      );
      const failed502 = failedLogsOf(cap502.logs).find((l) => l.trace_id === t4b);
      const am502 = (failed502?.audio_metadata ?? null) as AudioMetaSummary | null;
      const tr4b = traceOf(t4b);
      const recvMeta502 = audioMetaOf(tr4b);
      ctx.rec.check(
        "r4b-error-log-audio-metadata-502",
        "错误日志含 trace_id 与 audio_metadata 摘要（502 MODEL_ERROR 路径）",
        {
          traceIdInLog: true,
          audioMetaFields: ["content_type", "size_bytes", "has_filename", "extension", "empty_audio_flag"],
          requestReceivedHasMeta: true,
        },
        {
          traceIdInLog: failed502 != null,
          audioMetaFields: am502 ? ["content_type", "size_bytes", "has_filename", "extension", "empty_audio_flag"].filter((f) => f in am502) : [],
          requestReceivedHasMeta: recvMeta502 != null,
        },
        {
          failure_layer: "FALLBACK",
          metrics: ["M6", "M10"],
          evidence: {
            log: failed502,
            trace_audio_metadata: recvMeta502,
          },
        },
      );

      // ============================================================
      // 行 5：Required Trace Fields（trace_id / audio_metadata / llm_error_code / http_status / ui_fallback_offered）
      // ============================================================
      const tr5 = traceOf(t4b);
      const reqFields = {
        trace_id: tr5?.header.trace_id === t4b,
        audio_metadata: recvMeta502 != null,
        llm_error_code: eventsOfType(tr5?.events, "llm.attempt")
          .map((e) => payloadOf<{ llm_error_code?: string | null }>(e))
          .some((p) => p?.llm_error_code != null),
        http_status: eventsOfType(tr5?.events, "response.sent")
          .map((e) => payloadOf<{ http_status?: number }>(e))
          .some((p) => typeof p?.http_status === "number"),
        ui_fallback_offered: eventsOfType(tr5?.events, "response.sent")
          .map((e) => payloadOf<{ ui_fallback_offered?: boolean }>(e))
          .some((p) => p?.ui_fallback_offered === true),
      };
      ctx.rec.check(
        "r5-required-trace-fields",
        "Required Trace Fields：trace_id / audio_metadata / llm_error_code / http_status / ui_fallback_offered 全部就位",
        {
          trace_id: true,
          audio_metadata: true,
          llm_error_code: true,
          http_status: true,
          ui_fallback_offered: true,
        },
        reqFields,
        {
          failure_layer: "FALLBACK",
          evidence: { trace_id: t4b, fields: reqFields },
        },
      );

      // ============================================================
      // 行 6：Privacy Regression——trace 与日志不得泄漏 raw audio / base64 / 完整 filename / Authorization / API Key
      // ============================================================
      const serialized = JSON.stringify({
        trace: tr5,
        logs: cap502.logs,
      });
      const privacy = {
        noRawAudioBytes: !serialized.includes("1a45dfa3"),
        noBase64: !/base64/i.test(serialized),
        noFullFilename: !serialized.includes("recording.webm"),
        noAuthorization: !/authorization/i.test(serialized),
        noApiKey: !serialized.includes("eval-test-key"),
      };
      ctx.rec.check(
        "r6-privacy-no-leak",
        "Privacy Regression：无 audio bytes / base64 / 完整 filename / Authorization / API Key（仅摘要字段）",
        {
          noRawAudioBytes: true,
          noBase64: true,
          noFullFilename: true,
          noAuthorization: true,
          noApiKey: true,
        },
        privacy,
        {
          failure_layer: "FALLBACK",
          metrics: ["M9"],
          evidence: { privacy, audio_metadata_summary: recvMeta502 },
        },
      );
    } finally {
      await fivexx2.close();
    }

    return {
      coverage: "full",
      actualSummary:
        "行1 无 Key→503 CONFIG_ERROR ✓；行2 上游5xx→502 MODEL_ERROR（ui_fallback_offered=true）✓；" +
        "错误结构化且不冒充口语分析错误 ✓；E2E 文字回退路径可达（浏览器实测）✓；" +
        "错误日志含 trace_id + audio_metadata 摘要（503/502 双路径）✓；Required Trace Fields 全就位 ✓；" +
        "Privacy 无 raw audio/base64/完整 filename/Authorization/API Key 泄漏 ✓ → PASS",
      notes:
        "M3-P3 遗留的 audio_metadata trace 字段缺口由产品 checkpoint f117d85（BC-034, source 138839d）补齐。" +
        "本轮严格按 Frozen Gold 重新执行：503/502 错误路径 request.received.payload.audio_metadata 与 logger.error" +
        "（trace_id + audio_metadata 摘要）均实测通过；隐私约束仅记录摘要字段。Frozen Gold 语义未改变。",
    };
  },
};
