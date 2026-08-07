/**
 * API 请求日志辅助
 * ------------------------------------------------------------
 * 在每个 API route handler 的开头和结尾调用，记录：
 *  - trace_id
 *  - method + path
 *  - 响应状态码
 *  - 耗时（ms）
 *
 * 交接单 §9.3：记录每次调用的延迟和 trace_id。
 * 交接单 §9.2：日志不得记录完整邮箱、API Key 或敏感内容。
 */
import { logger } from "@/lib/observability/logger";

export interface RequestLogContext {
  traceId: string;
  method: string;
  path: string;
  userId?: string;
}

export function logRequestStart(ctx: RequestLogContext) {
  logger.info("api.request.start", {
    trace_id: ctx.traceId,
    method: ctx.method,
    path: ctx.path,
    user_id: ctx.userId,
  });
}

export function logRequestEnd(ctx: RequestLogContext & { status: number; durationMs: number }) {
  logger.info("api.request.end", {
    trace_id: ctx.traceId,
    method: ctx.method,
    path: ctx.path,
    user_id: ctx.userId,
    status: ctx.status,
    duration_ms: ctx.durationMs,
  });
}
