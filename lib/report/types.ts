/**
 * P4 学习报告领域类型
 * ------------------------------------------------------------
 * 交接单 §3.4：报告能够引用真实学习记录，显示薄弱点和下一任务。
 */

export type ReportPeriod = "7d" | "30d";

/** 记忆状态摘要 */
export interface MemorySummary {
  totalItems: number;
  newItems: number; // 本期新学
  reviewedCount: number; // 本期复习次数
  dueSoon: number; // 即将到期（24h 内）
  /** 按状态分布 */
  statusDistribution: {
    NEW: number;
    EXPOSED: number;
    RECALLED_WITH_HELP: number;
    RECALLED_INDEPENDENTLY: number;
  };
}

/** 复习统计 */
export interface ReviewStats {
  totalReviews: number;
  correctIndependent: number;
  correctWithHint: number;
  incorrect: number;
  skipped: number;
  /** 正确率（independent + hinted / total） */
  correctRate: number;
}

/** 口语观察（交接单 §7.4 四态简化版） */
export interface SpeakingObservation {
  dimension: string;
  occurrenceCount: number;
  /** 是否重复出现（>=2 次） */
  isPattern: boolean;
  latestDescription: string;
  latestSessionId: string;
}

/** 推荐任务 */
export interface RecommendedTask {
  taskType: "REVIEW" | "LEARN_NEW" | "SPEAKING";
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  /** 可选：具体 itemId 或 questionId */
  targetId?: string;
  targetLabel?: string;
}

/** 完整报告 */
export interface ProgressReport {
  period: ReportPeriod;
  generatedAt: string;
  memory: MemorySummary;
  review: ReviewStats;
  speakingObservations: SpeakingObservation[];
  recommendations: RecommendedTask[];
  /** 数据不足时的提示 */
  insufficientData: boolean;
  insufficientDataMessage?: string;
}
