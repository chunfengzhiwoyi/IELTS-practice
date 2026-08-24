/**
 * AI Evaluation Pipeline — 类型定义
 * -------------------------------------------------------
 * Phase 5: 评估 AI Feedback 是否真正帮助用户改善口语表现。
 *
 * 核心问题：用户收到反馈并重答后，表现是否有提升？
 *
 * 注意：dimensionChanges 表示 AI 诊断等级变化，
 * 不是绝对能力提升（同一 LLM 在不同回答上的评估差异）。
 */

/** 反馈有效性判断 */
export type FeedbackEffectiveness = "effective" | "uncertain" | "ineffective";

/** 整体变化方向 */
export type OverallChange = "improved" | "stable" | "declined";

/** 单次 Session 的效果评估 */
export interface SpeakingEvaluation {
  /** 关联的 session ID */
  sessionId: string;
  /** 用户 ID */
  userId: string;
  /** 用户是否采纳反馈（完成了第二次回答） */
  feedbackAdopted: boolean;
  /** 各维度等级变化（second.level - first.level，-3 ~ +3） */
  dimensionChanges: {
    fluency: number | null;
    lexicalResource: number | null;
    grammaticalRange: number | null;
  };
  /** 首次分析中被解决的问题（第二次不再出现） */
  resolvedIssues: string[];
  /** 首次分析中仍然存在的问题 */
  unresolvedIssues: string[];
  /** Issue 解决率（0-1） */
  issueResolutionRate: number;
  /** 反馈有效性判断 */
  feedbackEffectiveness: FeedbackEffectiveness;
  /** 整体变化方向 */
  overallChange: OverallChange;
  /** 评估时间 */
  evaluatedAt: string;
}
