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
  TargetExpressionUsageAssessment,
  TargetExpressionUsageEvidence,
  ValidatedTargetExpressionEvidence,
  TargetExpressionEvidenceSummary,
} from "@/lib/speaking/types";

export type { SpeakingRepository } from "@/lib/speaking/repository";

export { analyzeSpeakingAnswer } from "@/lib/speaking/analysis";
export { getSpeakingRepository } from "@/lib/speaking/service";
export { getAllQuestions, getQuestionById, getQuestionsByPart, pickQuestion } from "@/lib/speaking/question-bank";
export { selectTargetExpressions, MAX_TARGET_EXPRESSIONS, SPEAKING_TOPIC_TAGS } from "@/lib/speaking/target-selection";
export type { TargetCandidate, TargetSelectionSignals } from "@/lib/speaking/target-selection";
export { matchQuestionForTargets } from "@/lib/speaking/question-matching";
export type { QuestionMatchResult } from "@/lib/speaking/question-matching";
export {
  validateTargetExpressionEvidence,
  conservativeEvidenceForTargets,
  normalizeEvidenceText,
  quoteInAnswer,
  MISSING_EVIDENCE_REASON,
  DUPLICATE_CONFLICT_REASON,
  ECHO_GUARD_REASON,
  ANALYSIS_FALLBACK_REASON,
} from "@/lib/speaking/target-expression-evidence-validator";
export type { ValidateEvidenceInput, ValidateEvidenceResult } from "@/lib/speaking/target-expression-evidence-validator";
