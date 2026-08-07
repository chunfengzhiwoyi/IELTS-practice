/**
 * LLM 层错误类型
 * ------------------------------------------------------------
 * 继承自 AppError，携带更多结构化信息（provider / model / http status），
 * 供 fallback 判定和日志使用。
 */
import { AppError, type ErrorKind } from "@/lib/observability/errors";

import type { ProviderKind } from "@/lib/env";

/** LLM 层可能抛出的错误 kind 子集 */
export type LlmErrorKind = Extract<
  ErrorKind,
  | "MODEL_ERROR"
  | "MODEL_EMPTY_RESPONSE"
  | "MODEL_INVALID_JSON"
  | "MODEL_SCHEMA_MISMATCH"
  | "MODEL_RATE_LIMITED"
  | "MODEL_TIMEOUT"
  | "MODEL_UNAUTHORIZED"
  | "MODEL_PROVIDER_UNAVAILABLE"
  | "MODEL_ALL_PROVIDERS_FAILED"
>;

export interface LlmErrorContext {
  provider: ProviderKind;
  model?: string;
  httpStatus?: number;
  cause?: string;
}

export class LlmError extends AppError {
  public readonly llmKind: LlmErrorKind;
  public readonly context: LlmErrorContext;

  constructor(
    kind: LlmErrorKind,
    message: string,
    context: LlmErrorContext,
    traceId?: string,
  ) {
    super(kind, message, traceId, {
      provider: context.provider,
      model: context.model,
      httpStatus: context.httpStatus,
      cause: context.cause,
    });
    this.name = "LlmError";
    this.llmKind = kind;
    this.context = context;
  }
}

/**
 * 判断一个 LLM 错误是否应触发 fallback 到备用 Provider。
 *
 * 允许 fallback（transient / provider-level 故障）：
 *  - MODEL_TIMEOUT
 *  - MODEL_RATE_LIMITED
 *  - MODEL_PROVIDER_UNAVAILABLE
 *
 * 不允许 fallback（配置错误 / 契约错误 / 安全拒绝）：
 *  - MODEL_UNAUTHORIZED
 *  - MODEL_EMPTY_RESPONSE
 *  - MODEL_INVALID_JSON
 *  - MODEL_SCHEMA_MISMATCH
 *  - MODEL_ERROR（未分类的兜底，谨慎起见不 fallback）
 */
export function shouldFallback(err: LlmError): boolean {
  switch (err.llmKind) {
    case "MODEL_TIMEOUT":
    case "MODEL_RATE_LIMITED":
    case "MODEL_PROVIDER_UNAVAILABLE":
      return true;
    default:
      return false;
  }
}

/**
 * 把 OpenAI SDK 或原生错误分类为 LlmError
 */
export function classifyProviderError(
  err: unknown,
  ctx: LlmErrorContext,
  traceId?: string,
): LlmError {
  // OpenAI SDK 错误对象在不同版本中形状略有差异，做鸭子类型
  const anyErr = err as { status?: number; code?: string; message?: string; name?: string };
  const status = typeof anyErr?.status === "number" ? anyErr.status : undefined;
  const message = anyErr?.message ?? "unknown error";

  const contextWithStatus: LlmErrorContext = { ...ctx, httpStatus: status };

  if (status === 401 || status === 403) {
    return new LlmError(
      "MODEL_UNAUTHORIZED",
      `Provider ${ctx.provider} 返回未授权 (${status})`,
      contextWithStatus,
      traceId,
    );
  }
  if (status === 429) {
    return new LlmError(
      "MODEL_RATE_LIMITED",
      `Provider ${ctx.provider} 触发限流 (429)`,
      contextWithStatus,
      traceId,
    );
  }
  if (typeof status === "number" && status >= 500 && status < 600) {
    return new LlmError(
      "MODEL_PROVIDER_UNAVAILABLE",
      `Provider ${ctx.provider} 服务端错误 (${status})`,
      contextWithStatus,
      traceId,
    );
  }
  if (
    anyErr?.name === "AbortError" ||
    anyErr?.code === "ETIMEDOUT" ||
    anyErr?.code === "ECONNRESET" ||
    anyErr?.code === "ECONNREFUSED" ||
    /timeout|timed out|network|socket/i.test(message)
  ) {
    return new LlmError(
      "MODEL_TIMEOUT",
      `Provider ${ctx.provider} 超时或网络错误: ${message}`,
      contextWithStatus,
      traceId,
    );
  }

  return new LlmError(
    "MODEL_ERROR",
    `Provider ${ctx.provider} 调用失败: ${message}`,
    { ...contextWithStatus, cause: anyErr?.name },
    traceId,
  );
}
