/**
 * 确定性答案内容判空契约（Bad Case 008）
 * ------------------------------------------------------------
 * 产品 Contract（Learn / Review / Demo 三端共享，禁止各写一份正则）：
 *
 *   当且仅当输入在 trim（去除首尾空白，含 \n \t U+3000 等）之后，
 *   不包含任何 Unicode 字母或数字（[\p{L}\p{N}]）时，
 *   视为「没有可评价语义内容」→ 判定为 empty-like，短路不调用 LLM。
 *
 * 冻结的判定结果（回归表见 tests/unit/answer-content.test.ts）：
 *   "" / " " / "\n"            → empty-like（短路，LLM=0）
 *   "." / "..." / "!!!" / "?"  → empty-like（短路，LLM=0）
 *   "。" / "！？" 等全角标点     → empty-like（短路，LLM=0）
 *   "😀"（emoji-only）          → empty-like（短路，LLM=0）—— 已按 Product Decision 冻结
 *   "123"（纯数字）             → 有内容（走 LLM 判题；数字属字母数字字符，宁误判不误伤）
 *   "word" / "take it for granted" / "可持续的" → 有内容（走 LLM 判题）
 *
 * 设计取舍：本谓词只做「是否存在字母/数字」这一确定性检查，
 * 不做通用 NLP 语义解析（Option C 被否决，见 docs/v3/badcases/008-empty-answer.md）。
 * 偏误方向：对字母数字输入一律保守放行（误判为有内容只会多花一次 LLM 调用，
 * 结果仍是确定性 FAIL/INCORRECT）；对纯符号/emoji 输入一律短路（节省 LLM，
 * 且此类输入在 IELTS 词汇释义场景中不可能构成合法短答案）。
 */
const HAS_ALPHANUMERIC = /[\p{L}\p{N}]/u;

/**
 * 判断答案是否「没有可评价语义内容」（empty-like）。
 * @param answer 原始答案字符串（未 trim）
 * @returns true = 短路（不调用 LLM，返回冻结的确定性结果）；false = 有内容（正常判题）
 */
export function isAnswerContentEmpty(answer: string): boolean {
  return !HAS_ALPHANUMERIC.test(answer.trim());
}
