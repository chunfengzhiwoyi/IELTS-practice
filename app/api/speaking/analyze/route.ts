/**
 * POST /api/speaking/analyze
 * ------------------------------------------------------------
 * 分析口语回答：LLM 深度分析，降级回退到规则引擎。
 * M1: 能力观察和效果评估在服务端统一写入 Repository。
 * M2 Phase 2: state.read / rule.applied / state.write 埋点
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getQuestionById } from "@/lib/speaking";
import { getSpeakingRepository, getAbilityRepository, getEvaluationRepository } from "@/lib/repository-factory";
import { analyzeSpeakingWithLlm } from "@/lib/llm/tasks/analyze-speaking";
import { getUserOverrideProviders } from "@/lib/llm/user-config";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { startTrace, endTraceSuccess, endTraceError, appErrorToTrace } from "@/lib/observability/trace-api-helper";
import { canonicalStateHash } from "@/lib/observability/trace-context";
import { writeAbilityObservationsServer } from "@/lib/ability/server-writer";
import { buildSpeakingAbilityProfileFromObservations } from "@/lib/ability/profile-builder";
import { retrieveAbilityContext, type AbilityMemoryContext } from "@/lib/ability/memory-retriever";
import { computeSessionEvaluation } from "@/lib/evaluation/evaluation-builder";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

const RequestSchema = z.object({
  sessionId: z.string().min(1),
  answer: z.string().min(1, "回答不能为空").max(5000),
  isSecondAnswer: z.boolean().default(false),
  audioMetadata: z.object({
    duration: z.number(),
    speakingTime: z.number(),
    wpm: z.number(),
    pauses: z.object({
      pauseCount: z.number(),
      totalPauseDuration: z.number(),
      longestPause: z.number(),
      averagePauseDuration: z.number(),
    }),
    wordTimestamps: z.array(z.object({
      word: z.string(),
      start: z.number(),
      end: z.number(),
    })).optional(),
  }).optional(),
  abilityContext: z.object({
    weakestDimension: z.string().nullable(),
    weakestLevel: z.string().nullable(),
    recurringIssues: z.array(z.string()),
    recentTrends: z.record(z.string(), z.enum(["improving", "stable", "declining"])),
    nextFocusSummary: z.string().nullable(),
    totalSessions: z.number(),
  }).optional(),
});

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const bodyRaw = await request.json().catch(() => null);
  const rawSessionId = bodyRaw && typeof bodyRaw.sessionId === "string" ? bodyRaw.sessionId : null;
  const rawAnswer = bodyRaw && typeof bodyRaw.answer === "string" ? bodyRaw.answer : null;
  const tctx = startTrace(traceId, "/api/speaking/analyze", {
    input_summary: rawSessionId ? "sessionId=" + rawSessionId + ", answerLen=" + (rawAnswer?.length ?? 0) + ", answer=" + (rawAnswer ?? "").slice(0, 200) : "invalid body",
    session_id: rawSessionId ?? "",
    method: "POST",
  });
  try {
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    tctx.trace.setUser(user.id);
    const { sessionId, answer, isSecondAnswer, audioMetadata, abilityContext: clientAbilityContext } = parsed.data;
    const repo = getSpeakingRepository();

    // ---- state.read: speaking_session ----
    const session = await repo.getSession(sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND", `会话 ${sessionId} 不存在`, traceId);
    }
    tctx.emitStateRead({
      entity: "speaking_session",
      keys: { userId: user.id, sessionId },
      snapshot_summary: `questionId=${session.questionId}, hasFirstAnswer=${!!session.firstAnswer}, hasSecondAnswer=${!!session.secondAnswer}`,
    });

    const questionData = getQuestionById(session.questionId);
    if (!questionData) {
      throw new AppError("INTERNAL", `题目数据丢失: ${session.questionId}`, traceId);
    }

    // M1: 服务端构建能力上下文
    let abilityContext: AbilityMemoryContext | null = clientAbilityContext
      ? {
          weakestDimension: clientAbilityContext.weakestDimension as AbilityMemoryContext["weakestDimension"],
          weakestLevel: clientAbilityContext.weakestLevel as AbilityMemoryContext["weakestLevel"],
          recurringIssues: clientAbilityContext.recurringIssues,
          recentTrends: clientAbilityContext.recentTrends as AbilityMemoryContext["recentTrends"],
          nextFocusSummary: clientAbilityContext.nextFocusSummary,
          totalSessions: clientAbilityContext.totalSessions,
        }
      : null;
    if (!abilityContext) {
      try {
        const abilityRepo = getAbilityRepository();
        const allObservations = await abilityRepo.getAll(user.id);
        // ---- state.read: ability_observations ----
        tctx.emitStateRead({
          entity: "ability_observations",
          keys: { userId: user.id },
          snapshot_summary: `total_observations=${allObservations.length}`,
        });
        const profile = buildSpeakingAbilityProfileFromObservations(user.id, allObservations);
        abilityContext = retrieveAbilityContext(profile);
      } catch {
        // 能力上下文构建失败不影响主流程
      }
    }

    // LLM 深度分析（含降级到规则引擎）
    const analysis = await analyzeSpeakingWithLlm(
      answer,
      questionData,
      traceId,
      audioMetadata ?? undefined,
      abilityContext ?? undefined,
      { overrideProviders: await getUserOverrideProviders() ?? undefined },
    );

    const fallbackUsed = analysis.ieltsAnalysis === undefined;

    // ---- fallback.triggered: 规则引擎降级（Case 021/036）----
    if (fallbackUsed) {
      tctx.emitFallbackTriggered({
        trigger_error_code: "LLM_ANALYSIS_UNAVAILABLE",
        chain_snapshot: [
          { step: "llm_analyze", from: "llm", to: "llm", status: "used" },
          { step: "rule_engine", from: "llm", to: "rule_engine", status: "used" },
        ],
        degradation_flag: true,
        to_kind: "rule_based_analysis",
      });
    }

    // ---- rule.applied: speaking_rule_engine（LLM 降级时）----
    if (fallbackUsed) {
      tctx.emitRuleApplied({
        rule_key: "speaking_rule_engine",
        inputs: {
          answer_length: answer.length,
          question_part: questionData.part,
          llm_failed: true,
        },
        outputs: {
          main_issue: analysis.mainIssue?.dimension ?? "unknown",
          main_issue_severity: analysis.mainIssue?.severity ?? "unknown",
          candidate_count: analysis.candidateIssues?.length ?? 0,
          llm_call_count: 0,
        },
        llm_call_count: 0,
      });
    }

    // Update session
    let updatedSession;
    if (isSecondAnswer) {
      updatedSession = await repo.updateSecondAnswer(sessionId, answer, analysis);
    } else {
      updatedSession = await repo.updateFirstAnswer(sessionId, answer, analysis);
    }

    // ---- state.write: speaking_session ----
    tctx.emitStateWrite({
      entity: "speaking_session",
      keys: { userId: user.id, sessionId },
      idempotency_outcome: "inserted",
      state_before: {
        hasFirstAnswer: !!session.firstAnswer,
        hasSecondAnswer: !!session.secondAnswer,
      },
      state_after: {
        hasFirstAnswer: !!updatedSession.firstAnswer,
        hasSecondAnswer: !!updatedSession.secondAnswer,
        hasIeltsAnalysis: !fallbackUsed,
      },
      canonical_state_hash: canonicalStateHash({
        hasFirstAnswer: !!updatedSession.firstAnswer,
        hasSecondAnswer: !!updatedSession.secondAnswer,
        hasIeltsAnalysis: !fallbackUsed,
      }),
    });

    // M1: 服务端写入能力观察（不阻塞主流程）
    let observationsWritten = 0;
    try {
      const writeResult = await writeAbilityObservationsServer({
        userId: user.id,
        sessionId,
        analysis,
      });
      observationsWritten = writeResult.written;

      // ---- rule.applied: observation_promotion ----
      if (writeResult.written > 0) {
        tctx.emitRuleApplied({
          rule_key: "observation_promotion",
          inputs: {
            hasIeltsAnalysis: !fallbackUsed,
            dimensions_extracted: writeResult.observations.map((o) => o.dimension),
          },
          outputs: {
            written: writeResult.written,
            skipped: writeResult.skipped,
            dimensions_persisted: writeResult.observations.map((o) => o.dimension),
          },
        });
      }

      // ---- state.write: ability_observation ----
      if (writeResult.written > 0) {
        tctx.emitStateWrite({
          entity: "ability_observation",
          keys: { userId: user.id, sessionId },
          idempotency_outcome: "inserted",
          state_before: null,
          state_after: {
            written: writeResult.written,
            dimensions: writeResult.observations.map((o) => ({ dimension: o.dimension, level: o.level })),
          },
          observation_persisted_flag: true,
        });
      }
    } catch (err) {
      logger.warn("ability_write_failed", { traceId, sessionId, error: err instanceof Error ? err.message : String(err) });
    }

    // M1: 二次回答后服务端计算并保存效果评估（不阻塞主流程）
    if (isSecondAnswer) {
      try {
        const evaluation = computeSessionEvaluation(updatedSession);
        if (evaluation) {
          const evalRepo = getEvaluationRepository();
          await evalRepo.save(evaluation);

          // ---- state.write: speaking_evaluation ----
          tctx.emitStateWrite({
            entity: "speaking_evaluation",
            keys: { userId: user.id, sessionId },
            idempotency_outcome: "inserted",
            state_before: null,
            state_after: {
              feedbackAdopted: evaluation.feedbackAdopted,
              overallChange: evaluation.overallChange,
              feedbackEffectiveness: evaluation.feedbackEffectiveness,
              issueResolutionRate: evaluation.issueResolutionRate,
            },
            canonical_state_hash: canonicalStateHash({
              overallChange: evaluation.overallChange,
              feedbackEffectiveness: evaluation.feedbackEffectiveness,
              issueResolutionRate: evaluation.issueResolutionRate,
              dimensionChanges: evaluation.dimensionChanges,
            }),
          });
        }
      } catch (err) {
        logger.warn("evaluation_save_failed", { traceId, sessionId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const resp = NextResponse.json(
      { analysis, session: updatedSession },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
    return endTraceSuccess(tctx, resp, `speaking analysis, isSecondAnswer=${isSecondAnswer}, hasIeltsAnalysis=${!fallbackUsed}, observationsWritten=${observationsWritten}`, fallbackUsed);
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status =
      appErr.kind === "AUTH_REQUIRED" ? 401
        : appErr.kind === "INVALID_INPUT" ? 400
          : appErr.kind === "NOT_FOUND" ? 404
            : 500;
    const { code, message } = appErrorToTrace(err);
    endTraceError(tctx, status, code, message);
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
