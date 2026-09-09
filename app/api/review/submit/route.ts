/**
 * POST /api/review/submit
 * ------------------------------------------------------------
 * 提交复习结果：LLM 语义判题 + 降级关键词匹配
 * M1: 使用中央 repository-factory
 * M2 Phase 2: state.read / rule.applied / state.write 埋点
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getLearningRepository } from "@/lib/repository-factory";
import { getAllSeedItems } from "@/lib/learning/seed-catalog";
import { isAnswerContentEmpty } from "@/lib/learning/answer-content";
import type { LearningStatus } from "@/lib/learning/types";
import { judgeAnswerWithLlm } from "@/lib/llm/tasks/judge-answer";
import type { ReviewResult } from "@/lib/review/answer-judge";
import { computeReviewNextAt } from "@/lib/review/review-schedule";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { startTrace, endTraceSuccess, endTraceError, appErrorToTrace } from "@/lib/observability/trace-api-helper";
import { canonicalStateHash } from "@/lib/observability/trace-context";

export const runtime = "nodejs";

const RequestSchema = z.object({
  itemId: z.string().min(1),
  taskType: z.literal("MEANING_RECALL"),
  answer: z.string().max(2000),
  usedHint: z.boolean(),
  skipped: z.boolean(),
  clientEventId: z.string().min(1),
});

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const tctx = startTrace(traceId, "/api/review/submit", {
    input_summary: "review submit",
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
    const { itemId, taskType, answer, usedHint, skipped, clientEventId } = parsed.data;
    const repo = getLearningRepository();

    // ---- state.read: user_item_state ----
    const existingState = await repo.getUserItemState(user.id, itemId);
    tctx.emitStateRead({
      entity: "user_item_state",
      keys: { userId: user.id, itemId },
      snapshot_summary: existingState
        ? `status=${existingState.status}, recallLevel=${existingState.recallLevel}, consecutiveCorrect=${existingState.consecutiveCorrect}, nextReviewAt=${existingState.nextReviewAt}`
        : "no prior state",
      state_not_found: !existingState,
    });

    const seed = getAllSeedItems().find((s) => s.itemId === itemId);
    const item = await repo.getItemById(itemId);
    const term = seed?.term ?? item?.canonicalForm ?? itemId;
    const coreMeaning = seed?.coreMeaning ?? item?.contentJson?.coreMeaning ?? "";
    const acceptedAnswers = seed?.acceptedAnswers ?? [coreMeaning];
    const answerKeywords = seed?.answerKeywords ?? [];

    let result: ReviewResult;
    let shortCircuited = false;
    if (skipped) {
      result = "SKIPPED";
    } else if (isAnswerContentEmpty(answer)) {
      result = "INCORRECT";
      shortCircuited = true;
      // ---- rule.applied: empty_answer_short_circuit ----
      tctx.emitRuleApplied({
        rule_key: "empty_answer_short_circuit",
        inputs: { answer_empty: true, content_empty: true, skipped: false, itemId },
        outputs: { result: "INCORRECT", llm_call_count: 0 },
        llm_call_count: 0,
      });
    } else {
      const llmResult = await judgeAnswerWithLlm({
        term,
        coreMeaning,
        userAnswer: answer,
        acceptedAnswers,
        answerKeywords,
        traceId,
      });
      if (llmResult.correct) {
        result = usedHint ? "CORRECT_WITH_HINT" : "CORRECT_INDEPENDENT";
      } else {
        result = "INCORRECT";
      }
    }

    const nextReviewAt = computeReviewNextAt(result);

    // ---- rule.applied: review_interval_table ----
    tctx.emitRuleApplied({
      rule_key: "review_interval_table",
      inputs: {
        result,
        usedHint,
        skipped,
        previous_recall_level: existingState?.recallLevel ?? 0,
      },
      outputs: {
        next_review_at: nextReviewAt,
        recall_level_delta: result === "CORRECT_INDEPENDENT" ? "+1 (capped at 2)" : "0",
        interval_hours: result === "CORRECT_INDEPENDENT" ? 72 : result === "CORRECT_WITH_HINT" ? 24 : result === "INCORRECT" ? 4 : 2,
      },
      llm_call_count: shortCircuited ? 0 : 1,
    });

    const { status, correctness, feedback } = mapResultToStatusAndFeedback(result, term, coreMeaning);

    // ---- state.write: learning_event ----
    const { event, created } = await repo.createLearningEvent({
      userId: user.id,
      itemId,
      eventType: "REVIEW",
      taskType,
      answer: answer || null,
      correctness,
      hintLevel: usedHint ? 1 : 0,
      resultJson: { reviewResult: result, feedback },
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
      state_after: { eventType: "REVIEW", correctness, reviewResult: result },
      canonical_state_hash: canonicalStateHash({ eventType: "REVIEW", correctness, reviewResult: result }),
    });

    // M1 FINAL: 显式幂等 Contract — created=false 表示 clientEventId 重复
    if (!created) {
      const currentState = await repo.getUserItemState(user.id, itemId);
      const now = new Date().toISOString();
      const remaining = (await repo.getDueReviewItems(user.id, now, 100)).length;
      const prevResult = (event.resultJson?.reviewResult as ReviewResult) ?? result;
      const prevFeedback = (event.resultJson?.feedback as string) ?? feedback;
      const resp = NextResponse.json(
        {
          eventId: event.id,
          result: prevResult,
          feedback: prevFeedback,
          status: currentState?.status ?? status,
          nextReviewAt: currentState?.nextReviewAt ?? nextReviewAt,
          remaining,
        },
        { status: 200, headers: { "x-trace-id": traceId, "x-idempotent-replay": "true" } },
      );
      return endTraceSuccess(tctx, resp, `idempotent replay: ${prevResult}`, false, true);
    }

    const consecutiveCorrect = (result === "CORRECT_INDEPENDENT" || result === "CORRECT_WITH_HINT")
      ? (existingState?.consecutiveCorrect ?? 0) + 1
      : 0;

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
      recognitionLevel: existingState?.recognitionLevel ?? 1,
      recallLevel: result === "CORRECT_INDEPENDENT" ? Math.min((existingState?.recallLevel ?? 0) + 1, 2) : (existingState?.recallLevel ?? 0),
      applicationLevel: existingState?.applicationLevel ?? 0,
      consecutiveCorrect,
      currentIntervalDays: computeIntervalDays(result),
      nextReviewAt,
    });

    // ---- state.write: user_item_state ----
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

    const now = new Date().toISOString();
    const remaining = (await repo.getDueReviewItems(user.id, now, 100)).length;

    const resp = NextResponse.json(
      { eventId: event.id, result, feedback, status: newState.status, nextReviewAt, remaining },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
    return endTraceSuccess(tctx, resp, `result=${result}, status=${newState.status}`);
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    const { code, message } = appErrorToTrace(err);
    endTraceError(tctx, status, code, message);
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}

function mapResultToStatusAndFeedback(
  result: ReviewResult,
  term: string,
  coreMeaning: string,
): { status: LearningStatus; correctness: string; feedback: string } {
  switch (result) {
    case "CORRECT_INDEPENDENT":
      return { status: "RECALLED_INDEPENDENTLY", correctness: "INDEPENDENT", feedback: `完美！无提示独立回忆「${term}」= ${coreMeaning}` };
    case "CORRECT_WITH_HINT":
      return { status: "RECALLED_WITH_HELP", correctness: "HINTED", feedback: `正确！借助提示回忆出「${term}」= ${coreMeaning}。下次试试独立回忆。` };
    case "INCORRECT":
      return { status: "EXPOSED", correctness: "FAIL", feedback: `还需加强。「${term}」的含义是：${coreMeaning}` };
    case "SKIPPED":
      return { status: "EXPOSED", correctness: "SKIPPED", feedback: `已跳过。「${term}」= ${coreMeaning}，稍后再复习。` };
  }
}

function computeIntervalDays(result: ReviewResult): number {
  switch (result) {
    case "CORRECT_INDEPENDENT": return 3;
    case "CORRECT_WITH_HINT": return 1;
    case "INCORRECT": return 4 / 24;
    case "SKIPPED": return 2 / 24;
  }
}
