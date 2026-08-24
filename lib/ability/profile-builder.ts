"use client";
/**
 * Speaking Ability Profile Builder
 * -------------------------------------------------------
 * Phase 4.2: 从 ability_observations 聚合用户口语能力画像。
 *
 * 设计原则：
 * - 纯确定性逻辑，不调用 LLM
 * - 输入：userId → 读取 localStorage observations
 * - 输出：SpeakingAbilityProfile（维度水平 + 趋势 + 反复问题 + 下次重点）
 */

import type {
  AbilityObservation,
  AbilityLevel,
  SpeakingDimensionKey,
} from "@/lib/ability/types";
import { getAbilityRepository } from "@/lib/ability/repository";

// =============================================================
// Output Types
// =============================================================

/** 单维度趋势 */
export interface DimensionTrend {
  /** 当前水平（最近一次 observation 的 level） */
  currentLevel: AbilityLevel;
  /** 上一次水平（倒数第二次，null 表示只有一次记录） */
  previousLevel: AbilityLevel | null;
  /** 趋势方向 */
  trend: "improving" | "stable" | "declining";
  /** 最近 N 次 level 历史（时间正序） */
  levelHistory: Array<{ level: AbilityLevel; date: string; sessionId: string }>;
  /** 该维度观察总数 */
  totalObservations: number;
}

/** 反复出现的问题 */
export interface RecurringIssue {
  /** 问题描述（归一化后） */
  description: string;
  /** 所属维度 */
  dimension: SpeakingDimensionKey;
  /** 出现次数 */
  occurrenceCount: number;
  /** 首次出现时间 */
  firstSeen: string;
  /** 最近一次出现时间 */
  lastSeen: string;
}

/** 下次训练重点建议 */
export interface NextFocus {
  /** 建议重点关注的维度 */
  dimension: SpeakingDimensionKey;
  /** 当前该维度的水平 */
  level: AbilityLevel;
  /** 建议原因 */
  reason: string;
  /** 具体关注的问题（来自高频 issue） */
  focusIssue: string | null;
}

/** 完整的口语能力画像 */
export interface SpeakingAbilityProfile {
  userId: string;
  /** 画像生成时间 */
  generatedAt: string;
  /** 三维度水平与趋势（pronunciation 为 null） */
  dimensions: {
    fluency: DimensionTrend | null;
    lexicalResource: DimensionTrend | null;
    grammaticalRange: DimensionTrend | null;
    pronunciation: null; // Phase 5
  };
  /** 反复出现的问题（按 occurrenceCount 降序，最多 10 条） */
  recurringIssues: RecurringIssue[];
  /** 综合趋势 */
  overallTrend: "improving" | "stable" | "declining" | "insufficient_data";
  /** 下次训练重点 */
  nextFocus: NextFocus | null;
  /** 总练习次数（按 unique sessionId 计） */
  totalSessions: number;
  /** 数据是否充足（至少 2 次练习才有趋势） */
  hasEnoughData: boolean;
}

// =============================================================
// Constants
// =============================================================

const LEVEL_ORDER: Record<AbilityLevel, number> = {
  weak: 1,
  developing: 2,
  adequate: 3,
  strong: 4,
};

const LEVEL_LABELS: Record<AbilityLevel, string> = {
  weak: "薄弱",
  developing: "发展中",
  adequate: "合格",
  strong: "优秀",
};

/** 趋势计算使用最近 N 条 */
const TREND_WINDOW = 5;

/** issues 匹配时的相似度阈值（简化为前缀匹配长度） */
const ISSUE_MATCH_PREFIX_LEN = 10;

// =============================================================
// Main Builder
// =============================================================

/**
 * 构建用户口语能力画像。
 * 纯确定性逻辑，不调用 LLM。
 */
