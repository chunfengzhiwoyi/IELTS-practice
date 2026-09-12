/**
 * P3 口语训练领域类型
 */

export type SpeakingPart = "P1" | "P2" | "P3";

export type SpeakingDimension = "fluency" | "vocabulary" | "coherence" | "development" | "argumentation";

/** 本地题库条目 */
export interface SpeakingQuestion {
  questionId: string;
  part: SpeakingPart;
  topic: string;
  question: string;
  questionZh: string;
  followUps: string[];
  expectedLength: { min: number; ideal: number; max: number };
  keyTopicWords: string[];
  goodConnectors: string[];
  dimensions: SpeakingDimension[];
}

/** 分析结果中的单个问题 */
export interface SpeakingIssue {
  dimension: SpeakingDimension;
  severity: "minor" | "major";
  description: string;
  suggestion: string;
}

/** 微训练 */
export interface MicroDrill {
  prompt: string;
  exampleImprovement: string;
  targetDimension: SpeakingDimension;
}

/** 首答/重答分析结果 */
export interface SpeakingAnalysisResult {
  /** 所有检测到的候选问题 */
  candidateIssues: SpeakingIssue[];
  /** 每轮只选一个主要问题 */
  mainIssue: SpeakingIssue;
  /** 对应主要问题的微训练 */
  microDrill: MicroDrill;
  /** 基础指标 */
  metrics: {
    wordCount: number;
    sentenceCount: number;
    connectorCount: number;
    uniqueWordRatio: number;
    paraphraseScore: number;
  };
  /** 整体简评（一句话） */
  summary: string;
  /** Phase 3: IELTS 四维度深度分析（语音回答时填充，文字回答可能部分为 null） */
  ieltsAnalysis?: IeltsSpeakingAnalysis;
  /**
   * PRODUCT-LOOP-04B — 经过确定性 validator 固化的口语目标表达证据。
   * 仅记录（evidence recording），绝不直接映射/写入长期 Vocabulary state。
   * 不进入用户可见 UI（内部证据对象）。
   */
  targetExpressionEvidence?: ValidatedTargetExpressionEvidence[];
  /** Quality Gate: 质量警告（NEEDS_REVIEW 时附加） */
  qualityWarning?: {
    score: number;
    issues: string[];
    /** BC-M3-004: evidence sanitization 执行信息 */
    sanitization?: {
      applied: boolean;
      evidenceRemoved: number;
      affectedDimensions: string[];
      replacedFields: string[];
    };
  };
}

/** IELTS Speaking 四维度分析结果 */
export interface IeltsSpeakingAnalysis {
  fluency: DimensionAnalysis | null;
  lexicalResource: DimensionAnalysis | null;
  grammaticalRange: DimensionAnalysis | null;
  /** pronunciation 需要专用 API（Phase 4），当前为 null */
  pronunciation: DimensionAnalysis | null;
  /** 综合诊断（不给分数，只给定位） */
  overallDiagnosis: string;
  /** 优先改善建议（排序） */
  prioritizedSuggestions: string[];
}

/** 单维度分析 */
export interface DimensionAnalysis {
  /** 维度名称（用户可见） */
  label: string;
  /** 表现级别：strong / adequate / developing / weak */
  level: "strong" | "adequate" | "developing" | "weak";
  /** 具体证据（引用用户原话或数据） */
  evidence: string[];
  /** 问题诊断 */
  issues: string[];
  /** 改善建议 */
  suggestions: string[];
}

/** 口语会话状态 */
export type SpeakingSessionStatus = "IN_PROGRESS" | "COMPLETED";

/**
 * PRODUCT-LOOP-02C — 建议表达（V1）
 * 会话响应级上下文（response-level，V1 不持久化到 session schema，避免 DB migration）。
 * OPTIONAL 提示：用户可自由忽略，不影响评分。
 */
export interface SuggestedExpression {
  itemId: string;
  canonicalForm: string;
  meaning: string;
  /** 选择理由（用户可见，简短） */
  reason?: string;
  /** 自然适配的话题（question.topic） */
  matchedTopic?: string;
}

