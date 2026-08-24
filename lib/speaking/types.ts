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
  /** Quality Gate: 质量警告（NEEDS_REVIEW 时附加） */
  qualityWarning?: {
    score: number;
    issues: string[];
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
