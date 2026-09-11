/**
 * 口语训练领域类型（小程序端复刻）
 */
export type SpeakingPart = "P1" | "P2" | "P3";
export type SpeakingDimension = "fluency" | "vocabulary" | "coherence" | "development" | "argumentation";

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

export interface SpeakingIssue {
  dimension: SpeakingDimension;
  severity: "minor" | "major";
  description: string;
  suggestion: string;
}

export interface MicroDrill {
  prompt: string;
  exampleImprovement: string;
  targetDimension: SpeakingDimension;
}

export interface SpeakingAnalysisResult {
  candidateIssues: SpeakingIssue[];
  mainIssue: SpeakingIssue;
  microDrill: MicroDrill;
  metrics: {
    wordCount: number;
    sentenceCount: number;
    connectorCount: number;
    uniqueWordRatio: number;
    paraphraseScore: number;
  };
  summary: string;
}

export type SpeakingSessionStatus = "IN_PROGRESS" | "COMPLETED";

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
  /** 本次口语作答总耗时（毫秒），完成后写入，缺省 0 */
  durationMs?: number;
}
