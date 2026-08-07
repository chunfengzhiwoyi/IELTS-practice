/**
 * 结构化日志
 * ------------------------------------------------------------
 * 交接单 §9.2 要求日志不得记录完整邮箱、API Key 或原始敏感内容；
 * §9.3 要求记录模型调用的 model / tokens / latency / trace_id。
 *
 * 本模块提供轻量级 JSON 日志器：
 * - 一律输出单行 JSON，便于生产环境采集
 * - 支持 debug/info/warn/error 四级
 * - 自动附带 trace_id（如果调用方传入）
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

export interface LogContext {
  trace_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, ctx?: LogContext) {
  if (!shouldLog(level)) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(ctx ?? {}),
  };
  const line = JSON.stringify(record);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
};

/**
 * 记录模型调用指标
 * 参考交接单 §9.3
 */
export interface ModelCallMetric {
  trace_id: string;
  model: string;
  latency_ms: number;
  input_tokens?: number;
  output_tokens?: number;
  status: "ok" | "error" | "mocked";
  error_kind?: string;
}

export function logModelCall(metric: ModelCallMetric) {
  logger.info("model_call", { ...metric });
}
