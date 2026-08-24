/**
 * POST /api/speaking/analyze
 * ------------------------------------------------------------
 * 分析口语回答：LLM 深度分析，降级回退到规则引擎。
 * 交接单 §3.4：每轮只选一个最值得改善的问题。
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getQuestionById, getSpeakingRepository } from "@/lib/speaking";
import { analyzeSpeakingWithLlm } from "@/lib/llm/tasks/analyze-speaking";
import { getUserOverrideProviders } from "@/lib/llm/user-config";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

const RequestSchema = z.object({
  sessionId: z.string().min(1),
  answer: z.string().min(1, "回答不能为空").max(5000),
  isSecondAnswer: z.boolean().default(false),
  /** Phase 3: 音频元数据（语音回答时提供） */
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
  /** Phase 4.3: 用户历史能力上下文（客户端构建后传入） */
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
  try {
    const bodyRaw = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), traceId);
    }

    await requireUser(traceId);
    const { sessionId, answer, isSecondAnswer, audioMetadata, abilityContext } = parsed.data;
    const repo = getSpeakingRepository();

    const session = await repo.getSession(sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND", `会话 ${sessionId} 不存在`, traceId);
    }

    const questionData = getQuestionById(session.questionId);
    if (!questionData) {
      throw new AppError("INTERNAL", `题目数据丢失: ${session.questionId}`, traceId);
    }

    // LLM 深度分析（含降级到规则引擎）；优先使用用户自有模型
    const analysis = await analyzeSpeakingWithLlm(
      answer,
      questionData,
      traceId,
      audioMetadata ?? undefined,
      abilityContext as import("@/lib/ability/memory-retriever").AbilityMemoryContext | undefined,
      { overrideProviders: await getUserOverrideProviders() ?? undefined },
    );

    // Update session
    let updatedSession;
    if (isSecondAnswer) {
      updatedSession = await repo.updateSecondAnswer(sessionId, answer, analysis);
    } else {
      updatedSession = await repo.updateFirstAnswer(sessionId, answer, analysis);
    }

    return NextResponse.json(
      { analysis, session: updatedSession },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status =
      appErr.kind === "AUTH_REQUIRED" ? 401
        : appErr.kind === "INVALID_INPUT" ? 400
          : appErr.kind === "NOT_FOUND" ? 404
            : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
