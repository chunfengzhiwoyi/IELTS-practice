/**
 * Feedback Quality Control Layer — 类型定义
 * -------------------------------------------------------
 * Generator 与 Evaluator 分离：
 * - analyze-speaking.ts = Generator（生成分析结果）
 * - feedback-quality.ts = Evaluator（校验结果质量）
 */

/** 校验状态 */
export type QualityStatus = "PASS" | "NEEDS_REVIEW" | "FAIL";

/** 质量问题类型 */
export type QualityIssueType =
  | "MISSING_FIELD"
  | "INVALID_DIMENSION"
  | "NO_EVIDENCE"
  | "EVIDENCE_MISMATCH"
  | "VAGUE_SUGGESTION"
  | "NOT_ACTIONABLE"
  | "BAND_SCORE_LEAK"
  | "IELTS_MISALIGNMENT"
  | "GENERIC_FEEDBACK";

/** 问题严重度 */
export type QualityIssueSeverity = "critical" | "major" | "minor";

/** 单条质量问题 */
export interface FeedbackQualityIssue {
  type: QualityIssueType;
  severity: QualityIssueSeverity;
  description: string;
  /** 涉及的字段路径（便于调试） */
  fieldPath: string;
}

/** 校验结果 */
export interface FeedbackQualityResult {
  status: QualityStatus;
  /** 检测到的问题列表 */
  issues: FeedbackQualityIssue[];
  /** 质量分数（0-100） */
  score: number;
  /** 校验时间 */
  checkedAt: string;
}
