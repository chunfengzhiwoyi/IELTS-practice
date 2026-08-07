/**
 * Smoke 共享工具
 * ------------------------------------------------------------
 * - 加载 .env.local
 * - 提供五类固定测试消息
 * - 提供不打印敏感信息的日志器
 */
import process from "node:process";
import path from "node:path";

export function loadEnvLocal(): void {
  try {
    // Node 20.6+ 内置
    process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  } catch {
    // ignore
  }
}

/** 五类固定测试消息，覆盖 AgentResponse 五种 intent */
export const SMOKE_CASES: Array<{ label: string; message: string; expected: string }> = [
  { label: "NEW_ITEM", message: "帮我学习 take something for granted", expected: "NEW_ITEM" },
  { label: "REVIEW", message: "我有五分钟，复习今天的内容", expected: "REVIEW" },
  { label: "SPEAKING", message: "帮我练一道 Part 2 的题目", expected: "SPEAKING" },
  { label: "REPORT", message: "看看我最近学得怎么样", expected: "REPORT" },
  { label: "UNSUPPORTED", message: "今天天气怎么样", expected: "UNSUPPORTED" },
];

/** 敏感字段黑名单：任何日志/输出前先过一遍 */
const BLACKLIST_KEY_PATTERNS = [
  /BAILIAN_API_KEY/i,
  /DEEPSEEK_API_KEY/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
];

export function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    for (const p of BLACKLIST_KEY_PATTERNS) {
      if (p.test(obj)) return "[redacted]";
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (BLACKLIST_KEY_PATTERNS.some((p) => p.test(k))) {
        out[k] = "[redacted]";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return obj;
}
