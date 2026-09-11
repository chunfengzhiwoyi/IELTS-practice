/**
 * 复习答案判断（小程序端复刻 · 纯 TS · 确定性）
 */
export type ReviewResult = "CORRECT_INDEPENDENT" | "CORRECT_WITH_HINT" | "INCORRECT" | "SKIPPED";

export interface JudgeReviewAnswerParams {
  answer: string;
  usedHint: boolean;
  skipped: boolean;
  acceptedAnswers: string[];
  answerKeywords: string[];
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[；;、，,。.（）()：:""\'!！?？\-—\s]+/g, "");
}

export function judgeReviewAnswer(params: JudgeReviewAnswerParams): ReviewResult {
  const { answer, usedHint, skipped, acceptedAnswers, answerKeywords } = params;
  if (skipped) return "SKIPPED";
  const normalizedAnswer = normalize(answer);
  if (normalizedAnswer === "") return "INCORRECT";
  const matched = acceptedAnswers.some((accepted) => normalize(accepted) === normalizedAnswer);
  if (matched) return usedHint ? "CORRECT_WITH_HINT" : "CORRECT_INDEPENDENT";
  const allKeywordsMatch =
    answerKeywords.length > 0 && answerKeywords.every((kw) => normalizedAnswer.includes(normalize(kw)));
  if (allKeywordsMatch) return usedHint ? "CORRECT_WITH_HINT" : "CORRECT_INDEPENDENT";
  return "INCORRECT";
}
