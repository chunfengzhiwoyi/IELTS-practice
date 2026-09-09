/**
 * M2 Trace API Helper — 路由级 trace 接入
 * ------------------------------------------------------------
 * 提供统一的 request.received / response.sent 埋点模式。
 * trace_id 仅用于 observability，不参与业务逻辑。
 */
import type { NextResponse } from "next/server";

import { AppError } from "@/lib/observability/errors";
import { TraceContext } from "@/lib/observability/trace-context";
import type {
  FallbackTriggeredPayload,
  ReportAggregatedPayload,
  RequestReceivedPayload,
  RetrievalExecutedPayload,
  RoutingDecidedPayload,
  RuleAppliedPayload,
  StateReadPayload,
  StateWritePayload,
} from "@/lib/observability/trace-contract";

export interface TraceRouteContext {
  trace: TraceContext;
  traceId: string;
  // Proxy methods for convenience
  emitRoutingDecided: (payload: RoutingDecidedPayload) => void;
  emitStateRead: (payload: StateReadPayload) => void;
  emitRetrievalExecuted: (payload: RetrievalExecutedPayload) => void;
  emitRuleApplied: (payload: RuleAppliedPayload) => void;
  emitStateWrite: (payload: StateWritePayload) => void;
  emitReportAggregated: (payload: ReportAggregatedPayload) => void;
  emitFallbackTriggered: (payload: FallbackTriggeredPayload) => void;
}

/**
 * 创建路由级 TraceContext 并发射 request.received。
 * 在 API route 入口调用。
 */
export function startTrace(
  traceId: string,
  route: string,
  payload: Omit<RequestReceivedPayload, "method"> & { method?: string },
): TraceRouteContext {
  const trace = new TraceContext(traceId, route);
  trace.emitRequestReceived({
    method: payload.method ?? "POST",
    ...payload,
  });
  return {
    trace,
    traceId,
    emitRoutingDecided: (p) => trace.emitRoutingDecided(p),
    emitStateRead: (p) => trace.emitStateRead(p),
    emitRetrievalExecuted: (p) => trace.emitRetrievalExecuted(p),
    emitRuleApplied: (p) => trace.emitRuleApplied(p),
    emitStateWrite: (p) => trace.emitStateWrite(p),
    emitReportAggregated: (p) => trace.emitReportAggregated(p),
    emitFallbackTriggered: (p) => trace.emitFallbackTriggered(p),
  };
}

/**
 * 发射 response.sent 并 finalize trace header。
 * 在 API route 返回前调用（成功路径）。
 */
export function endTraceSuccess(
  ctx: TraceRouteContext,
  response: NextResponse,
  outputSummary: string,
  fallbackUsed = false,
  idempotentReplay = false,
): NextResponse {
  ctx.trace.emitResponseSent({
    http_status: 200,
    app_error_code: null,
    output_summary: outputSummary.slice(0, 500),
    fallback_used_flag: fallbackUsed,
    idempotent_replay: idempotentReplay,
  });
  ctx.trace.finalize(200, null);
  response.headers.set("x-trace-id", ctx.traceId);
  return response;
}

/**
 * 发射 response.sent（错误路径）并 finalize trace header。
 */
export function endTraceError(
  ctx: TraceRouteContext,
  httpStatus: number,
  appErrorCode: string,
  outputSummary: string,
): void {
  ctx.trace.emitResponseSent({
    http_status: httpStatus,
    app_error_code: appErrorCode,
    output_summary: outputSummary.slice(0, 500),
    fallback_used_flag: false,
  });
  ctx.trace.finalize(httpStatus, appErrorCode);
}

/**
 * 从 AppError 提取 trace 信息。
 */
export function appErrorToTrace(err: unknown): { code: string; message: string } {
  if (err instanceof AppError) {
    return { code: err.kind, message: err.message };
  }
  if (err instanceof Error) {
    return { code: "INTERNAL_ERROR", message: err.message };
  }
  return { code: "INTERNAL_ERROR", message: String(err) };
}
