"use client";
/**
 * Ability Memory Retriever
 * -------------------------------------------------------
 * Phase 4.3: 从 SpeakingAbilityProfile 提取紧凑的能力上下文，
 * 供 Speaking Analysis Agent 的 prompt 注入使用。
 *
 * 设计原则：
 * - 纯确定性逻辑，不调用 LLM
 * - 控制输出长度（≤150 字 / ~120 tokens）
 * - 最多 3 条 recurringIssues
 * - 不返回完整 observations
 * - hasEnoughData=false 时返回 null
 */

import type { AbilityLevel, SpeakingDimensionKey } from "@/lib/ability/types";
import type { SpeakingAbilityProfile, DimensionTrend } from "@/lib/ability/profile-builder";

// =============================================================
// Output Type
// =============================================================

/** 紧凑的能力上下文（控制 prompt token） */
export interface AbilityMemoryContext {
  /** 最弱维度 */
  weakestDimension: SpeakingDimensionKey | null;
  /** 最弱维度当前水平 */
  weakestLevel: AbilityLevel | null;
  /** 反复出现的问题（最多 3 条，仅描述文本） */
  recurringIssues: string[];
  /** 各维度最近趋势 */
  recentTrends: Partial<Record<SpeakingDimensionKey, "improving" | "stable" | "declining">>;
  /** 下次训练重点（一句话） */
  nextFocusSummary: string | null;
  /** 总练习次数 */
  totalSessions: number;
}

// =============================================================
// Main Function
// =============================================================

const LEVEL_ORDER: Record<AbilityLevel, number> = {
  weak: 1,
  developing: 2,
  adequate: 3,
  strong: 4,
};

/**
 * 从 SpeakingAbilityProfile 提取 AbilityMemoryContext。
 *
 * @returns AbilityMemoryContext | null（null 表示数据不足，不应注入 prompt）
 */
export function retrieveAbilityContext(
  profile: SpeakingAbilityProfile,
): AbilityMemoryContext | null {
  // 数据不足时不注入
  if (!profile.hasEnoughData) {
    return null;
  }

  // 1. 找最弱维度
  const { weakestDimension, weakestLevel } = findWeakestDimension(profile);

  // 2. 提取 recurringIssues（最多 3 条）
  const recurringIssues = profile.recurringIssues
    .slice(0, 3)
    .map((r) => r.description);

  // 3. 提取各维度趋势
  const recentTrends: Partial<Record<SpeakingDimensionKey, "improving" | "stable" | "declining">> = {};

  const dimensionEntries: Array<[SpeakingDimensionKey, DimensionTrend | null]> = [
    ["fluency", profile.dimensions.fluency],
    ["lexicalResource", profile.dimensions.lexicalResource],
    ["grammaticalRange", profile.dimensions.grammaticalRange],
  ];

  for (const [key, trend] of dimensionEntries) {
    if (trend) {
      recentTrends[key] = trend.trend;
    }
  }

  // 4. 下次训练重点摘要
  const nextFocusSummary = profile.nextFocus?.reason ?? null;

  return {
    weakestDimension,
    weakestLevel,
    recurringIssues,
    recentTrends,
    nextFocusSummary,
    totalSessions: profile.totalSessions,
  };
}

// =============================================================
// Helpers
// =============================================================

function findWeakestDimension(profile: SpeakingAbilityProfile): {
  weakestDimension: SpeakingDimensionKey | null;
  weakestLevel: AbilityLevel | null;
} {
  let weakestDimension: SpeakingDimensionKey | null = null;
  let weakestScore = Infinity;

  const entries: Array<[SpeakingDimensionKey, DimensionTrend | null]> = [
    ["fluency", profile.dimensions.fluency],
    ["lexicalResource", profile.dimensions.lexicalResource],
    ["grammaticalRange", profile.dimensions.grammaticalRange],
  ];

  for (const [key, trend] of entries) {
    if (!trend) continue;
    const score = LEVEL_ORDER[trend.currentLevel];
    if (score < weakestScore) {
      weakestScore = score;
      weakestDimension = key;
    }
  }

  const weakestLevel = weakestDimension
    ? entries.find(([k]) => k === weakestDimension)?.[1]?.currentLevel ?? null
    : null;

  return { weakestDimension, weakestLevel };
}
