/**
 * PRODUCT-LOOP-02C — Question Matching（V1）
 * ------------------------------------------------------------
 * Vocabulary → Speaking：目标表达 ↔ 静态题库的自然匹配。
 *
 * 原则（PRODUCT-LOOP-02C-IMPLEMENT §5）：
 *  - 自然匹配才带 target；无可靠匹配 → targets = []，走现有普通 Speaking 出题（SAFE FALLBACK，不是错误）。
 *  - 不跨 Part 为塞表达强行选题。
 *
 * 匹配轴（确定性，无 LLM）：
 *  target.topicTags 与 question.topic / question.keyTopicWords 的大小写不敏感重叠。
 */
import type { SpeakingQuestion } from "@/lib/speaking/types";
import type { TargetCandidate } from "@/lib/speaking/target-selection";

export interface QuestionMatchResult {
  /** 匹配到的题；无可靠匹配时为 null（调用方走 SAFE FALLBACK） */
  question: SpeakingQuestion | null;
  /** 与所选题目有自然重叠的目标表达（只建议真正适配该题的） */
  matchedTargets: TargetCandidate[];
  /** 总匹配分（>0 才认为可靠） */
  matchScore: number;
}

/** 是否命中（question 文本片段与 target tag 互为子串，大小写不敏感） */
function textHits(tag: string, haystacks: string[]): boolean {
  const tagLower = tag.toLowerCase();
  return haystacks.some((h) => {
    const hLower = h.toLowerCase();
    return hLower.includes(tagLower) || tagLower.includes(hLower);
  });
}

/**
 * 目标表达 ↔ 题库确定性匹配。
 *
 * @param questions 候选池（调用方应已按 part / topic 过滤；本函数不再跨 part）
 * @param targets   已选目标表达（至多 2 个）
 * @param targetTopicTags itemId → topicTags（用于匹配轴；选择阶段已确保含口语标记）
 * @returns 最佳匹配题 + 与它自然重叠的目标；无匹配 → { question: null, ... }
 */
export function matchQuestionForTargets(
  questions: SpeakingQuestion[],
  targets: TargetCandidate[],
  targetTopicTags: (itemId: string) => string[],
): QuestionMatchResult {
  if (questions.length === 0 || targets.length === 0) {
    return { question: null, matchedTargets: [], matchScore: 0 };
  }

  let bestScore = 0;
  let bestQuestion: SpeakingQuestion | null = null;

  for (const question of questions) {
    const haystacks = [question.topic, ...(question.keyTopicWords ?? [])];
    let score = 0;
    for (const target of targets) {
      const tags = targetTopicTags(target.itemId);
      for (const tag of tags) {
        if (textHits(tag, haystacks)) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestQuestion = question;
    }
  }

  if (!bestQuestion || bestScore < 1) {
    return { question: null, matchedTargets: [], matchScore: 0 };
  }

  // 只建议与所选题目有真实重叠的目标
  const haystacks = [bestQuestion.topic, ...(bestQuestion.keyTopicWords ?? [])];
  const matchedTargets = targets.filter((t) =>
    targetTopicTags(t.itemId).some((tag) => textHits(tag, haystacks)),
  );

  return { question: bestQuestion, matchedTargets, matchScore: bestScore };
}
