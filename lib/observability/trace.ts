/**
 * Trace ID 生成与传递
 * ------------------------------------------------------------
 * 交接单 §6.2 要求 AgentResponse 携带 trace_id；
 * §9.3 要求记录每次模型调用的 model / token / 延迟 / trace_id。
 *
 * 本模块提供确定性的 trace_id 生成，格式：`trc_<时间戳base36>_<随机8字符>`
 * 便于日志排序与检索。
 */

const RAND_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomSuffix(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += RAND_ALPHABET[Math.floor(Math.random() * RAND_ALPHABET.length)];
  }
  return out;
}

/** 生成一个新的 trace_id */
export function newTraceId(): string {
  const ts = Date.now().toString(36);
  return `trc_${ts}_${randomSuffix(8)}`;
}

/** 从请求头中提取 trace_id，若无则生成新的 */
export function traceIdFromHeaders(headers: Headers): string {
  const existing = headers.get("x-trace-id");
  if (existing && /^trc_[a-z0-9_]+$/i.test(existing)) return existing;
  return newTraceId();
}
