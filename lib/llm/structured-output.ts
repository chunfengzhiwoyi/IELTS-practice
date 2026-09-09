/**
 * 结构化输出管线
 * ------------------------------------------------------------
 * 对任意 Provider 的 chat() 结果统一执行：
 *   1. content 非空校验
 *   2. JSON.parse
 *   3. Zod safeParse
 *   4. 任一步失败 → 使用 fast 模型执行一次修复重试
 *   5. 第二次仍失败 → 抛 LlmError
 *
 * 之上再叠加主备 Provider 切换：
 *   - 仅对 transient 错误 (timeout / 429 / 5xx) 切换到 fallback
 *   - 配置错误 (401 / schema 失败等) 不切换
 *   - LLM_FALLBACK_ENABLED=false 时禁止自动切换
 *
 * 任何失败都不写数据库；调用方负责决定用户可见反馈。
 */
import type { z } from "zod";

import { LlmError, shouldFallback } from "@/lib/llm/errors";
import type { LlmProvider } from "@/lib/llm/provider";
import { resolveProviders } from "@/lib/llm/provider-registry";
import type {
  LlmChatRequest,
  LlmMessage,
  LlmStructuredRequest,
  LlmStructuredResponse,
  ProviderKind,
} from "@/lib/llm/types";
import { logModelCall, logger } from "@/lib/observability/logger";
import { traceStore } from "@/lib/observability/trace-store";
import {
  EVENT_TYPE_TO_LAYER,
  type LlmAttemptPayload,
  type TraceEvent,
  type ValidationResultPayload,
  type FallbackTriggeredPayload,
} from "@/lib/observability/trace-contract";
import { isTraceEnabled, truncateRawOutput, sha256Hex } from "@/lib/observability/trace-context";

// =============================================================
// M2 Trace: 内部事件发射辅助（直接用 traceId，不穿透 TraceContext）
// =============================================================

let _traceSeq = 0;

function emitTraceEvent(
  traceId: string,
  eventType: TraceEvent["event_type"],
  payload: Record<string, unknown>,
  status: TraceEvent["status"] = "ok",
  durationMs: number | null = null,
  errorCode: string | null = null,
  errorMessage: string | null = null,
): void {
  if (!isTraceEnabled()) return;
  _traceSeq += 1;
  const event: TraceEvent = {
    trace_id: traceId,
    event_id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    seq: _traceSeq,
    ts: new Date().toISOString(),
    event_type: eventType,
    layer: EVENT_TYPE_TO_LAYER[eventType],
    status,
    duration_ms: durationMs,
    error_code: errorCode,
    error_message: errorMessage ? errorMessage.slice(0, 256) : null,
    payload,
  };
  traceStore.appendEvent(event);
}

function emitLlmAttempt(
  traceId: string,
  payload: Omit<LlmAttemptPayload, "raw_output" | "raw_output_truncated"> & { raw_output_full: string },
  status: TraceEvent["status"] = "ok",
): void {
  const { raw_output_full, ...rest } = payload;
  // Contract §3.6: 异常场景 raw output 全量（provider 错误 / schema 失败，status=error）。
  // 质量门 fail 的 raw 全量受 append-only 分层埋点架构限制（发射时无法预知质量门结果），记为已知限制。
  const truncated = status === "error"
    ? { text: raw_output_full, truncated: false, sha256: sha256Hex(raw_output_full) }
    : truncateRawOutput(raw_output_full);
  const fullPayload: LlmAttemptPayload = {
    ...rest,
    raw_output: truncated.text,
    raw_output_truncated: truncated.truncated,
    raw_output_sha256: truncated.sha256,
  };
  emitTraceEvent(traceId, "llm.attempt", fullPayload as unknown as Record<string, unknown>, status, payload.latency_ms, payload.llm_error_code ?? null);
}

function emitValidation(traceId: string, payload: ValidationResultPayload): void {
  const status: TraceEvent["status"] =
    payload.outcome === "pass" ? "ok" : payload.outcome === "needs_review" ? "degraded" : "error";
  emitTraceEvent(traceId, "validation.result", payload as unknown as Record<string, unknown>, status);
}

function emitFallback(traceId: string, payload: FallbackTriggeredPayload): void {
  emitTraceEvent(traceId, "fallback.triggered", payload as unknown as Record<string, unknown>, "degraded");
  if (payload.degradation_flag) {
    traceStore.updateHeader(traceId, { degradation_flag: true });
  }
}

// =============================================================
// 内部辅助
// =============================================================

interface AttemptOutcome<T> {
  ok: true;
  data: T;
  model: string;
  repairUsed: boolean;
  latencyMs: number;
}

interface AttemptFailure {
  ok: false;
  error: LlmError;
}

type AttemptResult<T> = AttemptOutcome<T> | AttemptFailure;

