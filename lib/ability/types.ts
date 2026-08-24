/**
 * Ability Observation Layer — 类型定义
 * -------------------------------------------------------
 * Phase 4.1: 将 Speaking Analysis 结果沉淀为结构化用户能力观察。
 *
 * 设计原则：
 * - observation 是事实记录，不是评分
 * - 每次分析产生多条 observation（每维度一条）
 * - evidence_status 由 Writer 根据历史自动升迁
 * - 不存储 Band 分数，只存定性 level
 */

/** 口语分析维度 key（对齐 IeltsSpeakingAnalysis） */
export type SpeakingDimensionKey =
  | "fluency"
  | "lexicalResource"
  | "grammaticalRange"
  | "pronunciation";

/** 能力表现级别（对齐 DimensionAnalysis.level） */
export type AbilityLevel = "strong" | "adequate" | "developing" | "weak";

/**
 * 证据状态生命周期：
 * SINGLE_OBSERVATION → REPEATED_PATTERN → IMPROVING → RESOLVED
 *                                      ↘ DISPUTED（回退）
 */
export type EvidenceStatus =
  | "SINGLE_OBSERVATION"
  | "REPEATED_PATTERN"
  | "IMPROVING"
  | "DISPUTED"
  | "RESOLVED";

/** 观察来源类型 */
export type ObservationSourceType = "SPEAKING" | "REVIEW" | "LEARNING";

/** 单条能力观察记录 */
export interface AbilityObservation {
  id: string;
  userId: string;
  /** 能力维度 */
  dimension: SpeakingDimensionKey;
  /** 本次评估的能力级别 */
  level: AbilityLevel;
  /** LLM 诊断的具体问题（来自 DimensionAnalysis.issues） */
  issues: string[];
  /** 证据引用（来自 DimensionAnalysis.evidence） */
  evidence: string[];
  /** 改善建议摘要（来自 DimensionAnalysis.suggestions，取前 2 条） */
  suggestions: string[];
  /** 证据状态（Writer 根据历史自动计算） */
  evidenceStatus: EvidenceStatus;
  /** 来源类型 */
  sourceType: ObservationSourceType;
  /** 来源 ID（speaking session ID） */
  sourceId: string;
  /** 可选备注 */
  note: string | null;
  /** 创建时间 */
  createdAt: string;
}

/** 写入 observation 的输入参数（不含 id、createdAt、evidenceStatus 等自动字段） */
export interface WriteObservationInput {
  userId: string;
  dimension: SpeakingDimensionKey;
  level: AbilityLevel;
  issues: string[];
  evidence: string[];
  suggestions: string[];
  sourceType: ObservationSourceType;
  sourceId: string;
  note?: string;
}