/** 目标表达使用证据：LLM 单次分析调用内输出的原始证据（raw contract） */
export type TargetExpressionUsageAssessment = "CORRECT" | "ISSUE" | "UNCERTAIN" | "NOT_USED";

/**
 * 原始 LLM evidence（EnhancedAnalysisSchema.targetExpressionUsageEvidence 元素）。
 * - 与 ieltsAnalysis 平级的可选子对象，同一 LLM 调用内输出（禁止第二次 LLM call）。
 * - 每个 itemId 一条；per-item 独立判定。
 * - NOT_USED = 未使用（OPTIONAL 契约，非失败、无惩罚）。
 */
export interface TargetExpressionUsageEvidence {
  itemId: string;
  attempted: boolean;
  /** 用户 answer 的真实文本 span；CORRECT/ISSUE 必须非空且 grounding 到 answer；NOT_USED 必须为 null */
  quote: string | null;
  assessment: TargetExpressionUsageAssessment;
  /** 判定理由（简短） */
  reason: string;
}

/**
 * 确定性 validator 固化后的证据（Validated Evidence）。
 * 长期系统后续只能消费本类型；raw LLM 输出不得直接进入任何状态。
 */
export interface ValidatedTargetExpressionEvidence {
  itemId: string;
  attempted: boolean;
  quote: string | null;
  assessment: TargetExpressionUsageAssessment;
  reason: string;
  /** 仅 assessment === CORRECT（且通过全部校验）为 true；UNCERTAIN 永不为 true */
  upgradeCandidate: boolean;
  /** validator 施加的降级/修复说明（如 grounding 失败、duplicate 冲突、missing、echo 守卫） */
  validatorNotes: string[];
}

/** evidence 管线可观测计数（trace payload 使用） */
export interface TargetExpressionEvidenceSummary {
  targetCount: number;
  rawEvidenceCount: number;
  validatedEvidenceCount: number;
  correctCount: number;
  issueCount: number;
  uncertainCount: number;
  notUsedCount: number;
  groundingDowngradeCount: number;
  droppedItemIds: string[];
}

/** 口语会话（一次完整的题目回答） */
export interface SpeakingSession {
  id: string;
  userId: string;
  questionId: string;
  part: SpeakingPart;
  topic: string;
  question: string;
  firstAnswer: string | null;
  firstAnalysis: SpeakingAnalysisResult | null;
  secondAnswer: string | null;
  secondAnalysis: SpeakingAnalysisResult | null;
  status: SpeakingSessionStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * PRODUCT-LOOP-04B — 服务端冻结的目标表达快照（server authority）。
   * session 创建时由服务端确定并随 session 持久化；analyze 阶段按 sessionId
   * 读回，禁止客户端注入、禁止 analyze 时重新 selectTargetExpressions。
   * Memory 实现完整保存；Supabase 无对应列（不新增 migration）→ 读回恒为 []，
   * 即 SUPABASE_EVIDENCE_PERSISTENCE = NOT_IMPLEMENTED（见 04B 文档）。
   */
  suggestedExpressions?: SuggestedExpression[];
}

/** API: 创建口语会话的请求 */
export interface CreateSpeakingSessionRequest {
  part?: SpeakingPart;
  topic?: string;
  questionId?: string;
}

/** API: 创建口语会话的响应 */
export interface CreateSpeakingSessionResponse {
  session: SpeakingSession;
  questionData: SpeakingQuestion;
  /** PRODUCT-LOOP-02C: OPTIONAL 建议表达（无匹配时为空数组） */
  suggestedExpressions?: SuggestedExpression[];
}

/** API: 分析请求 */
export interface AnalyzeSpeakingRequest {
  sessionId: string;
  answer: string;
  isSecondAnswer: boolean;
}

/** API: 分析响应 */
export interface AnalyzeSpeakingResponse {
  analysis: SpeakingAnalysisResult;
  session: SpeakingSession;
}