/** 构造修复重试的提示词 */
function buildRepairMessages(
  original: LlmMessage[],
  badContent: string,
  reason: string,
  jsonExample: string,
): LlmMessage[] {
  const repairSystem: LlmMessage = {
    role: "system",
    content:
      "你是一个 JSON 修复器。上一次回复不符合契约，请仅输出合法的 JSON，" +
      "不要任何多余的自然语言、Markdown 代码块围栏或注释。",
  };
  const repairUser: LlmMessage = {
    role: "user",
    content: [
      `上一次的原始回复如下（可能为空或非法 JSON）：`,
      "----- BEGIN LAST OUTPUT -----",
      badContent.slice(0, 4000) || "(empty)",
      "----- END LAST OUTPUT -----",
      "",
      `校验失败原因：${reason}`,
      "",
      "请严格按下方 JSON 结构重新输出（仅输出 JSON，不要解释）：",
      "----- BEGIN JSON EXAMPLE -----",
      jsonExample,
      "----- END JSON EXAMPLE -----",
    ].join("\n"),
  };
  // 保留原始 messages 中 role=user 的第一条（原始需求），
  // 追加修复上下文
  const originalUser = original.find((m) => m.role === "user");
  return [
    repairSystem,
    ...(originalUser ? [originalUser] : []),
    repairUser,
  ];
}

async function attemptStructured<T>(
  provider: LlmProvider,
  req: LlmStructuredRequest<T>,
): Promise<AttemptResult<T>> {
  const started = Date.now();
  const promptKey = req.schemaName;
  const promptVersion = "v1"; // Phase 1: 无版本化系统，固定 v1

  // ---- 首次尝试 ----
  const firstStart = Date.now();
  const first = await callAndValidate(provider, {
    tier: req.tier,
    messages: req.messages,
    jsonMode: true,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
    traceId: req.traceId,
    signal: req.signal,
  }, req.schema);
  const firstLatency = Date.now() - firstStart;

  if (first.kind === "success") {
    // M2: llm.attempt (primary, success) + validation.result (pass)
    emitLlmAttempt(req.traceId, {
      attempt_purpose: "primary",
      provider: provider.kind,
      model_name: first.model,
      tier: req.tier,
      prompt_key: promptKey,
      prompt_version: promptVersion,
      token_usage: {},
      latency_ms: firstLatency,
      raw_output_full: JSON.stringify(first.data).slice(0, 2000),
      temperature: req.temperature,
    }, "ok");
    emitValidation(req.traceId, {
      validator: `zod:${promptKey}`,
      outcome: "pass",
      zod_validation_result: { success: true },
      repair_attempts: 0,
    });
    return {
      ok: true,
      data: first.data,
      model: first.model,
      repairUsed: false,
      latencyMs: Date.now() - started,
    };
  }

  // 网络级 / provider 级错误（timeout / 429 / 5xx / auth）直接抛，不走修复重试
  if (isProviderLevelFailure(first.error)) {
    // M2: llm.attempt (primary, error)
    emitLlmAttempt(req.traceId, {
      attempt_purpose: "primary",
      provider: provider.kind,
      model_name: first.error.context.model ?? "unknown",
      tier: req.tier,
      prompt_key: promptKey,
      prompt_version: promptVersion,
      token_usage: {},
      latency_ms: firstLatency,
      raw_output_full: first.badContent,
      llm_error_code: first.error.llmKind,
      temperature: req.temperature,
    }, "error");
    return { ok: false, error: first.error };
  }

  // M2: llm.attempt (primary, validation fail) + validation.result (fail)
  emitLlmAttempt(req.traceId, {
    attempt_purpose: "primary",
    provider: provider.kind,
    model_name: first.error.context.model ?? "unknown",
    tier: req.tier,
    prompt_key: promptKey,
    prompt_version: promptVersion,
    token_usage: {},
    latency_ms: firstLatency,
    raw_output_full: first.badContent,
    llm_error_code: first.error.llmKind,
    temperature: req.temperature,
  }, "error");
  emitValidation(req.traceId, {
    validator: `zod:${promptKey}`,
    outcome: "fail",
    zod_validation_result: { success: false, issues: [first.error.message] },
    repair_attempts: 0,
  });

  logger.warn("llm.structured.repair_attempt", {
    trace_id: req.traceId,
    provider: provider.kind,
    reason: first.error.llmKind,
    detail: first.error.message,
  });

  // ---- 修复重试（强制 fast tier） ----
  const repairMessages = buildRepairMessages(
    req.messages,
    first.badContent,
    first.error.message,
    req.jsonExample,
  );
  const repairStart = Date.now();
  const second = await callAndValidate(provider, {
    tier: "fast",
    messages: repairMessages,
    jsonMode: true,
    temperature: 0,
    maxTokens: req.maxTokens,
    traceId: req.traceId,
    signal: req.signal,
  }, req.schema);
  const repairLatency = Date.now() - repairStart;

  if (second.kind === "success") {
    // M2: llm.attempt (repair, success) + validation.result (pass, repair_attempts=1)
    emitLlmAttempt(req.traceId, {
      attempt_purpose: "repair",
      provider: provider.kind,
      model_name: second.model,
      tier: "fast",
      prompt_key: `${promptKey}:repair`,
      prompt_version: promptVersion,
      token_usage: {},
      latency_ms: repairLatency,
      raw_output_full: JSON.stringify(second.data).slice(0, 2000),
      temperature: 0,
    }, "ok");
    emitValidation(req.traceId, {
      validator: `zod:${promptKey}`,
      outcome: "pass",
      zod_validation_result: { success: true },
      repair_attempts: 1,
    });
    return {
      ok: true,
      data: second.data,
      model: second.model,
      repairUsed: true,
      latencyMs: Date.now() - started,
    };
  }

  // M2: llm.attempt (repair, fail) + validation.result (fail, repair_attempts=1)
  emitLlmAttempt(req.traceId, {
    attempt_purpose: "repair",
    provider: provider.kind,
    model_name: second.error.context.model ?? "unknown",
    tier: "fast",
    prompt_key: `${promptKey}:repair`,
    prompt_version: promptVersion,
    token_usage: {},
    latency_ms: repairLatency,
    raw_output_full: second.badContent,
    llm_error_code: second.error.llmKind,
    temperature: 0,
  }, "error");
  emitValidation(req.traceId, {
    validator: `zod:${promptKey}`,
    outcome: "fail",
    zod_validation_result: { success: false, issues: [second.error.message] },
    repair_attempts: 1,
  });
  return { ok: false, error: second.error };
}

