/**
 * GET /api/today — Today Plan 单一服务端入口（PRODUCT-LOOP-02B）
 * ------------------------------------------------------------
 * 服务端读取：Goal（GoalRepository） + 学习状态（Learning/Speaking/Ability repos）
 * → 调用确定性 Planner → 返回 TodayPlan。
 * 首页 TodayZone 只渲染，不在浏览器重实现规则。
 */
import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getGoalRepository } from "@/lib/goal/repository";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goal/types";
import {
  getLearningRepository,
  getSpeakingRepository,
  getAbilityRepository,
} from "@/lib/repository-factory";
import { buildSpeakingAbilityProfileFromObservations } from "@/lib/ability/profile-builder";
import { generateStudyPlan } from "@/lib/goal/plan";
import { planToday } from "@/lib/planner/planner-v1";
import type { Feasibility } from "@/lib/planner/planner-v1";
import { toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const user = await requireUser(traceId);
    const now = new Date();
    const nowIso = now.toISOString();

    // 1) Goal（SSOT；V1 恒 Memory，未设定时用默认轮廓）
    const goalRepo = getGoalRepository();
    const storedGoal = await goalRepo.getGoalProfile(user.id);
    const goal = storedGoal ?? DEFAULT_GOAL_PROFILE;

    // 2) 学习状态
    const learningRepo = getLearningRepository();
    const allStates = await learningRepo.getAllUserItemStates(user.id);
    const dueCount = allStates.filter((s) => s.nextReviewAt <= nowIso).length;
    const masteredCount = allStates.filter((s) => s.status === "RECALLED_INDEPENDENTLY").length;

    // 3) 本自然周（Mon 起）已学新表达：本周内 NEW 事件的去重 itemId 数
    const dow = now.getDay(); // 0=Sun
    const daysElapsed = dow === 0 ? 7 : dow;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (daysElapsed - 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekEvents = await learningRepo.getUserEventsInRange(user.id, weekStart.toISOString(), nowIso);
    const learnedThisWeek = new Set(
      weekEvents.filter((e) => e.eventType === "NEW").map((e) => e.itemId),
    ).size;

    // 4) Speaking 状态
    const speakingRepo = getSpeakingRepository();
    const recentSessions = await speakingRepo.getRecentSessions(user.id, 1);
    let speakingIdleDays: number | null = null;
    if (recentSessions.length > 0) {
      speakingIdleDays = Math.floor(
        (now.getTime() - new Date(recentSessions[0]!.updatedAt).getTime()) / 86400000,
      );
    }

    // 5) Ability 信号（画像：recurring issues + nextFocus，纯从 observations 推导）
    const abilityRepo = getAbilityRepository();
    const observations = await abilityRepo.getAll(user.id);
    const ability = buildSpeakingAbilityProfileFromObservations(user.id, observations);

    // 6) 周计划可行性（仅展示/进度信号；Band 不进入 Planner 数量计算）
    let feasibility: Feasibility = "unknown";
    if (goal.examDate) {
      feasibility = generateStudyPlan({
        examDate: goal.examDate,
        targetBand: goal.targetBand,
        currentBand: goal.currentBand,
        dailyMinutes: goal.dailyMinutes,
        history: {
          avgWeeklyStudySeconds: 0,
          learnedWords: allStates.length,
          masteredCount,
          streak: 0,
        },
      }).feasibility;
    }

    // 7) Planner（纯函数，确定性）
    const plan = planToday({
      goal,
      dueCount,
      speakingIdleDays,
      abilityNextFocusDimension: ability.nextFocus?.dimension ?? null,
      recurringIssueCount: ability.recurringIssues.length,
      learnedThisWeek,
      daysElapsedThisWeek: daysElapsed,
      feasibility,
      now,
    });

    return NextResponse.json(plan, { status: 200, headers: { "x-trace-id": traceId } });
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
