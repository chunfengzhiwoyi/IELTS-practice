import type { LearningEvent } from "../learning/types";

/** 连续活跃天数（截至今天，按本地日键） */
export function computeStreak(events: LearningEvent[]): number {
  if (events.length === 0) return 0;
  const days = new Set(events.map((e) => localDayKey(e.createdAt)));
  let streak = 0;
  const d = new Date();
  // 若今天无活动，从昨天起算
  if (!days.has(localDayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(localDayKey(d))) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** 指定窗口内的复习准确率（独立+提示 / 总数） */
export function computeReviewAccuracy(
  events: LearningEvent[],
  fromMs: number,
  toMs: number,
): number | null {
  const inWindow = events.filter((e) => {
    const t = new Date(e.createdAt).getTime();
    return e.eventType === "REVIEW" && t >= fromMs && t < toMs;
  });
  if (inWindow.length === 0) return null;
  const correct = inWindow.filter(
    (e) => e.correctness === "INDEPENDENT" || e.correctness === "HINTED",
  ).length;
  return correct / inWindow.length;
}

import { localDayKey } from "./day";