type ValidationResult<T> =
  | { kind: "success"; data: T; model: string }
  | { kind: "failure"; error: LlmError; badContent: string };

async function callAndValidate<T>(
  provider: LlmProvider,
  chatReq: LlmChatRequest,
  schema: z.ZodType<T>,
): Promise<ValidationResult<T>> {
  let content = "";
  let model = "";
  try {
    const resp = await provider.chat(chatReq);
    content = resp.content ?? "";
    model = resp.model;
  } catch (err) {
    // provider.chat 已抛 LlmError
    if (err instanceof LlmError) {
      return { kind: "failure", error: err, badContent: "" };
    }
    // 兜底
    return {
      kind: "failure",
      error: new LlmError(
        "MODEL_ERROR",
        err instanceof Error ? err.message : "unknown provider error",
        { provider: provider.kind },
        chatReq.traceId,
      ),
      badContent: "",
    };
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return {
      kind: "failure",
      error: new LlmError(
        "MODEL_EMPTY_RESPONSE",
        `Provider ${provider.kind} 返回空 content`,
        { provider: provider.kind, model },
        chatReq.traceId,
      ),
      badContent: content,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      kind: "failure",
      error: new LlmError(
        "MODEL_INVALID_JSON",
        `Provider ${provider.kind} 输出非合法 JSON`,
        { provider: provider.kind, model },
        chatReq.traceId,
      ),
      badContent: content,
    };
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    return {
      kind: "failure",
      error: new LlmError(
        "MODEL_SCHEMA_MISMATCH",
        `Schema 校验失败: ${validated.error.issues
          .map((i) => `${i.path.join(".")}:${i.message}`)
          .join("; ")}`,
        { provider: provider.kind, model },
        chatReq.traceId,
      ),
      badContent: content,
    };
  }

  return { kind: "success", data: validated.data, model };
}

function isProviderLevelFailure(err: LlmError): boolean {
  return (
    err.llmKind === "MODEL_TIMEOUT" ||
    err.llmKind === "MODEL_RATE_LIMITED" ||
    err.llmKind === "MODEL_PROVIDER_UNAVAILABLE" ||
    err.llmKind === "MODEL_UNAUTHORIZED" ||
    err.llmKind === "MODEL_ERROR"
  );
}

// =============================================================
// 对外入口
// =============================================================

export interface CallStructuredOptions {
  /** 允许注入替代 provider 组合（测试） */
  overrideProviders?: {
    primary: LlmProvider;
    fallback: LlmProvider | null;
    fallbackEnabled: boolean;
  };
}

/**
 * 结构化调用（含主备切换 + 修复重试 + 统一日志）
 */
