/**
 * M2 Trace Context — 事件发射器
 * ------------------------------------------------------------
 * 提供统一的 emit API，管理 per-trace 的 seq 计数器。
 * trace_id 仅用于 observability，不参与任何业务逻辑。
 *
 * 使用方式：
 *   const ctx = new TraceContext(traceId, route);
 *   ctx.emitRequestReceived({...});
 *   ctx.emitLlmAttempt({...});
 *   ctx.emitValidationResult({...});
 *   ctx.emitFallbackTriggered({...});
 *   ctx.emitResponseSent({...});
 *   ctx.finalize(httpStatus, appErrorCode);
 *
 * Contract 对齐（M2_OBSERVABILITY_CONTRACT_V2_2）：
 * - §1.5 单条 payload 序列化后上限 4KB，超限截断并置 payload_truncated: true
 * - §1.4 header.user_hash = sha256(user_id + deployment_salt) 前 16 hex
 * - §1.4 header.client_event_id（写路径，Console D 区关联键）
 */
import { createHash } from "crypto";

import {
  EVENT_TYPE_TO_LAYER,
  type FallbackTriggeredPayload,
  type LlmAttemptPayload,
  type ReportAggregatedPayload,
  type RequestReceivedPayload,
  type ResponseSentPayload,
  type RetrievalExecutedPayload,
  type RoutingDecidedPayload,
  type RuleAppliedPayload,
  type StateReadPayload,
  type StateWritePayload,
  type TraceEvent,
  type TraceEventType,
  type ValidationResultPayload,
} from "@/lib/observability/trace-contract";
import { traceStore } from "@/lib/observability/trace-store";
import { newTraceId } from "@/lib/observability/trace";

// 全局开关：Trace Enabled vs Disabled（AC-6 Regression Guard）
// 关闭时所有 emit 为 no-op，业务行为必须完全不变
let traceEnabled = true;

export function setTraceEnabled(enabled: boolean): void {
  traceEnabled = enabled;
}

export function isTraceEnabled(): boolean {
  return traceEnabled;
}

// Contract §1.5: 单条 payload 序列化后上限 4KB
const PAYLOAD_LIMIT_BYTES = 4096;

// Contract §3.2: deployment_salt 不入库、不入日志；demo 用固定 salt，生产可经 TRACE_SALT 注入
function deploymentSalt(): string {
  return process.env.TRACE_SALT ?? "m2-demo-deployment-salt";
}

function newEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** sha256 hex（前 16 hex；user_hash 契约长度） */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Contract §3.2: user_id → user_hash = sha256(user_id + deployment_salt) 前 16 hex。
 * salt 不入库、不入日志。
 */
export function hashUserId(userId: string): string {
  return sha256Hex(`${userId}${deploymentSalt()}`);
}

/** 截断 raw_output：head256 + tail256 + sha256 */
export function truncateRawOutput(raw: string): { text: string; truncated: boolean; sha256: string } {
  const hash = sha256Hex(raw);
  if (raw.length <= 512) return { text: raw, truncated: false, sha256: hash };
  const head = raw.slice(0, 256);
  const tail = raw.slice(-256);
  return { text: `${head}\n...[truncated ${raw.length - 512} chars]...\n${tail}`, truncated: true, sha256: hash };
}

/**
 * Contract §1.5: payload 序列化后 >4KB 时截断。
 * 保留关键摘要字段（前 6 个键）并标记，避免事件信封整体超限。
 */
export function truncatePayload(payload: Record<string, unknown>): {
  payload: Record<string, unknown>;
  truncated: boolean;
} {
  const raw = JSON.stringify(payload);
  if (raw.length <= PAYLOAD_LIMIT_BYTES) {
    return { payload, truncated: false };
  }
  const keys = Object.keys(payload);
  const summary: Record<string, unknown> = {};
  for (const k of keys.slice(0, 6)) {
    const v = payload[k];
    if (typeof v === "string") summary[k] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) summary[k] = v;
    else summary[k] = "[truncated]";
  }
  summary._payload_size = raw.length;
  summary._payload_truncated_keys = keys.length;
  return { payload: summary, truncated: true };
}

/** 计算 canonical state hash（用于 state.write 前后状态对比） */
export function canonicalStateHash(state: Record<string, unknown> | null): string {
  if (!state) return "null";
  const sorted = Object.keys(state).sort().reduce<Record<string, unknown>>((acc, k) => {
    acc[k] = state[k];
    return acc;
  }, {});
  return sha256Hex(JSON.stringify(sorted));
}

export class TraceContext {
  readonly traceId: string;
  readonly route: string;
  private seq = 0;
  private startedAt: string;
  private degradationFlag = false;

  constructor(traceId: string, route: string) {
    this.traceId = traceId || newTraceId();
    this.route = route;
    this.startedAt = new Date().toISOString();

    if (traceEnabled) {
      traceStore.getOrCreateHeader({
        trace_id: this.traceId,
        route,
        started_at: this.startedAt,
        ended_at: null,
        latency_ms: null,
        http_status: null,
        app_error_code: null,
        degradation_flag: false,
        event_count: 0,
        user_hash: null,
        client_event_id: null,
      });
    }
  }

