/**
 * GET /api/learning/stats
 * M1: 首页统一统计接口，数据从服务端 Repository 聚合。
 */
import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getLearningRepository, getSpeakingRepository } from "@/lib/repository-factory";
import { toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { localDayKey } from "@/lib/client/day";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const user = await requireUser(traceId);
    const learningRepo = getLearningRepository();
    const speakingRepo = getSpeakingRepository();
    const now = new Date();
    const nowIso = now.toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

    const allStates = await learningRepo.getAllUserItemStates(user.id);
    const learnedCount = allStates.length;
    const dueCount = allStates.filter((s) => s.nextReviewAt <= nowIso).length;
    const masteredCount = allStates.filter((s) => s.status === "RECALLED_INDEPENDENTLY").length;

    const recentEvents = await learningRepo.getUserEventsInRange(user.id, weekAgo, nowIso);
    const reviewEvents = recentEvents.filter((e) => e.eventType === "REVIEW");
    let weeklyAccuracy: number | null = null;
    if (reviewEvents.length > 0) {
      const correct = reviewEvents.filter((e) => e.correctness === "INDEPENDENT" || e.correctness === "HINTED").length;
      weeklyAccuracy = Math.round((correct / reviewEvents.length) * 100);
    }

    const allEvents = await learningRepo.getUserEventsInRange(
      user.id,
      new Date(now.getTime() - 30 * 86400000).toISOString(),
      nowIso,
    );
    const activeDays = new Set(allEvents.map((e) => localDayKey(e.createdAt)));
    let streak = 0;
    const d = new Date(now);
    for (;;) {
      if (activeDays.has(localDayKey(d))) { streak++; d.setDate(d.getDate() - 1); } else break;
    }

    const recentSessions = await speakingRepo.getRecentSessions(user.id, 1);
    let speakingIdleDays: number | null = null;
    if (recentSessions.length > 0) {
      speakingIdleDays = Math.floor((now.getTime() - new Date(recentSessions[0]!.updatedAt).getTime()) / 86400000);
    }

    return NextResponse.json(
      { learnedCount, dueCount, masteredCount, weeklyAccuracy, streak, speakingIdleDays },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
