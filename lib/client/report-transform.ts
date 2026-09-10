"use client";
/**
 * Report Transform — 纯展示转换函数
 * ------------------------------------------------------------
 * M1: Single Source of Truth
 * 将服务端 /api/report 返回的原始数据转换为客户端展示格式。
 * 本模块只做纯转换，不读 localStorage，不维护业务状态。
 * 业务事实全部来自服务端 Repository。
 */
import type { LearningEvent, UserItemState } from "@/lib/learning/types";
import type { SpeakingSession } from "@/lib/speaking/types";
import { computeStreak, computeReviewAccuracy } from "@/lib/client/progress";
import { localDayKey } from "@/lib/client/day";
import { buildNextStep, type NextStep } from "@/lib/client/report-narrative";

export interface WeekBucket {
  newItems: number;
  reviews: number;
  reviewAccuracy: number | null;
  activeDays: number;
  speakingCompleted: number;
  /** BC-M3-003: 该周期是否存在任何学习/口语活动。
   *  true = 有 baseline，0 是真实零值；false = 无数据，不得计算 delta */
  hasActivity: boolean;
}

export interface SpeakingIssueDigest {
  dimension: string;
  label: string;
  count: number;
  suggestion: string;
}

export interface SpeakingDigest {
  completedCount: number;
  attemptedCount: number;
  avgWordCount: number;
  maxWordCount: number;
  avgConnectors: number;
  topIssue: SpeakingIssueDigest | null;
  retryImprovement: { sessions: number; avgWordDelta: number } | null;
  partsCovered: string[];
}

export interface LexiconEntry {
  itemId: string;
  term: string;
  coreMeaning: string;
  addedAt: string;
  status: string;
  needsAttention: boolean;
  reason?: string;
}

export interface ClientReport {
  totalItems: number;
  newItems: number;
  reviewedCount: number;
  dueSoon: number;
  correctRate: number;
  reviewTotal: number;
  correctIndependent: number;
  correctWithHint: number;
  incorrect: number;
  skipped: number;
  speakingCount: number;
  speakingTopIssue: string | null;
  thisWeek: WeekBucket;
  lastWeek: WeekBucket;
  speaking: SpeakingDigest;
  dueNow: number;
  activeDays: number;
  streak: number;
  newThisWeek: number;
  newLastWeek: number;
  weeklyActivity: Array<{ key: string; label: string; hasActivity: boolean; isToday: boolean }>;
  nextStep: NextStep;
}

export interface ServerReportRaw {
  states: UserItemState[];
  events: LearningEvent[];
  sessions: SpeakingSession[];
}

const DIM_LABELS: Record<string, string> = {
  fluency: "回答长度不足",
  vocabulary: "词汇重复",
  coherence: "缺少过渡衔接",
  development: "内容展开不够",
  argumentation: "论证逻辑",
};

