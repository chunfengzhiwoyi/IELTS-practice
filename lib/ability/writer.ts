"use client";
/**
 * Ability Writer
 * -------------------------------------------------------
 * 从 SpeakingAnalysisResult 中提取结构化能力观察，写入 Repository。
 *
 * 职责分离：
 * - Analysis Agent = 推理（生成 ieltsAnalysis）
 * - Ability Writer = 状态更新（将 ieltsAnalysis 沉淀为 observations）
 *
 * 调用时机：每次 speaking analysis 完成后，由前端 speaking-page 调用。
 */

import type { SpeakingAnalysisResult, DimensionAnalysis } from "@/lib/speaking/types";
import type {
  AbilityObservation,
  SpeakingDimensionKey,
  WriteObservationInput,
} from "@/lib/ability/types";
import { getAbilityRepository } from "@/lib/ability/repository";

/** Writer 的输入参数 */
export interface WriteAbilityInput {
  /** 用户 ID */
  userId: string;
  /** Speaking Session ID（来源追溯） */
  sessionId: string;
  /** 分析结果（必须含 ieltsAnalysis） */
  analysis: SpeakingAnalysisResult;
}

/** Writer 的输出 */
export interface WriteAbilityResult {
  /** 本次写入的 observations 数量 */
  written: number;
  /** 写入的 observations（供 UI 展示或调试） */
  observations: AbilityObservation[];
  /** 跳过的维度（ieltsAnalysis 中为 null 的维度） */
  skipped: SpeakingDimensionKey[];
}

/**
 * 从 SpeakingAnalysisResult 提取能力观察并写入 Repository。
 *
 * 提取逻辑：
 * 1. 检查 ieltsAnalysis 是否存在
 * 2. 遍历 fluency / lexicalResource / grammaticalRange 三个维度
 * 3. 每个非 null 维度生成一条 WriteObservationInput
 * 4. 调用 repository.writeObservation() 写入（自动计算 evidenceStatus）
 * 5. pronunciation 当前跳过（Phase 5）
 */
export function writeAbilityObservations(input: WriteAbilityInput): WriteAbilityResult {
  const { userId, sessionId, analysis } = input;
  const repo = getAbilityRepository();

  const ielts = analysis.ieltsAnalysis;
  if (!ielts) {
    // 文字回答降级模式 或 LLM 失败时无 ieltsAnalysis
    return { written: 0, observations: [], skipped: ["fluency", "lexicalResource", "grammaticalRange", "pronunciation"] };
  }

  const dimensionsToExtract: Array<{
    key: SpeakingDimensionKey;
    data: DimensionAnalysis | null;
  }> = [
    { key: "fluency", data: ielts.fluency },
    { key: "lexicalResource", data: ielts.lexicalResource },
    { key: "grammaticalRange", data: ielts.grammaticalRange },
    // pronunciation 当前为 null（Phase 5）
    // { key: "pronunciation", data: ielts.pronunciation },
  ];

  const observations: AbilityObservation[] = [];
  const skipped: SpeakingDimensionKey[] = [];

  for (const { key, data } of dimensionsToExtract) {
    if (!data) {
      skipped.push(key);
      continue;
    }

    const obsInput: WriteObservationInput = {
      userId,
      dimension: key,
      level: data.level,
      issues: data.issues,
      evidence: data.evidence,
      suggestions: data.suggestions,
      sourceType: "SPEAKING",
      sourceId: sessionId,
    };

    const obs = repo.writeObservation(obsInput);
    observations.push(obs);
  }

  // pronunciation 始终跳过
  if (!ielts.pronunciation) {
    skipped.push("pronunciation");
  }

  return {
    written: observations.length,
    observations,
    skipped,
  };
}

/**
 * 便捷方法：检查某维度是否存在反复出现的问题模式。
 * 用于后续 Speaking Agent prompt 注入历史弱点。
 */
export function hasRepeatedPattern(
  userId: string,
  dimension: SpeakingDimensionKey,
): boolean {
  const repo = getAbilityRepository();
  const recent = repo.getRecent(userId, dimension, 5);
  return recent.some(
    (o) => o.evidenceStatus === "REPEATED_PATTERN" || o.evidenceStatus === "DISPUTED",
  );
}
