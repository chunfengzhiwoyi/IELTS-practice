/**
 * 备考目标档案（Web 端 localStorage 存储 + 当前情况统计）
 * 键：els_weeklyGoal（与小程序 K_GOAL_PROFILE / 安卓 goalProfile 同结构）
 */
import { getItem, setItem } from "@/lib/client/storage";
import { getStatesRecord, getLearnedCount, computeStreak } from "@/lib/client/progress";
import type { LearningEvent } from "@/lib/learning/types";

export interface GoalProfile {
  examDate: string | null;
  targetBand: number;
  currentBand: number;
  dailyMinutes: number;
  weeklyWordTarget: number;
  /** 首次设定时间 ISO；用于按真实流逝周数推进阶段进度 */
  setAt: string | null;
  /** 设定时的总周数快照（考试日→设定日）；阶段进度分母 */
  plannedWeeks: number | null;
}

const DEFAULT: GoalProfile = {
  examDate: null,
  targetBand: 6.5,
  currentBand: 5.0,
  dailyMinutes: 30,
  weeklyWordTarget: 200,
  setAt: null,
  plannedWeeks: null,
};

export function getGoalProfile(): GoalProfile {
  const p = getItem<Partial<GoalProfile>>("weeklyGoal");
  if (!p) return DEFAULT;
  return {
    examDate: p.examDate ?? null,
    targetBand: p.targetBand ?? 6.5,
    currentBand: p.currentBand ?? 5.0,
    dailyMinutes: p.dailyMinutes ?? 30,
    weeklyWordTarget: p.weeklyWordTarget ?? 200,
    setAt: p.setAt ?? null,
    plannedWeeks: p.plannedWeeks ?? null,
  };
}

export function saveGoalProfile(p: GoalProfile): void {
  const prev = getItem<Partial<GoalProfile>>("weeklyGoal");
  const setAt = p.setAt ?? prev?.setAt ?? new Date().toISOString();
  const plannedWeeks = p.examDate
    ? Math.max(1, Math.ceil((new Date(p.examDate + "T00:00:00").getTime() - Date.now()) / (7 * 86400000)))
    : null;
  setItem("weeklyGoal", { ...p, setAt, plannedWeeks });
}

export function getWeeklyGoal(): number {
  return getGoalProfile().weeklyWordTarget;
}

/** 近 N 周学习概况，供「当前情况」与智能生成使用。Web 事件无 durationMs，用时长按 ~60s/事件估算。 */
export function getStudyHistory(weeks = 4): {
  avgWeeklyStudySeconds: number;
  learnedWords: number;
  masteredCount: number;
  streak: number;
} {
  const states = getStatesRecord();
  const learnedWords = getLearnedCount();
  const masteredCount = Object.values(states).filter(
    (s) => s.status === "RECALLED_INDEPENDENTLY",
  ).length;
  const streak = computeStreak();

  const events = getItem<LearningEvent[]>("events") ?? [];
  const cutoff = Date.now() - weeks * 7 * 86400000;
  const recentCount = events.filter(
    (e) =>
      (e.eventType === "NEW" || e.eventType === "REVIEW") &&
      new Date(e.createdAt).getTime() >= cutoff,
  ).length;
  const avgWeeklyStudySeconds = weeks > 0 ? Math.round((recentCount * 60) / weeks) : 0;

  return { avgWeeklyStudySeconds, learnedWords, masteredCount, streak };
}