/** 从服务端原始数据构建 ClientReport（纯函数） */
export function buildClientReportFromRaw(raw: ServerReportRaw): ClientReport {
  const { states, events, sessions } = raw;
  const now = new Date();
  const nowIso = now.toISOString();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const stateList = states;
  const totalItems = stateList.length;
  const newEvents = events.filter((e) => e.eventType === "NEW");
  const reviewEvents = events.filter((e) => e.eventType === "REVIEW");

  const dueSoon = stateList.filter((s) => s.nextReviewAt <= in24h).length;
  const correctIndependent = reviewEvents.filter((e) => e.correctness === "INDEPENDENT").length;
  const correctWithHint = reviewEvents.filter((e) => e.correctness === "HINTED").length;
  const incorrect = reviewEvents.filter((e) => e.correctness === "FAIL").length;
  const skipped = reviewEvents.filter((e) => e.correctness === "SKIPPED").length;
  const reviewTotal = reviewEvents.length;
  const correctRate = reviewTotal > 0 ? (correctIndependent + correctWithHint) / reviewTotal : 0;

  const dimCount: Record<string, number> = {};
  for (const s of sessions) {
    const dim = s.firstAnalysis?.mainIssue?.dimension;
    if (dim) dimCount[dim] = (dimCount[dim] ?? 0) + 1;
  }
  const topDim = Object.entries(dimCount).sort((a, b) => b[1] - a[1])[0];
  const speakingTopIssue = topDim ? `${topDim[0]}（${topDim[1]} 次）` : null;
  const topIssueCount = topDim ? topDim[1] : 0;

  const { thisWeek, lastWeek } = buildWeekBuckets(events, sessions, now.getTime());
  const speaking = buildSpeakingDigest(sessions);
  const streak = computeStreak(events);
  const nowMs = now.getTime();
  const weekAgo = nowMs - 7 * 86400000;
  const twoWeeksAgo = nowMs - 14 * 86400000;
  const newThisWeek = new Set(
    newEvents.filter((e) => new Date(e.createdAt).getTime() >= weekAgo).map((e) => e.itemId),
  ).size;
  const newLastWeek = new Set(
    newEvents.filter(
      (e) => new Date(e.createdAt).getTime() >= twoWeeksAgo && new Date(e.createdAt).getTime() < weekAgo,
    ).map((e) => e.itemId),
  ).size;

  const dueNow = stateList.filter((s) => s.nextReviewAt <= nowIso).length;
  const nextStep = buildNextStep({
    dueNow,
    topIssueCount,
    speakingCompleted: speaking.completedCount,
    totalItems,
  });

  return {
    totalItems,
    newItems: newEvents.length,
    reviewedCount: reviewTotal,
    dueSoon,
    correctRate,
    reviewTotal,
    correctIndependent,
    correctWithHint,
    incorrect,
    skipped,
    speakingCount: sessions.length,
    speakingTopIssue,
    thisWeek,
    lastWeek,
    speaking,
    dueNow,
    activeDays: thisWeek.activeDays,
    streak,
    newThisWeek,
    newLastWeek,
    weeklyActivity: buildWeeklyActivity(events, now),
    nextStep,
  };
}

/** 滚动 7 天窗口的周对比（纯函数） */
export function buildWeekBuckets(
  events: LearningEvent[],
  sessions: SpeakingSession[],
  now: number = Date.now(),
): { thisWeek: WeekBucket; lastWeek: WeekBucket } {
  const weekAgo = now - 7 * 86400000;
  const twoWeeksAgo = now - 14 * 86400000;

  const bucket = (fromMs: number, toMs: number): WeekBucket => {
    const ev = events.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= fromMs && t < toMs;
    });
    const newItems = new Set(ev.filter((e) => e.eventType === "NEW").map((e) => e.itemId)).size;
    const reviews = ev.filter((e) => e.eventType === "REVIEW").length;
    const reviewAccuracy = computeReviewAccuracy(ev, fromMs, toMs);
    const activeDays = new Set(ev.map((e) => localDayKey(e.createdAt))).size;
    const speakingCompleted = sessions.filter((s) => {
      if (s.status !== "COMPLETED") return false;
      const t = new Date(s.createdAt).getTime();
      return t >= fromMs && t < toMs;
    }).length;
    const hasActivity = ev.length > 0 || speakingCompleted > 0;
    return { newItems, reviews, reviewAccuracy, activeDays, speakingCompleted, hasActivity };
  };

  return { thisWeek: bucket(weekAgo, now), lastWeek: bucket(twoWeeksAgo, weekAgo) };
}

