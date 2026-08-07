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
    paraphraseScore: number; // 0-1, 越高越好（越少重复题目原词）
  };
  /** 整体简评（一句话） */
  summary: string;
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
