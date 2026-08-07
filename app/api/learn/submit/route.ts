/**
 * POST /api/learn/submit
 * ------------------------------------------------------------
 * 提交学习结果：LLM 语义判题 + 降级关键词匹配
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  getRepository,
  type EventCorrectness,
  type LearningStatus,
  type LearnSubmitResponse,
} from "@/lib/learning";
import { getAllSeedItems } from "@/lib/learning/seed-catalog";
import { judgeAnswerWithLlm } from "@/lib/llm/tasks/judge-answer";
import {
  computeInitialReviewAt,
  initialIntervalDays,
  type InitialScheduleQuality,
} from "@/lib/review/initial-schedule";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

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
  try {
    const bodyRaw = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    const { itemId, taskType, answer, usedHint, clientEventId } = parsed.data;
    const repo = getRepository();

    const existingState = await repo.getUserItemState(user.id, itemId);

    // 获取词条信息（优先 seed，否则从 repo 获取）
    const seed = getAllSeedItems().find((s) => s.itemId === itemId);
    const item = await repo.getItemById(itemId);
    const term = seed?.term ?? item?.canonicalForm ?? itemId;
    const coreMeaning = seed?.coreMeaning ?? item?.contentJson?.coreMeaning ?? "";
    const acceptedAnswers = seed?.acceptedAnswers ?? [coreMeaning];
    const answerKeywords = seed?.answerKeywords ?? [];

    // LLM 语义判题（含降级）
    const { correctness, feedback, status, scheduleQuality } = await judgeLearnAnswer({
      term,
      coreMeaning,
      answer,
      usedHint,
      acceptedAnswers,
      answerKeywords,
      traceId,
    });

    const nextReviewAt = computeInitialReviewAt(scheduleQuality);
    const intervalDays = initialIntervalDays(scheduleQuality);

    const event = await repo.createLearningEvent({
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

    const response: LearnSubmitResponse = {
      eventId: event.id,
      correctness,
      status,
      feedback,
      nextReviewAt,
      state: newState,
    };

    return NextResponse.json(response, { status: 200, headers: { "x-trace-id": traceId } });
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}

// =============================================================
// LLM 判题 + 映射
// =============================================================

interface JudgeResult {
  correctness: EventCorrectness;
  feedback: string;
  status: LearningStatus;
  scheduleQuality: InitialScheduleQuality;
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

  if (!answer.trim()) {
    return {
      correctness: "FAIL",
      feedback: "未提供答案，建议再试一次。",
      status: "EXPOSED",
      scheduleQuality: "FAIL",
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
      };
    }
    return {
      correctness: "INDEPENDENT",
      feedback: `非常好！无提示正确回忆。「${term}」= ${coreMeaning}。${llmResult.explanation}`,
      status: "RECALLED_INDEPENDENTLY",
      scheduleQuality: "INDEPENDENT",
    };
  }

  return {
    correctness: "FAIL",
    feedback: `不太对。「${term}」的核心含义是：${coreMeaning}。${llmResult.explanation}`,
    status: "EXPOSED",
    scheduleQuality: "FAIL",
  };
}