export function buildSpeakingAbilityProfile(userId: string): SpeakingAbilityProfile {
  const repo = getAbilityRepository();
  const allObservations = repo.getAll(userId);

  // 按 unique sourceId 计算总练习次数
  const uniqueSessions = new Set(allObservations.map((o) => o.sourceId));
  const totalSessions = uniqueSessions.size;
  const hasEnoughData = totalSessions >= 2;

  // 按维度分组
  const byDimension = groupByDimension(allObservations);

  // 计算各维度趋势
  const fluency = computeDimensionTrend(byDimension.fluency);
  const lexicalResource = computeDimensionTrend(byDimension.lexicalResource);
  const grammaticalRange = computeDimensionTrend(byDimension.grammaticalRange);

  // 计算反复出现的问题
  const recurringIssues = computeRecurringIssues(allObservations);

  // 计算综合趋势
  const overallTrend = computeOverallTrend(
    [fluency, lexicalResource, grammaticalRange],
    hasEnoughData,
  );

  // 计算下次训练重点
  const nextFocus = computeNextFocus(
    { fluency, lexicalResource, grammaticalRange },
    recurringIssues,
  );

  return {
    userId,
    generatedAt: new Date().toISOString(),
    dimensions: {
      fluency,
      lexicalResource,
      grammaticalRange,
      pronunciation: null,
    },
    recurringIssues,
    overallTrend,
    nextFocus,
    totalSessions,
    hasEnoughData,
  };
}

// =============================================================
// Helpers
// =============================================================

interface DimensionGroup {
  fluency: AbilityObservation[];
  lexicalResource: AbilityObservation[];
  grammaticalRange: AbilityObservation[];
}

function groupByDimension(observations: AbilityObservation[]): DimensionGroup {
  const result: DimensionGroup = {
    fluency: [],
    lexicalResource: [],
    grammaticalRange: [],
  };

  for (const obs of observations) {
    if (obs.dimension in result) {
      result[obs.dimension as keyof DimensionGroup].push(obs);
    }
  }

  // 按时间正序排列（最早的在前）
  for (const key of Object.keys(result) as Array<keyof DimensionGroup>) {
    result[key].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  return result;
}

/**
 * 计算单维度趋势。
 * 返回 null 表示该维度没有任何观察数据。
 */
function computeDimensionTrend(observations: AbilityObservation[]): DimensionTrend | null {
  if (observations.length === 0) return null;

  // 最近 TREND_WINDOW 条
  const recent = observations.slice(-TREND_WINDOW);
  const latest = recent[recent.length - 1]!;
  const previous = recent.length >= 2 ? recent[recent.length - 2]! : null;

  const levelHistory = recent.map((o) => ({
    level: o.level,
    date: o.createdAt,
    sessionId: o.sourceId,
  }));

  // 趋势计算：线性回归简化版
  const trend = computeTrendDirection(recent.map((o) => o.level));

  return {
    currentLevel: latest.level,
    previousLevel: previous?.level ?? null,
    trend,
    levelHistory,
    totalObservations: observations.length,
  };
}

/**
 * 从 level 序列计算趋势方向。
 *
 * 算法：
 * - 将 levels 转为数值序列
 * - 比较后半段均值与前半段均值
 * - 差值 > 0.3 → improving
 * - 差值 < -0.3 → declining
 * - 其他 → stable
 */
function computeTrendDirection(levels: AbilityLevel[]): "improving" | "stable" | "declining" {
  if (levels.length < 2) return "stable";

  const scores = levels.map((l) => LEVEL_ORDER[l]);
  const mid = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, mid);
  const secondHalf = scores.slice(mid);

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const diff = avg(secondHalf) - avg(firstHalf);

  if (diff > 0.3) return "improving";
  if (diff < -0.3) return "declining";
  return "stable";
}

/**
 * 统计反复出现的问题。
 *
 * 算法：
 * - 对所有 observations 的 issues 进行归一化（lowercase + trim）
 * - 用前缀匹配进行聚合（处理 LLM 每次措辞略不同的情况）
 * - 按 occurrenceCount 降序排列
 * - 返回出现 ≥2 次的问题
 */
function computeRecurringIssues(observations: AbilityObservation[]): RecurringIssue[] {
  const issueMap = new Map<string, {
    canonical: string;
    dimension: SpeakingDimensionKey;
    count: number;
    firstSeen: string;
    lastSeen: string;
  }>();

  for (const obs of observations) {
    for (const issue of obs.issues) {
      const normalized = normalizeIssue(issue);
      const key = normalized.slice(0, ISSUE_MATCH_PREFIX_LEN);

      const existing = issueMap.get(key);
      if (existing) {
        existing.count++;
        if (obs.createdAt < existing.firstSeen) existing.firstSeen = obs.createdAt;
        if (obs.createdAt > existing.lastSeen) existing.lastSeen = obs.createdAt;
      } else {
        issueMap.set(key, {
          canonical: issue, // 保留原始表述
          dimension: obs.dimension,
          count: 1,
          firstSeen: obs.createdAt,
          lastSeen: obs.createdAt,
        });
      }
    }
  }

  const recurring: RecurringIssue[] = [];
  for (const data of issueMap.values()) {
    if (data.count >= 2) {
      recurring.push({
        description: data.canonical,
        dimension: data.dimension,
        occurrenceCount: data.count,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
      });
    }
  }

  // 按出现次数降序
  recurring.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  return recurring.slice(0, 10);
}

