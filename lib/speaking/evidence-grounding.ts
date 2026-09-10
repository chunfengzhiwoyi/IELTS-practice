/**
 * Evidence Grounding — Shared Primitive (SSOT)
 * -------------------------------------------------------
 * 统一的 evidence grounding 检测逻辑，供 Quality Gate (detection)
 * 和 Evidence Sanitizer (enforcement) 共同使用。
 *
 * 设计原则：
 * - Detection SSOT：gate 和 sanitizer 不各自实现一套 matching
 * - 纯函数，无副作用
 * - 不调用 LLM
 *
 * 历史：BC-M3-004 Safety Patch 前，feedback-quality.ts 和 evidence-sanitizer.ts
 * 各自实现了 grounding matching，存在 drift（sanitizer 去除标点，gate 不去除）。
 * 本模块统一为单一实现。
 */

/**
 * 从用户回答构建关键词集合（去除词尾标点）。
 * 用于 evidence grounding 匹配。
 */
export function buildAnswerWordSet(userAnswer: string): Set<string> {
  const lower = userAnswer.toLowerCase();
  return new Set(
    lower
      .split(/\s+/)
      .map((w) => w.replace(/[.,!?;:，。！？；：""''（）()]+$/g, ""))
      .filter((w) => w.length > 2),
  );
}

/**
 * 数据型 evidence 检测：来自 audioMetadata 的数据不需要文本匹配。
 * 例如 "语速 98 WPM"、"停顿 3 次"、"最长停顿 3.2 秒"。
 */
export function isDataEvidence(evidence: string): boolean {
  return /\d+\s*(wpm|秒|次|%)/i.test(evidence);
}

/**
 * 判断单条 evidence 是否在用户回答中有 grounding。
 *
 * 规则：
 * 1. 数据型 evidence（WPM/秒/次/%）视为 grounded
 * 2. 否则要求 evidence 中至少一个 >3 字母的词（去除标点后）出现在回答关键词集合中
 *
 * @param evidence - 单条 evidence 文本
 * @param answerWords - 由 buildAnswerWordSet 构建的回答关键词集合
 */
export function isEvidenceGrounded(evidence: string, answerWords: Set<string>): boolean {
  const evLower = evidence.toLowerCase();

  // 数据型 evidence（来自 audioMetadata，不需要文本匹配）
  if (isDataEvidence(evLower)) {
    return true;
  }

  // 关键词匹配：evidence 中至少一个 >3 字母的词在回答中出现
  const evWords = evLower
    .split(/[\s，。、！？,.!?;:：；""''（）()]+/)
    .filter((w) => w.length > 3);

  return evWords.some((w) => answerWords.has(w));
}

/**
 * 批量过滤 evidence，返回 grounded 的子集。
 */
export function filterGroundedEvidence(evidenceList: string[], answerWords: Set<string>): string[] {
  return evidenceList.filter((ev) => isEvidenceGrounded(ev, answerWords));
}

/**
 * 检测维度的 evidence 是否全部无 grounding。
 * 用于 Quality Gate 生成 EVIDENCE_MISMATCH issue。
 */
export function hasAnyGroundedEvidence(evidenceList: string[], answerWords: Set<string>): boolean {
  return evidenceList.some((ev) => isEvidenceGrounded(ev, answerWords));
}
