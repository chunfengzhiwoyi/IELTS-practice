/**
 * POST /api/speaking/session
 * ------------------------------------------------------------
 * 创建口语训练会话。支持：
 *  - 指定 questionId
 *  - 指定 part + optional topic（自动选题）
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  getQuestionById,
  pickQuestion,
  getSpeakingRepository,
  type SpeakingSession,
} from "@/lib/speaking";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

const RequestSchema = z.object({
  questionId: z.string().min(1).optional(),
  part: z.enum(["P1", "P2", "P3"]).optional(),
  topic: z.string().optional(),
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
    const { questionId, part, topic } = parsed.data;

    // Resolve question
    let questionData;
    if (questionId) {
      questionData = getQuestionById(questionId);
      if (!questionData) {
        throw new AppError("INVALID_INPUT", `题目 ${questionId} 不存在`, traceId);
      }
    } else {
      questionData = pickQuestion(part, topic);
    }

    const repo = getSpeakingRepository();
    const session: SpeakingSession = {
      id: `spk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: user.id,
      questionId: questionData.questionId,
      part: questionData.part,
      topic: questionData.topic,
      question: questionData.question,
      firstAnswer: null,
      firstAnalysis: null,
      secondAnswer: null,
      secondAnalysis: null,
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repo.createSession(session);

    return NextResponse.json(
      { session, questionData },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
