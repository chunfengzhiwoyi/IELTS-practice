/**
 * Speaking 模块公开 API
 */
import "server-only";

export type {
  SpeakingPart,
  SpeakingDimension,
  SpeakingQuestion,
  SpeakingIssue,
  MicroDrill,
  SpeakingAnalysisResult,
  SpeakingSession,
  SpeakingSessionStatus,
  CreateSpeakingSessionRequest,
  CreateSpeakingSessionResponse,
  AnalyzeSpeakingRequest,
  AnalyzeSpeakingResponse,
} from "@/lib/speaking/types";

export type { SpeakingRepository } from "@/lib/speaking/repository";

export { analyzeSpeakingAnswer } from "@/lib/speaking/analysis";
export { getSpeakingRepository } from "@/lib/speaking/service";
export { getAllQuestions, getQuestionById, getQuestionsByPart, pickQuestion } from "@/lib/speaking/question-bank";
