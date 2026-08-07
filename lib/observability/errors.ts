/**
 * 统一错误结构
 * ------------------------------------------------------------
 * 交接单 §9.1：模型失败、写库失败等场景都要有清晰的用户反馈，
 * 且不能把失败误写为学习状态。前后端共享一个错误码体系。
 *
 * P0.5 扩展：LLM Provider 层引入 8 个模型侧标准错误。
 */

export type ErrorKind =
  | "AUTH_REQUIRED" //  未登录或会话失效
  | "FORBIDDEN" //  越权
  | "INVALID_INPUT" //  Zod 校验失败
  // ---- LLM 层 ----
  | "MODEL_ERROR" //  兜底：其他未分类的模型错误
  | "MODEL_EMPTY_RESPONSE" //  Provider 返回空 content
  | "MODEL_INVALID_JSON" //  content 无法 JSON.parse
  | "MODEL_SCHEMA_MISMATCH" //  content 不符合 Zod schema
  | "MODEL_RATE_LIMITED" //  HTTP 429 或等价限流
  | "MODEL_TIMEOUT" //  超时 / 网络错误
  | "MODEL_UNAUTHORIZED" //  HTTP 401 / 403 / API Key 无效
  | "MODEL_PROVIDER_UNAVAILABLE" //  HTTP 5xx / provider unreachable
  | "MODEL_ALL_PROVIDERS_FAILED" //  primary + fallback 都失败
  // ---- 其他 ----
  | "PERSISTENCE_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UNSUPPORTED_INTENT"
  | "CONFIG_ERROR" //  服务端启动配置校验失败
  | "INTERNAL";

export interface AppErrorPayload {
  kind: ErrorKind;
  message: string;
  trace_id?: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly kind: ErrorKind;
  public readonly traceId?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    kind: ErrorKind,
    message: string,
    traceId?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.traceId = traceId;
    this.details = details;
  }

  toPayload(): AppErrorPayload {
    return {
      kind: this.kind,
      message: this.message,
      trace_id: this.traceId,
      details: this.details,
    };
  }
}

/** 将任意错误规范化为 AppError */
export function toAppError(err: unknown, traceId?: string): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    return new AppError("INTERNAL", err.message, traceId);
  }
  return new AppError("INTERNAL", "unknown error", traceId);
}