export async function callLlmStructured<T>(
  req: LlmStructuredRequest<T>,
  options: CallStructuredOptions = {},
): Promise<LlmStructuredResponse<T>> {
  const resolved = options.overrideProviders
    ? {
        primary: options.overrideProviders.primary,
        fallback: options.overrideProviders.fallback,
        primaryKind: options.overrideProviders.primary.kind,
        fallbackKind: options.overrideProviders.fallback?.kind ?? null,
        fallbackEnabled: options.overrideProviders.fallbackEnabled,
      }
    : resolveProviders();

  const overallStart = Date.now();

  // ---- 尝试 primary ----
  const primaryResult = await attemptStructured(resolved.primary, req);
  if (primaryResult.ok) {
    logCall({
      traceId: req.traceId,
      requestedProvider: resolved.primaryKind,
      actualProvider: resolved.primaryKind,
      fallbackUsed: false,
      model: primaryResult.model,
      tier: req.tier,
      latencyMs: Date.now() - overallStart,
      success: true,
    });
    return {
      data: primaryResult.data,
      meta: {
        provider: resolved.primaryKind,
        model: primaryResult.model,
        fallbackUsed: false,
        repairUsed: primaryResult.repairUsed,
        latencyMs: Date.now() - overallStart,
        traceId: req.traceId,
      },
    };
  }

  const primaryError = primaryResult.error;
  const canFallback =
    resolved.fallbackEnabled && resolved.fallback && shouldFallback(primaryError);

  logCall({
    traceId: req.traceId,
    requestedProvider: resolved.primaryKind,
    actualProvider: resolved.primaryKind,
    fallbackUsed: false,
    model: primaryError.context.model ?? "unknown",
    tier: req.tier,
    latencyMs: Date.now() - overallStart,
    success: false,
    errorKind: primaryError.llmKind,
  });

  if (!canFallback || !resolved.fallback) {
    // 非 transient 错误 或 无 fallback，直接抛 primary 错误
    throw primaryError;
  }

  // M2: fallback.triggered（provider 切换）
  emitFallback(req.traceId, {
    trigger_error_code: primaryError.llmKind,
    chain_snapshot: [
      { step: "primary", from: resolved.primaryKind, to: resolved.primaryKind, status: "used" as const },
      { step: "fallback_provider", from: resolved.primaryKind, to: resolved.fallback.kind, status: "used" as const },
    ],
    degradation_flag: true,
    to_kind: "provider",
  });

  // ---- 尝试 fallback ----
  const fallbackStart = Date.now();
  const fallbackResult = await attemptStructured(resolved.fallback, req);
  if (fallbackResult.ok) {
    logCall({
      traceId: req.traceId,
      requestedProvider: resolved.primaryKind,
      actualProvider: resolved.fallback.kind,
      fallbackUsed: true,
      model: fallbackResult.model,
      tier: req.tier,
      latencyMs: Date.now() - fallbackStart,
      success: true,
    });
    return {
      data: fallbackResult.data,
      meta: {
        provider: resolved.fallback.kind,
        model: fallbackResult.model,
        fallbackUsed: true,
        repairUsed: fallbackResult.repairUsed,
        latencyMs: Date.now() - overallStart,
        traceId: req.traceId,
      },
    };
  }

  const fallbackError = fallbackResult.error;
  logCall({
    traceId: req.traceId,
    requestedProvider: resolved.primaryKind,
    actualProvider: resolved.fallback.kind,
    fallbackUsed: true,
    model: fallbackError.context.model ?? "unknown",
    tier: req.tier,
    latencyMs: Date.now() - fallbackStart,
    success: false,
    errorKind: fallbackError.llmKind,
  });

  throw new LlmError(
    "MODEL_ALL_PROVIDERS_FAILED",
    `Primary(${resolved.primaryKind}) 与 Fallback(${resolved.fallback.kind}) 都失败: ` +
      `primary=${primaryError.llmKind}, fallback=${fallbackError.llmKind}`,
    { provider: resolved.fallback.kind, model: fallbackError.context.model },
    req.traceId,
  );
}

// =============================================================
// 日志
// =============================================================

interface CallLogRecord {
  traceId: string;
  requestedProvider: ProviderKind;
  actualProvider: ProviderKind;
  fallbackUsed: boolean;
  model: string;
  tier: LlmChatRequest["tier"];
  latencyMs: number;
  success: boolean;
  errorKind?: string;
}

function logCall(rec: CallLogRecord) {
  logModelCall({
    trace_id: rec.traceId,
    model: rec.model,
    latency_ms: rec.latencyMs,
    status: rec.success ? "ok" : "error",
    error_kind: rec.errorKind,
  });
  logger.info("llm.call", {
    trace_id: rec.traceId,
    requested_provider: rec.requestedProvider,
    actual_provider: rec.actualProvider,
    fallback_used: rec.fallbackUsed,
    model: rec.model,
    model_tier: rec.tier,
    latency_ms: rec.latencyMs,
    success: rec.success,
    error_kind: rec.errorKind,
  });
}
