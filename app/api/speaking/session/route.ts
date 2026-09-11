/**
 * POST /api/speaking/session
 * ------------------------------------------------------------
 * 创建口语训练会话。支持：
 *  - 指定 questionId
 *  - 指定 part + optional topic（自动选题）
 * M1: 使用中央 repository-factory
 *
 * PRODUCT-LOOP-02C（V1, Vocabulary → Speaking）：
 *  - 自动选题时：从用户已学词条选出 ≤2 个目标表达，自然匹配题库；有可靠匹配才携带
 *    suggestedExpressions（OPTIONAL 提示），无匹配走普通 Speaking（SAFE FALLBACK）。
 *  - 显式 questionId：绝不因 target 替换用户选定的题；仅当该题与目标自然重叠时附加建议。
 *  - Frozen Safety Boundary：本路由只读 learner state，不写入
 *    applicationLevel / recallLevel / status / nextReviewAt / currentIntervalDays / consecutiveCorrect。
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  getQuestionById,
  pickQuestion,
  getQuestionsByPart,
  getAllQuestions,
  type SpeakingSession,
  type SuggestedExpression,
} from "@/lib/speaking";
import { getSpeakingRepository, getLearningRepository } from "@/lib/repository-factory";
import { AppError, toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { selectTargetExpressions } from "@/lib/speaking/target-selection";
import { matchQuestionForTargets } from "@/lib/speaking/question-matching";
import { getAllSeedItems } from "@/lib/learning/seed-catalog";

export const runtime = "nodejs";

const RequestSchema = z.object({
  questionId: z.string().min(1).optional(),
  part: z.enum(["P1", "P2", "P3"]).optional(),
  topic: z.string().optional(),
});

/** 7 天窗口：近期新学 / 近期复习失败的信号窗口 */
const SIGNAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

    // ---- PRODUCT-LOOP-02C: 目标表达选择（只读 learner state）----
    const learningRepo = getLearningRepository();
    const [states, events] = await Promise.all([
      learningRepo.getAllUserItemStates(user.id),
      learningRepo.getUserEventsInRange(
        user.id,
        new Date(Date.now() - SIGNAL_WINDOW_MS).toISOString(),
        new Date().toISOString(),
      ),
    ]);
    const recentlyLearned = new Set(events.filter((e) => e.eventType === "NEW").map((e) => e.itemId));
    const recentlyIncorrect = new Set(
      events.filter((e) => e.eventType === "REVIEW" && e.correctness === "FAIL").map((e) => e.itemId),
    );
    const seedById = new Map(getAllSeedItems().map((s) => [s.itemId, s]));
    const targets = selectTargetExpressions(
      states,
      (itemId) => seedById.get(itemId) ?? null,
      { recentlyLearned, recentlyIncorrect },
    );
    const topicTagsOf = (itemId: string): string[] => seedById.get(itemId)?.topicTags ?? [];

    let questionData;
    let suggestedExpressions: SuggestedExpression[] = [];

    if (questionId) {
      // 显式选题：永不替换；仅当该题与目标自然重叠时附加建议
      questionData = getQuestionById(questionId);
      if (!questionData) {
        throw new AppError("INVALID_INPUT", `题目 ${questionId} 不存在`, traceId);
      }
      const match = matchQuestionForTargets([questionData], targets, topicTagsOf);
      suggestedExpressions = match.matchedTargets.map((t) => ({
        itemId: t.itemId,
        canonicalForm: t.canonicalForm,
        meaning: t.meaning,
        reason: t.reason,
        matchedTopic: questionData!.topic,
      }));
    } else {
      // 自动选题：候选池按 part（+ topic 偏好）过滤；有自然匹配才带 targets，否则 SAFE FALLBACK
      let pool = part ? getQuestionsByPart(part) : getAllQuestions();
      if (topic) {
        const topicLower = topic.toLowerCase();
        const filtered = pool.filter((q) => q.topic.toLowerCase().includes(topicLower));
        if (filtered.length > 0) pool = filtered;
      }
      const match = matchQuestionForTargets(pool, targets, topicTagsOf);
      if (match.question) {
        questionData = match.question;
        suggestedExpressions = match.matchedTargets.map((t) => ({
          itemId: t.itemId,
          canonicalForm: t.canonicalForm,
          meaning: t.meaning,
          reason: t.reason,
          matchedTopic: match.question!.topic,
        }));
      } else {
        // SAFE FALLBACK：无可靠匹配 → 普通 Speaking（保持现有 pickQuestion 语义）
        questionData = pickQuestion(part, topic);
      }
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
      { session, questionData, suggestedExpressions },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : appErr.kind === "INVALID_INPUT" ? 400 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