/** 口语摘要（纯函数） */
export function buildSpeakingDigest(sessions: SpeakingSession[]): SpeakingDigest {
  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const completedCount = completed.length;
  if (completedCount === 0) {
    return {
      completedCount,
      attemptedCount: sessions.length,
      avgWordCount: 0,
      maxWordCount: 0,
      avgConnectors: 0,
      topIssue: null,
      retryImprovement: null,
      partsCovered: [],
    };
  }

  const wordCounts = completed.map((s) => s.firstAnalysis?.metrics.wordCount ?? 0);
  const connectorCounts = completed.map((s) => s.firstAnalysis?.metrics.connectorCount ?? 0);
  const avgWordCount = Math.round(wordCounts.reduce((a, b) => a + b, 0) / completedCount);
  const maxWordCount = Math.max(...wordCounts);
  const avgConnectors = Math.round((connectorCounts.reduce((a, b) => a + b, 0) / completedCount) * 10) / 10;

  const dimAgg: Record<string, { count: number; suggestion: string }> = {};
  for (const s of completed) {
    const dim = s.firstAnalysis?.mainIssue?.dimension;
    if (!dim) continue;
    if (!dimAgg[dim]) dimAgg[dim] = { count: 0, suggestion: s.firstAnalysis!.mainIssue!.suggestion };
    dimAgg[dim].count += 1;
  }
  const topEntry = Object.entries(dimAgg).sort((a, b) => b[1].count - a[1].count)[0];
  const topIssue = topEntry
    ? { dimension: topEntry[0], label: DIM_LABELS[topEntry[0]] ?? topEntry[0], count: topEntry[1].count, suggestion: topEntry[1].suggestion }
    : null;

  const retries = completed.filter((s) => s.secondAnalysis && s.firstAnalysis);
  let retryImprovement: SpeakingDigest["retryImprovement"] = null;
  if (retries.length > 0) {
    const deltas = retries.map((s) => (s.secondAnalysis!.metrics.wordCount ?? 0) - (s.firstAnalysis!.metrics.wordCount ?? 0));
    const avg = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
    retryImprovement = { sessions: retries.length, avgWordDelta: avg };
  }

  const partsCovered = Array.from(new Set(completed.map((s) => s.part)));
  return { completedCount, attemptedCount: sessions.length, avgWordCount, maxWordCount, avgConnectors, topIssue, retryImprovement, partsCovered };
}

/** 周活动日历（纯函数） */
export function buildWeeklyActivity(
  events: LearningEvent[],
  today: Date = new Date(),
): Array<{ key: string; label: string; hasActivity: boolean; isToday: boolean }> {
  const activeSet = new Set(events.map((e) => localDayKey(e.createdAt)));
  const cells: Array<{ key: string; label: string; hasActivity: boolean; isToday: boolean }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDayKey(d);
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    cells.push({ key, label: `周${weekday}`, hasActivity: activeSet.has(key), isToday: i === 0 });
  }
  return cells;
}

/**
 * 从服务端数据构建词库视图（纯函数）。
 * recent=近7天新收，attention=需要回头看的（最多5）。
 */
export function buildLexiconFromData(
  states: UserItemState[],
  events: LearningEvent[],
  itemContents: Record<string, { term: string; coreMeaning: string }>,
): { recent: LexiconEntry[]; attention: LexiconEntry[] } {
  const weekAgo = Date.now() - 7 * 86400000;

  const firstNewAt = new Map<string, string>();
  for (const e of events) {
    if (e.eventType !== "NEW") continue;
    if (new Date(e.createdAt).getTime() < weekAgo) continue;
    const cur = firstNewAt.get(e.itemId);
    if (!cur || e.createdAt < cur) firstNewAt.set(e.itemId, e.createdAt);
  }
  const recentIds = [...firstNewAt.keys()];

  const attentionStates = states
    .filter((s) => s.status === "EXPOSED" || s.status === "RECALLED_WITH_HELP")
    .sort((a, b) => (a.nextReviewAt < b.nextReviewAt ? -1 : 1));

  const recent: LexiconEntry[] = recentIds
    .map((id): LexiconEntry | null => {
      const r = itemContents[id];
      if (!r) return null;
      const st = states.find((s) => s.itemId === id);
      return {
        itemId: id,
        term: r.term,
        coreMeaning: r.coreMeaning,
        addedAt: firstNewAt.get(id)!,
        status: st?.status ?? "EXPOSED",
        needsAttention: false,
      };
    })
    .filter((x): x is LexiconEntry => x !== null)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));

  const attention: LexiconEntry[] = attentionStates
    .map((s): LexiconEntry | null => {
      const r = itemContents[s.itemId];
      if (!r) return null;
      return {
        itemId: s.itemId,
        term: r.term,
        coreMeaning: r.coreMeaning,
        addedAt: s.updatedAt,
        status: s.status,
        needsAttention: true,
        reason: s.status === "EXPOSED" ? "上次还没想起来" : "还需要提示才能想起来",
      };
    })
    .filter((x): x is LexiconEntry => x !== null)
    .slice(0, 5);

  return { recent, attention };
}