function normalizeIssue(issue: string): string {
  return issue.toLowerCase().trim().replace(/[，。、！？,.!?]/g, "");
}

/**
 * 综合趋势：各维度趋势的投票。
 */
function computeOverallTrend(
  trends: Array<DimensionTrend | null>,
  hasEnoughData: boolean,
): "improving" | "stable" | "declining" | "insufficient_data" {
  if (!hasEnoughData) return "insufficient_data";

  const valid = trends.filter((t): t is DimensionTrend => t !== null);
  if (valid.length === 0) return "insufficient_data";

  let improving = 0;
  let declining = 0;

  for (const t of valid) {
    if (t.trend === "improving") improving++;
    if (t.trend === "declining") declining++;
  }

  if (improving > declining) return "improving";
  if (declining > improving) return "declining";
  return "stable";
}

/**
 * 确定下次训练重点。
 *
 * 规则（优先级）：
 * 1. 选择 currentLevel 最低的维度
 * 2. 同 level 时选 recurringIssues 最多的维度
 * 3. 从该维度的 recurringIssues 中取 occurrenceCount 最高的作为 focusIssue
 */
function computeNextFocus(
  dimensions: {
    fluency: DimensionTrend | null;
    lexicalResource: DimensionTrend | null;
    grammaticalRange: DimensionTrend | null;
  },
  recurringIssues: RecurringIssue[],
): NextFocus | null {
  const entries: Array<{ key: SpeakingDimensionKey; trend: DimensionTrend }> = [];

  if (dimensions.fluency) entries.push({ key: "fluency", trend: dimensions.fluency });
  if (dimensions.lexicalResource) entries.push({ key: "lexicalResource", trend: dimensions.lexicalResource });
  if (dimensions.grammaticalRange) entries.push({ key: "grammaticalRange", trend: dimensions.grammaticalRange });

  if (entries.length === 0) return null;

  // 按 level 升序排列（最低的在前）
  entries.sort((a, b) => {
    const diff = LEVEL_ORDER[a.trend.currentLevel] - LEVEL_ORDER[b.trend.currentLevel];
    if (diff !== 0) return diff;
    // 同 level，按该维度的 recurring issues 数量降序
    const aIssues = recurringIssues.filter((r) => r.dimension === a.key).length;
    const bIssues = recurringIssues.filter((r) => r.dimension === b.key).length;
    return bIssues - aIssues;
  });

  const target = entries[0]!;
  const topIssue = recurringIssues.find((r) => r.dimension === target.key) ?? null;

  const dimensionLabels: Record<SpeakingDimensionKey, string> = {
    fluency: "流利度与连贯性",
    lexicalResource: "词汇资源",
    grammaticalRange: "语法广度与准确性",
    pronunciation: "发音",
  };

  const reason = buildFocusReason(target.key, target.trend, topIssue, dimensionLabels);

  return {
    dimension: target.key,
    level: target.trend.currentLevel,
    reason,
    focusIssue: topIssue?.description ?? null,
  };
}

function buildFocusReason(
  dimension: SpeakingDimensionKey,
  trend: DimensionTrend,
  topIssue: RecurringIssue | null,
  labels: Record<SpeakingDimensionKey, string>,
): string {
  const dimLabel = labels[dimension];
  const levelLabel = LEVEL_LABELS[trend.currentLevel];

  let reason = `「${dimLabel}」当前水平为${levelLabel}`;

  if (trend.trend === "declining") {
    reason += "，且呈下滑趋势";
  } else if (trend.trend === "stable" && LEVEL_ORDER[trend.currentLevel] <= 2) {
    reason += "，尚未明显改善";
  }

  if (topIssue && topIssue.occurrenceCount >= 2) {
    reason += `。反复出现的问题：${topIssue.description}（已出现 ${topIssue.occurrenceCount} 次）`;
  }

  reason += "。建议下次练习重点关注此维度。";
  return reason;
}
