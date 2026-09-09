/**
 * POST /api/learn/submit
 * ------------------------------------------------------------
 * 提交学习结果：LLM 语义判题 + 降级关键词匹配
 * M1: 使用中央 repository-factory
 * M2 Phase 2: state.read / rule.applied / state.write 埋点
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  type EventCorrectness,
  type LearningStatus,
  type LearnSubmitResponse,
} from "@/lib/learning";
import { getLearningRepository } from "@/lib/repository-factory";
import { getAllSeedItems } from "@/lib/learning/seed-catalog";
import { isAnswerContentEmpty } from "@/lib/learning/answer-content";
import { judgeAnswerWithLlm } from "@/lib/llm/tasks/judge-answer";
import {
  computeInitialReviewAt,
  initialIntervalDays,
  type InitialScheduleQuality,
} from "@/lib/review/initial-schedule";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { startTrace, endTraceSuccess, endTraceError, appErrorToTrace } from "@/lib/observability/trace-api-helper";
import { canonicalStateHash } from "@/lib/observability/trace-context";

export const runtime = "nodejs";

const RequestSchema = z.object({
  itemId: z.string().min(1),
  taskType: z.enum(["MEANING_RECALL", "PERSONAL_SENTENCE"]),
  answer: z.string().max(2000),
  usedHint: z.boolean(),
  clientEventId: z.string().min(1),
});

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const tctx = startTrace(traceId, "/api/learn/submit", {
    input_summary: "learn submit",
    client_event_id: "",
    method: "POST",
  });
  try {
    const bodyRaw = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    const { itemId, taskType, answer, usedHint, clientEventId } = parsed.data;
    const repo = getLearningRepository();

    // ---- state.read: user_item_state ----
    const existingState = await repo.getUserItemState(user.id, itemId);
    tctx.emitStateRead({
      entity: "user_item_state",
      keys: { userId: user.id, itemId },
      snapshot_summary: existingState
        ? `status=${existingState.status}, recallLevel=${existingState.recallLevel}, nextReviewAt=${existingState.nextReviewAt}`
        : "no prior state (first learn)",
      state_not_found: !existingState,
    });

    const seed = getAllSeedItems().find((s) => s.itemId === itemId);
    const item = await repo.getItemById(itemId);
    const term = seed?.term ?? item?.canonicalForm ?? itemId;
    const coreMeaning = seed?.coreMeaning ?? item?.contentJson?.coreMeaning ?? "";
    const acceptedAnswers = seed?.acceptedAnswers ?? [coreMeaning];
    const answerKeywords = seed?.answerKeywords ?? [];

    const { correctness, feedback, status, scheduleQuality, shortCircuited } = await judgeLearnAnswer({
      term,
      coreMeaning,
      answer,
      usedHint,
      acceptedAnswers,
      answerKeywords,
      traceId,
    });

    // ---- rule.applied: empty_answer_short_circuit ----
    if (shortCircuited) {
      tctx.emitRuleApplied({
        rule_key: "empty_answer_short_circuit",
        inputs: { answer_empty: true, content_empty: true, itemId },
        outputs: { correctness: "FAIL", status: "EXPOSED", scheduleQuality: "FAIL", llm_call_count: 0 },
        llm_call_count: 0,
      });
    }

    // ---- rule.applied: learning_branch_map ----
    tctx.emitRuleApplied({
      rule_key: "learning_branch_map",
      inputs: { correctness, usedHint, shortCircuited },
      outputs: { status, scheduleQuality, llm_call_count: shortCircuited ? 0 : 1 },
      llm_call_count: shortCircuited ? 0 : 1,
    });

    const nextReviewAt = computeInitialReviewAt(scheduleQuality);
    const intervalDays = initialIntervalDays(scheduleQuality);

    // ---- state.write: learning_event ----
    const { event, created } = await repo.createLearningEvent({
      userId: user.id,
      itemId,
      eventType: "NEW",
      taskType,
      answer: answer || null,
      correctness,
      hintLevel: usedHint ? 1 : 0,
      resultJson: { feedback, scheduleQuality },
      clientEventId,
      traceId,
    });

    tctx.emitStateWrite({
      entity: "learning_event",
      keys: { userId: user.id, itemId, eventId: event.id },
      event_id: event.id,
      client_event_id: clientEventId,
      idempotency_outcome: created ? "inserted" : "duplicate_ignored",
      state_before: null,
      state_after: { eventType: "NEW", correctness, taskType },
      canonical_state_hash: canonicalStateHash({ eventType: "NEW", correctness, taskType }),
    });

    // M1 FINAL: 显式幂等 Contract — created=false 表示重复提交，不更新 state
    if (!created) {
      const currentState = await repo.getUserItemState(user.id, itemId);
      const prevFeedback = (event.resultJson?.feedback as string) ?? feedback;
      const resp = NextResponse.json(
        {
          eventId: event.id,
          correctness: event.correctness,
          status: currentState?.status ?? status,
          feedback: prevFeedback,
          nextReviewAt: currentState?.nextReviewAt ?? nextReviewAt,
          state: currentState,
        },
        { status: 200, headers: { "x-trace-id": traceId, "x-idempotent-replay": "true" } },
      );
      return endTraceSuccess(tctx, resp, `idempotent replay: correctness=${event.correctness}`, false, true);
    }

    // ---- state.write: user_item_state ----
    const stateBefore = existingState
      ? {
          status: existingState.status,
          recallLevel: existingState.recallLevel,
          consecutiveCorrect: existingState.consecutiveCorrect,
          nextReviewAt: existingState.nextReviewAt,
        }
      : null;

    const newState = await repo.upsertUserItemState({
      userId: user.id,
      itemId,
      status,
      recognitionLevel: correctness === "INDEPENDENT" ? 1 : (existingState?.recognitionLevel ?? 0),
      recallLevel: correctness === "INDEPENDENT" ? 1 : correctness === "HINTED" ? 1 : 0,
      applicationLevel: 0,
      consecutiveCorrect: correctness === "INDEPENDENT" ? (existingState?.consecutiveCorrect ?? 0) + 1 : 0,
      currentIntervalDays: intervalDays,
      nextReviewAt,
    });

    tctx.emitStateWrite({
      entity: "user_item_state",
      keys: { userId: user.id, itemId },
      idempotency_outcome: "inserted",
      state_before: stateBefore,
      state_after: {
        status: newState.status,
        recallLevel: newState.recallLevel,
        consecutiveCorrect: newState.consecutiveCorrect,
        nextReviewAt: newState.nextReviewAt,
      },
      canonical_state_hash: canonicalStateHash({
        status: newState.status,
        recallLevel: newState.recallLevel,
        consecutiveCorrect: newState.consecutiveCorrect,
        nextReviewAt: newState.nextReviewAt,
      }),
      next_review_at_before: existingState?.nextReviewAt ?? null,
      next_review_at_after: newState.nextReviewAt,
    });

    const response: LearnSubmitResponse = {
      eventId: event.id,
      correctness,
      status,
      feedback,
      nextReviewAt,
      state: newState,
    };

    const resp = NextResponse.json(response, { status: 200, headers: { "x-trace-id": traceId } });
    return endTraceSuccess(tctx, resp, `correctness=${correctness}, status=${status}`);
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    const { code, message } = appErrorToTrace(err);
    endTraceError(tctx, status, code, message);
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}

interface JudgeResult {
  correctness: EventCorrectness;
  feedback: string;
  status: LearningStatus;
  scheduleQuality: InitialScheduleQuality;
  shortCircuited: boolean;
}

async function judgeLearnAnswer(params: {
  term: string;
  coreMeaning: string;
  answer: string;
  usedHint: boolean;
  acceptedAnswers: string[];
  answerKeywords: string[];
  traceId: string;
}): Promise<JudgeResult> {
  const { term, coreMeaning, answer, usedHint, traceId } = params;

  if (isAnswerContentEmpty(answer)) {
    return {
      correctness: "FAIL",
      feedback: "未提供答案，建议再试一次。",
      status: "EXPOSED",
      scheduleQuality: "FAIL",
      shortCircuited: true,
    };
  }

  const llmResult = await judgeAnswerWithLlm({
    term,
    coreMeaning,
    userAnswer: answer,
    acceptedAnswers: params.acceptedAnswers,
    answerKeywords: params.answerKeywords,
    traceId,
  });

  if (llmResult.correct) {
    if (usedHint) {
      return {
        correctness: "HINTED",
        feedback: `正确！「${term}」= ${coreMeaning}。${llmResult.explanation}（使用了提示，下次试着独立回忆）`,
        status: "RECALLED_WITH_HELP",
        scheduleQuality: "HINTED",
        shortCircuited: false,
      };
    }
    return {
      correctness: "INDEPENDENT",
      feedback: `非常好！无提示正确回忆。「${term}」= ${coreMeaning}。${llmResult.explanation}`,
      status: "RECALLED_INDEPENDENTLY",
      scheduleQuality: "INDEPENDENT",
      shortCircuited: false,
    };
  }

  return {
    correctness: "FAIL",
    feedback: `不太对。「${term}」的核心含义是：${coreMeaning}。${llmResult.explanation}`,
    status: "EXPOSED",
    scheduleQuality: "FAIL",
    shortCircuited: false,
  };
}
