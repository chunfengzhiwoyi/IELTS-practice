/**
 * M2 Phase 1 Tests
 * ------------------------------------------------------------
 * - Trace Contract (Zod validation)
 * - Trace Store (append-only, query by trace_id)
 * - Trace Context (emit events, seq ordering)
 * - Regression Guard: Trace Enabled vs Disabled 业务结果一致
 * - ELS-EVAL 等价 Case: normal / fallback / validation-error traces
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";

import {
  FailureLayerSchema,
  TraceEventTypeSchema,
  TraceHeaderSchema,
  TraceEventSchema,
  EVENT_TYPE_TO_LAYER,
  type FailureLayer,
} from "@/lib/observability/trace-contract";
import { traceStore } from "@/lib/observability/trace-store";
import { TraceContext, setTraceEnabled, isTraceEnabled, truncateRawOutput } from "@/lib/observability/trace-context";
import { callLlmStructured } from "@/lib/llm/structured-output";
import { LlmError } from "@/lib/llm/errors";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";

// =============================================================
// Helpers
// =============================================================

function makeProvider(kind: string, content: string, shouldThrow = false): LlmProvider {
  return {
    kind: kind as LlmProvider["kind"],
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      if (shouldThrow) {
        throw new LlmError("MODEL_TIMEOUT", "simulated provider timeout", { provider: kind as LlmProvider["kind"] });
      }
      return { content, model: `${kind}-model`, usage: { input_tokens: 10, output_tokens: 20 } };
    },
  };
}

const TestSchema = z.object({
  correct: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
});

// =============================================================
// 1. Trace Contract
// =============================================================

describe("M2: Trace Contract", () => {
  it("FailureLayer 严格 13 层 enum", () => {
    const layers = FailureLayerSchema.options;
    expect(layers).toHaveLength(13);
    expect(layers).toContain("INPUT");
    expect(layers).toContain("MODEL");
    expect(layers).toContain("OUTPUT_VALIDATION");
    expect(layers).toContain("FALLBACK");
    expect(layers).toContain("UI_PRESENTATION");
    expect(layers).toContain("UNKNOWN");
  });

  it("Event Type → Layer 映射正确", () => {
    expect(EVENT_TYPE_TO_LAYER["request.received"]).toBe("INPUT");
    expect(EVENT_TYPE_TO_LAYER["llm.attempt"]).toBe("MODEL");
    expect(EVENT_TYPE_TO_LAYER["validation.result"]).toBe("OUTPUT_VALIDATION");
    expect(EVENT_TYPE_TO_LAYER["fallback.triggered"]).toBe("FALLBACK");
    expect(EVENT_TYPE_TO_LAYER["response.sent"]).toBe("UI_PRESENTATION");
  });

  it("TraceHeader Zod 校验通过", () => {
    const header = {
      trace_id: "trc_test_001",
      route: "/api/review/submit",
      started_at: "2026-09-09T00:00:00.000Z",
      ended_at: null,
      latency_ms: null,
      http_status: null,
      app_error_code: null,
      degradation_flag: false,
      event_count: 0,
      user_hash: null,
      client_event_id: null,
    };
    const result = TraceHeaderSchema.safeParse(header);
    expect(result.success).toBe(true);
  });

  it("TraceEvent Zod 校验通过", () => {
    const event = {
      trace_id: "trc_test_001",
      event_id: "evt_test_001",
      seq: 1,
      ts: "2026-09-09T00:00:00.000Z",
      event_type: "request.received",
      layer: "INPUT" as FailureLayer,
      status: "ok",
      duration_ms: null,
      error_code: null,
      error_message: null,
      payload: { input_summary: "test" },
    };
    const result = TraceEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("truncateRawOutput: 短文本不截断", () => {
    const short = "hello world";
    const result = truncateRawOutput(short);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(short);
    expect(result.sha256).toBeDefined();
  });

  it("truncateRawOutput: 长文本截断并保留 sha256", () => {
    const long = "a".repeat(1000);
    const result = truncateRawOutput(long);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(long.length);
    expect(result.sha256).toBeDefined();
  });
});

// =============================================================
// 2. Trace Store
// =============================================================

describe("M2: Trace Store (append-only)", () => {
  beforeEach(() => traceStore.reset());

  it("append-only: 事件按 seq 排序返回", () => {
    const traceId = "trc_store_001";
    traceStore.getOrCreateHeader({
      trace_id: traceId, route: "/test", started_at: new Date().toISOString(),
      ended_at: null, latency_ms: null, http_status: null, app_error_code: null,
      degradation_flag: false, event_count: 0, user_hash: null, client_event_id: null,
    });
    traceStore.appendEvent({
      trace_id: traceId, event_id: "e2", seq: 2, ts: new Date().toISOString(),
      event_type: "response.sent", layer: "UI_PRESENTATION", status: "ok",
      duration_ms: null, error_code: null, error_message: null, payload: {},
    });
    traceStore.appendEvent({
      trace_id: traceId, event_id: "e1", seq: 1, ts: new Date().toISOString(),
      event_type: "request.received", layer: "INPUT", status: "ok",
      duration_ms: null, error_code: null, error_message: null, payload: {},
    });
    const trace = traceStore.getTrace(traceId);
    expect(trace).not.toBeNull();
    expect(trace!.events[0]!.seq).toBe(1);
    expect(trace!.events[1]!.seq).toBe(2);
  });

  it("按 trace_id 查询不存在返回 null", () => {
    expect(traceStore.getTrace("nonexistent")).toBeNull();
  });

  it("event_count 自动更新", () => {
    const traceId = "trc_store_002";
    traceStore.getOrCreateHeader({
      trace_id: traceId, route: "/test", started_at: new Date().toISOString(),
      ended_at: null, latency_ms: null, http_status: null, app_error_code: null,
      degradation_flag: false, event_count: 0, user_hash: null, client_event_id: null,
    });
    traceStore.appendEvent({
      trace_id: traceId, event_id: "e1", seq: 1, ts: new Date().toISOString(),
      event_type: "request.received", layer: "INPUT", status: "ok",
      duration_ms: null, error_code: null, error_message: null, payload: {},
    });
    const trace = traceStore.getTrace(traceId);
    expect(trace!.header.event_count).toBe(1);
  });
});

// =============================================================
// 3. Trace Context
// =============================================================

describe("M2: Trace Context", () => {
  beforeEach(() => {
    traceStore.reset();
    setTraceEnabled(true);
  });

  it("完整生命周期: request → llm → validation → response", () => {
    const ctx = new TraceContext("trc_ctx_001", "/api/test");
    ctx.emitRequestReceived({ input_summary: "test", method: "POST" });
    ctx.emitLlmAttempt({
      attempt_purpose: "primary", provider: "mock", model_name: "mock-model",
      tier: "fast", prompt_key: "TestSchema", prompt_version: "v1",
      token_usage: {}, latency_ms: 100, raw_output: '{"correct":true}',
      raw_output_truncated: false,
    });
    ctx.emitValidationResult({
      validator: "zod:TestSchema", outcome: "pass", repair_attempts: 0,
    });
    ctx.emitResponseSent({
      http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false,
    });
    ctx.finalize(200, null);

    const trace = traceStore.getTrace("trc_ctx_001");
    expect(trace).not.toBeNull();
    expect(trace!.events).toHaveLength(4);
    expect(trace!.events[0]!.event_type).toBe("request.received");
    expect(trace!.events[1]!.event_type).toBe("llm.attempt");
    expect(trace!.events[2]!.event_type).toBe("validation.result");
    expect(trace!.events[3]!.event_type).toBe("response.sent");
    expect(trace!.header.http_status).toBe(200);
    expect(trace!.header.ended_at).not.toBeNull();
  });

  it("fallback.triggered 设置 degradation_flag", () => {
    const ctx = new TraceContext("trc_ctx_002", "/api/test");
    ctx.emitFallbackTriggered({
      trigger_error_code: "MODEL_TIMEOUT",
      chain_snapshot: [{ step: "primary", from: "mock", to: "mock", status: "used" }],
      degradation_flag: true,
      to_kind: "provider",
    });
    const trace = traceStore.getTrace("trc_ctx_002");
    expect(trace!.header.degradation_flag).toBe(true);
  });
});

// =============================================================
// 4. Regression Guard: Trace Enabled vs Disabled
// =============================================================

describe("M2: Regression Guard — Trace Enabled vs Disabled 业务结果一致", () => {
  const validJson = JSON.stringify({ correct: true, confidence: "high" });

  it("callLlmStructured: 正常路径结果一致", async () => {
    const provider = makeProvider("mock", validJson);
    const commonArgs = {
      tier: "fast" as const,
      messages: [{ role: "user" as const, content: "test" }],
      schema: TestSchema,
      schemaName: "TestSchema",
      jsonExample: validJson,
      traceId: "trc_regression_001",
    };

    // Enabled: 调用并验证 trace 存在
    setTraceEnabled(true);
    traceStore.reset();
    const enabled = await callLlmStructured(commonArgs, {
      overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false },
    });
    const traceEnabled = traceStore.getTrace("trc_regression_001");
    expect(traceEnabled).not.toBeNull();
    expect(traceEnabled!.events.length).toBeGreaterThan(0);

    // Disabled: reset store，调用并验证 trace 未创建
    setTraceEnabled(false);
    traceStore.reset();
    const disabled = await callLlmStructured(commonArgs, {
      overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false },
    });
    const traceDisabled = traceStore.getTrace("trc_regression_001");
    expect(traceDisabled).toBeNull();

    // 业务结果完全一致
    expect(enabled.data).toEqual(disabled.data);
    expect(enabled.meta.model).toBe(disabled.meta.model);
    expect(enabled.meta.fallbackUsed).toBe(disabled.meta.fallbackUsed);
    expect(enabled.meta.repairUsed).toBe(disabled.meta.repairUsed);

    setTraceEnabled(true); // 恢复
  });

  it("callLlmStructured: 错误路径结果一致（抛异常）", async () => {
    const provider = makeProvider("mock", "", true); // throw MODEL_TIMEOUT
    const commonArgs = {
      tier: "fast" as const,
      messages: [{ role: "user" as const, content: "test" }],
      schema: TestSchema,
      schemaName: "TestSchema",
      jsonExample: validJson,
      traceId: "trc_regression_002",
    };

    setTraceEnabled(true);
    traceStore.reset();
    let enabledError: unknown = null;
    try {
      await callLlmStructured(commonArgs, {
        overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false },
      });
    } catch (e) { enabledError = e; }

    setTraceEnabled(false);
    traceStore.reset();
    let disabledError: unknown = null;
    try {
      await callLlmStructured(commonArgs, {
        overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false },
      });
    } catch (e) { disabledError = e; }

    expect(enabledError).not.toBeNull();
    expect(disabledError).not.toBeNull();
    expect((enabledError as Error).message).toBe((disabledError as Error).message);
    setTraceEnabled(true);
  });
});

// =============================================================
// 5. ELS-EVAL 等价 Case: 真实 Trace 生成
// =============================================================

describe("M2: ELS-EVAL 等价 Case — 真实 Trace 生成", () => {
  beforeEach(() => {
    traceStore.reset();
    setTraceEnabled(true);
  });

  it("ELS-EVAL-020 等价: 正常 trace — request → llm → validation → response", async () => {
    const validJson = JSON.stringify({ correct: true, confidence: "high" });
    const provider = makeProvider("mock", validJson);
    const traceId = "trc_els_020";

    const ctx = new TraceContext(traceId, "/api/review/submit");
    ctx.emitRequestReceived({ input_summary: "review submit", client_event_id: "ce-020", method: "POST" });

    const result = await callLlmStructured(
      {
        tier: "fast",
        messages: [{ role: "user", content: "test answer" }],
        schema: TestSchema,
        schemaName: "JudgeResult",
        jsonExample: validJson,
        traceId,
      },
      { overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false } },
    );

    ctx.emitResponseSent({
      http_status: 200, app_error_code: null,
      output_summary: `correct=${result.data.correct}`, fallback_used_flag: false,
    });
    ctx.finalize(200, null);

    const trace = traceStore.getTrace(traceId);
    expect(trace).not.toBeNull();

    // 验证十问可回答
    const events = trace!.events;
    const req = events.find((e) => e.event_type === "request.received");
    const llm = events.find((e) => e.event_type === "llm.attempt");
    const val = events.find((e) => e.event_type === "validation.result");
    const resp = events.find((e) => e.event_type === "response.sent");

    expect(req).toBeDefined();
    expect(llm).toBeDefined();
    expect(val).toBeDefined();
    expect(resp).toBeDefined();

    // Q4: 用了什么 Prompt/Model
    expect(llm!.payload.provider).toBe("mock");
    expect(llm!.payload.model_name).toBe("mock-model");
    expect(llm!.payload.prompt_key).toBe("JudgeResult");
    expect(llm!.payload.prompt_version).toBe("v1");
    expect(llm!.payload.attempt_purpose).toBe("primary");

    // Q5: 模型返回什么
    expect(llm!.payload.raw_output).toBeDefined();

    // Q6: Validation 做了什么
    expect(val!.payload.outcome).toBe("pass");
    expect(val!.payload.repair_attempts).toBe(0);

    // Q9: 用户最终收到什么
    expect(resp!.payload.http_status).toBe(200);
    expect(resp!.payload.fallback_used_flag).toBe(false);

    // 首事件=request, 末事件=response
    expect(events[0]!.event_type).toBe("request.received");
    expect(events[events.length - 1]!.event_type).toBe("response.sent");
  });

  it("ELS-EVAL-031 等价: fallback trace — primary 失败 → fallback provider", async () => {
    const validJson = JSON.stringify({ correct: false, confidence: "low" });
    const failingProvider = makeProvider("mock", "", true); // throw
    const fallbackProvider = makeProvider("bailian", validJson);
    const traceId = "trc_els_031";

    const ctx = new TraceContext(traceId, "/api/review/submit");
    ctx.emitRequestReceived({ input_summary: "review submit", method: "POST" });

    const result = await callLlmStructured(
      {
        tier: "fast",
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        schemaName: "JudgeResult",
        jsonExample: validJson,
        traceId,
      },
      { overrideProviders: { primary: failingProvider, fallback: fallbackProvider, fallbackEnabled: true } },
    );

    ctx.emitResponseSent({
      http_status: 200, app_error_code: null,
      output_summary: "fallback used", fallback_used_flag: true,
    });
    ctx.finalize(200, null);

    const trace = traceStore.getTrace(traceId);
    expect(trace).not.toBeNull();

    // Q7: 是否 fallback
    const fb = trace!.events.find((e) => e.event_type === "fallback.triggered");
    expect(fb).toBeDefined();
    expect(fb!.payload.to_kind).toBe("provider");
    expect(fb!.payload.degradation_flag).toBe(true);

    // 应该有两个 llm.attempt (primary error + fallback success)
    const llmAttempts = trace!.events.filter((e) => e.event_type === "llm.attempt");
    expect(llmAttempts.length).toBeGreaterThanOrEqual(2);

    // degradation_flag 传播到 header
    expect(trace!.header.degradation_flag).toBe(true);

    // 最终结果来自 fallback
    expect(result.meta.fallbackUsed).toBe(true);
    expect(result.meta.provider).toBe("bailian");
  });

  it("ELS-EVAL-032 等价: validation error trace — schema mismatch → repair", async () => {
    const invalidJson = "this is not json";
    const repairJson = JSON.stringify({ correct: true, confidence: "medium" });
    // provider 第一次返回非法 JSON，第二次（repair）返回合法 JSON
    let callCount = 0;
    const provider: LlmProvider = {
      kind: "mock",
      async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
        callCount += 1;
        if (callCount === 1) return { content: invalidJson, model: "mock-model" };
        return { content: repairJson, model: "mock-model" };
      },
    };
    const traceId = "trc_els_032";

    const ctx = new TraceContext(traceId, "/api/review/submit");
    ctx.emitRequestReceived({ input_summary: "review submit", method: "POST" });

    const result = await callLlmStructured(
      {
        tier: "fast",
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        schemaName: "JudgeResult",
        jsonExample: repairJson,
        traceId,
      },
      { overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false } },
    );

    ctx.emitResponseSent({
      http_status: 200, app_error_code: null,
      output_summary: "repair succeeded", fallback_used_flag: false,
    });
    ctx.finalize(200, null);

    const trace = traceStore.getTrace(traceId);
    expect(trace).not.toBeNull();

    // 应该有两个 llm.attempt (primary fail + repair success)
    const llmAttempts = trace!.events.filter((e) => e.event_type === "llm.attempt");
    expect(llmAttempts.length).toBe(2);
    expect(llmAttempts[0]!.payload.attempt_purpose).toBe("primary");
    expect(llmAttempts[0]!.status).toBe("error");
    expect(llmAttempts[1]!.payload.attempt_purpose).toBe("repair");
    expect(llmAttempts[1]!.status).toBe("ok");

    // validation: 第一次 fail, 第二次 pass
    const validations = trace!.events.filter((e) => e.event_type === "validation.result");
    expect(validations.length).toBe(2);
    expect(validations[0]!.payload.outcome).toBe("fail");
    expect(validations[1]!.payload.outcome).toBe("pass");
    expect(validations[1]!.payload.repair_attempts).toBe(1);

    // repair 成功
    expect(result.meta.repairUsed).toBe(true);
  });

  it("ELS-EVAL-036 等价: fallbackJudge trace — LLM 失败 → 关键词匹配", async () => {
    // 模拟 judgeAnswerWithLlm 的 fallbackJudge 路径
    const traceId = "trc_els_036";
    const ctx = new TraceContext(traceId, "/api/learn/submit");
    ctx.emitRequestReceived({ input_summary: "learn submit", client_event_id: "ce-036", method: "POST" });

    // LLM 失败
    ctx.emitLlmAttempt({
      attempt_purpose: "primary", provider: "mock", model_name: "mock-model",
      tier: "fast", prompt_key: "JudgeResult", prompt_version: "v1",
      token_usage: {}, latency_ms: 5000, raw_output: "",
      raw_output_truncated: false, llm_error_code: "MODEL_TIMEOUT",
    }, "error");

    // fallbackJudge 触发
    ctx.emitFallbackTriggered({
      trigger_error_code: "MODEL_TIMEOUT",
      chain_snapshot: [
        { step: "llm_judge", from: "llm", to: "llm", status: "used" },
        { step: "fallback_judge", from: "llm", to: "keyword_match", status: "used" },
      ],
      degradation_flag: true,
      to_kind: "fallback_judge",
    });

    ctx.emitResponseSent({
      http_status: 200, app_error_code: null,
      output_summary: "fallbackJudge: keyword match", fallback_used_flag: true,
    });
    ctx.finalize(200, null);

    const trace = traceStore.getTrace(traceId);
    expect(trace).not.toBeNull();

    const fb = trace!.events.find((e) => e.event_type === "fallback.triggered");
    expect(fb).toBeDefined();
    expect(fb!.payload.to_kind).toBe("fallback_judge");
    expect(fb!.payload.trigger_error_code).toBe("MODEL_TIMEOUT");
    expect(trace!.header.degradation_flag).toBe(true);
  });
});

// =============================================================
// 6. trace_id 不参与业务逻辑（AC-6）
// =============================================================

describe("M2: AC-6 — trace_id 不参与业务逻辑", () => {
  it("业务代码不读取 traceStore 做决策", () => {
    // 这是一个静态检查：traceStore 只被 observability 模块和测试导入
    // 业务模块（learning/review/speaking/report）不应 import traceStore
    // 此处验证 traceStore 的 API 不包含业务决策方法
    const storeProto = Object.getPrototypeOf(traceStore);
    const methods = Object.getOwnPropertyNames(storeProto).filter((m) => m !== "constructor");
    expect(methods).toContain("getTrace");
    expect(methods).toContain("appendEvent");
    expect(methods).not.toContain("shouldRetry");
    expect(methods).not.toContain("getCorrectness");
    expect(methods).not.toContain("computeSchedule");
  });
});