  private emit(
    eventType: TraceEventType,
    payload: Record<string, unknown>,
    status: TraceEvent["status"] = "ok",
    durationMs: number | null = null,
    errorCode: string | null = null,
    errorMessage: string | null = null,
  ): void {
    if (!traceEnabled) return;

    this.seq += 1;
    const { payload: safePayload, truncated } = truncatePayload(payload);
    const event: TraceEvent = {
      trace_id: this.traceId,
      event_id: newEventId(),
      seq: this.seq,
      ts: new Date().toISOString(),
      event_type: eventType,
      layer: EVENT_TYPE_TO_LAYER[eventType],
      status,
      duration_ms: durationMs,
      error_code: errorCode,
      error_message: errorMessage ? errorMessage.slice(0, 256) : null,
      payload: safePayload,
      ...(truncated ? { payload_truncated: true as const } : {}),
    };
    traceStore.appendEvent(event);
  }

  // ---- request.received ----
  emitRequestReceived(payload: RequestReceivedPayload): void {
    // 记录 client_event_id 到 header
    if (payload.client_event_id && traceEnabled) {
      traceStore.updateHeader(this.traceId, { client_event_id: payload.client_event_id });
    }
    this.emit("request.received", payload as unknown as Record<string, unknown>);
  }

  // ---- llm.attempt ----
  emitLlmAttempt(payload: LlmAttemptPayload, status: TraceEvent["status"] = "ok"): void {
    this.emit("llm.attempt", payload as unknown as Record<string, unknown>, status, payload.latency_ms, payload.llm_error_code ?? null);
  }

  // ---- validation.result ----
  emitValidationResult(payload: ValidationResultPayload): void {
    const status: TraceEvent["status"] =
      payload.outcome === "pass" ? "ok" : payload.outcome === "needs_review" ? "degraded" : "error";
    this.emit("validation.result", payload as unknown as Record<string, unknown>, status);
  }

  // ---- fallback.triggered ----
  emitFallbackTriggered(payload: FallbackTriggeredPayload): void {
    if (payload.degradation_flag) {
      this.degradationFlag = true;
      if (traceEnabled) traceStore.updateHeader(this.traceId, { degradation_flag: true });
    }
    this.emit("fallback.triggered", payload as unknown as Record<string, unknown>, "degraded");
  }

  // ---- response.sent ----
  emitResponseSent(payload: ResponseSentPayload): void {
    this.emit("response.sent", payload as unknown as Record<string, unknown>);
  }

  // ---- routing.decided ----
  emitRoutingDecided(payload: RoutingDecidedPayload): void {
    this.emit("routing.decided", payload as unknown as Record<string, unknown>);
  }

  // ---- state.read ----
  emitStateRead(payload: StateReadPayload): void {
    this.emit("state.read", payload as unknown as Record<string, unknown>);
  }

  // ---- retrieval.executed ----
  emitRetrievalExecuted(payload: RetrievalExecutedPayload): void {
    const status: TraceEvent["status"] = payload.knowledge_miss_flag ? "degraded" : "ok";
    this.emit("retrieval.executed", payload as unknown as Record<string, unknown>, status);
  }

  // ---- rule.applied ----
  emitRuleApplied(payload: RuleAppliedPayload): void {
    this.emit("rule.applied", payload as unknown as Record<string, unknown>);
  }

  // ---- state.write ----
  emitStateWrite(payload: StateWritePayload): void {
    const status: TraceEvent["status"] =
      payload.idempotency_outcome === "duplicate_ignored" ? "degraded" : "ok";
    this.emit("state.write", payload as unknown as Record<string, unknown>, status);
  }

  // ---- report.aggregated ----
  emitReportAggregated(payload: ReportAggregatedPayload): void {
    const status: TraceEvent["status"] = payload.insufficient_data_flag ? "degraded" : "ok";
    this.emit("report.aggregated", payload as unknown as Record<string, unknown>, status);
  }

  /**
   * Contract §1.4: 记录 user_hash（auth 解析后调用）。
   * 仅 observability，不参与业务逻辑。
   */
  setUser(userId: string): void {
    if (!traceEnabled || !userId) return;
    traceStore.updateHeader(this.traceId, { user_hash: hashUserId(userId) });
  }

  /**
   * Contract §1.4: 写路径请求体解析后回填真实 client_event_id。
   * 解决 startTrace 时 body 尚未解析、request.received 只能先占位的问题，
   * 保证 Console D 区按 client_event_id 关联（Case 037 双 trace 对比）可用。
   */
  setClientEventId(clientEventId: string): void {
    if (!traceEnabled || !clientEventId) return;
    traceStore.updateHeader(this.traceId, { client_event_id: clientEventId });
  }

  // ---- finalize（请求结束时回填 header）----
  finalize(httpStatus: number, appErrorCode: string | null): void {
    if (!traceEnabled) return;
    const endedAt = new Date().toISOString();
    const latencyMs = Date.now() - new Date(this.startedAt).getTime();
    // 从 store 读取当前 header（可能被 callLlmStructured 等模块更新了 degradation_flag）
    const current = traceStore.getTrace(this.traceId);
    const degradation = current?.header.degradation_flag ?? this.degradationFlag;
    traceStore.updateHeader(this.traceId, {
      ended_at: endedAt,
      latency_ms: latencyMs,
      http_status: httpStatus,
      app_error_code: appErrorCode,
      degradation_flag: degradation,
    });
  }

  /** 标记降级（供业务层调用） */
  markDegraded(): void {
    this.degradationFlag = true;
    if (traceEnabled) traceStore.updateHeader(this.traceId, { degradation_flag: true });
  }
}

/** 便捷函数：从 trace_id 获取完整 trace */
export function getTraceById(traceId: string) {
  return traceStore.getTrace(traceId);
}
