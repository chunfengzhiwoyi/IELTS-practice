/**
 * POST /api/review/submit
 * ------------------------------------------------------------
 * 提交复习结果：LLM 语义判题 + 降级关键词匹配
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/learning";
import { getAllSeedItems } from "@/lib/learning/seed-catalog";
import type { LearningStatus } from "@/lib/learning/types";
import { judgeAnswerWithLlm } from "@/lib/llm/tasks/judge-answer";
import type { ReviewResult } from "@/lib/review/answer-judge";
import { computeReviewNextAt } from "@/lib/review/review-schedule";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

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
  try {
    const bodyRaw = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    const user = await requireUser(traceId);
    const { itemId, taskType, answer, usedHint, skipped, clientEventId } = parsed.data;
    const repo = getRepository();

    // 获取词条信息
    const seed = getAllSeedItems().find((s) => s.itemId === itemId);
    const item = await repo.getItemById(itemId);
    const term = seed?.term ?? item?.canonicalForm ?? itemId;
    const coreMeaning = seed?.coreMeaning ?? item?.contentJson?.coreMeaning ?? "";
    const acceptedAnswers = seed?.acceptedAnswers ?? [coreMeaning];
    const answerKeywords = seed?.answerKeywords ?? [];

    // 判断结果
    let result: ReviewResult;
    if (skipped) {
      result = "SKIPPED";
    } else if (!answer.trim()) {
      result = "INCORRECT";
    } else {
      // LLM 语义判题
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

    // 计算下次复习时间
    const nextReviewAt = computeReviewNextAt(result);

    // 映射状态和反馈
    const { status, correctness, feedback } = mapResultToStatusAndFeedback(result, term, coreMeaning);

    // 创建学习事件
    const event = await repo.createLearningEvent({
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

    // 更新状态
    const existingState = await repo.getUserItemState(user.id, itemId);
    const consecutiveCorrect = (result === "CORRECT_INDEPENDENT" || result === "CORRECT_WITH_HINT")
      ? (existingState?.consecutiveCorrect ?? 0) + 1
      : 0;

    const newState = await repo.upsertUserItemState({
      userId: user.id,
      itemId,
      status,
      recognitionLevel: existingState?.recognitionLevel ?? 1,
      recallLevel: result === "CORRECT_INDEPENDENT" ? Math.min((existingState?.recallLevel ?? 0) + 1, 5) : (existingState?.recallLevel ?? 0),
      applicationLevel: existingState?.applicationLevel ?? 0,
      consecutiveCorrect,
      currentIntervalDays: computeIntervalDays(result),
      nextReviewAt,
    });

    // 剩余到期数
    const now = new Date().toISOString();
    const remaining = (await repo.getDueReviewItems(user.id, now, 100)).length;

    return NextResponse.json(
      { eventId: event.id, result, feedback, status: newState.status, nextReviewAt, remaining },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
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
