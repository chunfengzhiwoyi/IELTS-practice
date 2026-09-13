/**
 * LEARNING-REPORT-ONLINE-02 — speaking_evaluations 缺表降级判定
 * ------------------------------------------------------------
 * 严格限定：仅当错误明确指向「speaking_evaluations 表不存在」时返回 true：
 *   - PostgREST schema cache 未找到表：PGRST205
 *   - Postgres undefined_table：42P01
 * 且 message 必须提到 speaking_evaluations（避免吞掉同名无关错误）。
 *
 * 绝不匹配：auth / RLS / network / 未知错误 —— 这些必须 fail loudly。
 */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export function isSpeakingEvaluationsMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (typeof e.code !== "string" || !MISSING_TABLE_CODES.has(e.code)) return false;
  if (typeof e.message !== "string") return false;
  return e.message.includes("speaking_evaluations");
}
