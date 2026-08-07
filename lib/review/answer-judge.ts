/**
 * 复习答案判断
 * ------------------------------------------------------------
 * 确定性判断，不使用 LLM。
 * 规则：
 *  1. skipped=true → SKIPPED
 *  2. 标准化后精确匹配 acceptedAnswers → CORRECT_INDEPENDENT | CORRECT_WITH_HINT
 *  3. 答案包含所有 answerKeywords → CORRECT_INDEPENDENT | CORRECT_WITH_HINT
 *  4. 空答案 → INCORRECT
 *  5. 其它 → INCORRECT
 */

export type ReviewResult = "CORRECT_INDEPENDENT" | "CORRECT_WITH_HINT" | "INCORRECT" | "SKIPPED";

export interface JudgeReviewAnswerParams {
  answer: string;
  usedHint: boolean;
  skipped: boolean;
  acceptedAnswers: string[];
  answerKeywords: string[];
}

/** 标准化：trim + lowercase + 去标点 */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[；;、，,。.（）()：:""\"\'!！?？\-—\s]+/g, "");
}

export function judgeReviewAnswer(params: JudgeReviewAnswerParams): ReviewResult {
  const { answer, usedHint, skipped, acceptedAnswers, answerKeywords } = params;

  // Rule 1: skipped
  if (skipped) return "SKIPPED";

  const normalizedAnswer = normalize(answer);

  // Rule 4: empty
  if (normalizedAnswer === "") return "INCORRECT";

  // Rule 2: exact match against acceptedAnswers (normalized)
  const matched = acceptedAnswers.some((accepted) => normalize(accepted) === normalizedAnswer);
  if (matched) {
    return usedHint ? "CORRECT_WITH_HINT" : "CORRECT_INDEPENDENT";
  }

  // Rule 3: contains ALL answerKeywords
  const allKeywordsMatch = answerKeywords.length > 0 && answerKeywords.every((kw) => normalizedAnswer.includes(normalize(kw)));
  if (allKeywordsMatch) {
    return usedHint ? "CORRECT_WITH_HINT" : "CORRECT_INDEPENDENT";
  }

  // Rule 5: otherwise incorrect
  return "INCORRECT";
}
