/**
 * 纯前端进度指标计算（来自 localStorage 的 events / states）
 * 仅用于首页进度带与导航连续天数展示，不写入业务状态机。
 */
import { getItem } from "@/lib/client/storage";
import type { LearningEvent, UserItemState } from "@/lib/learning/types";

function getEvents(): LearningEvent[] {
  return getItem<LearningEvent[]>("events") ?? [];
}

export function getStatesRecord(): Record<string, UserItemState> {
  return getItem<Record<string, UserItemState>>("states") ?? {};
}

export function getLearnedCount(): number {
  return Object.keys(getStatesRecord()).length;
}

import { localDayKey } from "@/lib/client/day";

/** 连续学习天数：从今天起向前数，每天有任意学习事件则 +1 */
export function computeStreak(events: LearningEvent[] = getEvents()): number {
  if (events.length === 0) return 0;
  const days = new Set(events.map((e) => localDayKey(e.createdAt)));
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = localDayKey(d);
    if (days.has(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

/** 在 [fromMs, toMs) 窗口内，REVIEW 事件的会话内准确率（非掌握率）；无复习返回 null */
export function computeReviewAccuracy(
  events: LearningEvent[],
  fromMs: number,
  toMs: number,
): number | null {
  const rev = events.filter((e) => {
    if (e.eventType !== "REVIEW") return false;
    const t = new Date(e.createdAt).getTime();
    return t >= fromMs && t < toMs;
  });
  if (rev.length === 0) return null;
  const correct = rev.filter(
    (e) => e.correctness === "INDEPENDENT" || e.correctness === "HINTED",
  ).length;
  return Math.round((correct / rev.length) * 100);
}

/** 本周复习正确率（会话内准确率，非掌握率）；无复习返回 null */
export function computeWeeklyReviewAccuracy(events: LearningEvent[] = getEvents()): number | null {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  return computeReviewAccuracy(events, weekAgo, now);
}
