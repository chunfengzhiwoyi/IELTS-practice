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
  SuggestedExpression,
  CreateSpeakingSessionRequest,
  CreateSpeakingSessionResponse,
  AnalyzeSpeakingRequest,
  AnalyzeSpeakingResponse,
} from "@/lib/speaking/types";

export type { SpeakingRepository } from "@/lib/speaking/repository";

export { analyzeSpeakingAnswer } from "@/lib/speaking/analysis";
export { getSpeakingRepository } from "@/lib/speaking/service";
export { getAllQuestions, getQuestionById, getQuestionsByPart, pickQuestion } from "@/lib/speaking/question-bank";
export { selectTargetExpressions, MAX_TARGET_EXPRESSIONS, SPEAKING_TOPIC_TAGS } from "@/lib/speaking/target-selection";
export type { TargetCandidate, TargetSelectionSignals } from "@/lib/speaking/target-selection";
export { matchQuestionForTargets } from "@/lib/speaking/question-matching";
export type { QuestionMatchResult } from "@/lib/speaking/question-matching";
