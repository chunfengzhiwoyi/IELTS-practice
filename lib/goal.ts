/**
 * 备考目标档案（Web 端 localStorage 缓存 + 迁移源 + 当前情况统计）
 * ------------------------------------------------------------
 * PRODUCT-LOOP-02B 后：
 * - GoalProfile 类型定义移至 lib/goal/types.ts（本文件 re-export，向后兼容）。
 * - localStorage "weeklyGoal" 不再是 Goal authority：
 *   首次加载由 /api/goal + lib/client/goal-client 迁移到服务端 GoalRepository；
 *   本文件仅保留本地缓存 / 迁移源 / 离线回退职责（P2 再清理旧 key）。
 * - 键：els_weeklyGoal（与小程序 K_GOAL_PROFILE / 安卓 goalProfile 同结构）
 */
import { getItem, setItem } from "@/lib/client/storage";
import { getStatesRecord, getLearnedCount, computeStreak } from "@/lib/client/progress";
import type { LearningEvent } from "@/lib/learning/types";
import { normalizeGoalProfile } from "@/lib/goal/types";
import type { GoalProfile } from "@/lib/goal/types";

export type { GoalProfile } from "@/lib/goal/types";
export { DEFAULT_GOAL_PROFILE } from "@/lib/goal/types";

const KEY = "weeklyGoal";

/** 本地缓存读取（fallback；不再作为 authority） */
export function getGoalProfile(): GoalProfile {
  const p = getItem<Partial<GoalProfile>>(KEY);
  return normalizeGoalProfile(p);
}

/** 本地缓存写入（写通缓存：API 保存成功后同步刷新；setAt/plannedWeeks 自动补全） */
export function saveGoalProfile(p: GoalProfile): void {
  const prev = getItem<Partial<GoalProfile>>(KEY);
  const setAt = p.setAt ?? prev?.setAt ?? new Date().toISOString();
  const plannedWeeks = p.examDate
    ? Math.max(1, Math.ceil((new Date(p.examDate + "T00:00:00").getTime() - Date.now()) / (7 * 86400000)))
    : null;
  setItem(KEY, { ...p, setAt, plannedWeeks });
}

/** 用户是否曾在本地设定过目标（迁移判定用） */
export function hasLocalGoalProfile(): boolean {
  return getItem<Partial<GoalProfile>>(KEY) != null;
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
