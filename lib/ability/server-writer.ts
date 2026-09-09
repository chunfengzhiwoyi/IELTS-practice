/**
 * Ability Writer — 服务端版本
 * ------------------------------------------------------------
 * 从 SpeakingAnalysisResult 中提取结构化能力观察，写入服务端 Repository。
 * M1: 原客户端 writer 迁移到服务端，确保能力观察由服务端统一持久化。
 *
 * 职责分离：
 * - Analysis Agent = 推理（生成 ieltsAnalysis）
 * - Ability Writer = 状态更新（将 ieltsAnalysis 沉淀为 observations）
 */
import type { SpeakingAnalysisResult, DimensionAnalysis } from "@/lib/speaking/types";
import type {
  AbilityObservation,
  SpeakingDimensionKey,
  WriteObservationInput,
} from "./types";
import { getAbilityRepository } from "@/lib/repository-factory";

export interface WriteAbilityInput {
  userId: string;
  sessionId: string;
  analysis: SpeakingAnalysisResult;
}

export interface WriteAbilityResult {
  written: number;
  observations: AbilityObservation[];
  skipped: SpeakingDimensionKey[];
}

/**
 * 从 SpeakingAnalysisResult 提取能力观察并写入服务端 Repository。
 * 异步版本（服务端 Repository 返回 Promise）。
 */
export async function writeAbilityObservationsServer(input: WriteAbilityInput): Promise<WriteAbilityResult> {
  const { userId, sessionId, analysis } = input;
  const repo = getAbilityRepository();

  const ielts = analysis.ieltsAnalysis;
  if (!ielts) {
    return { written: 0, observations: [], skipped: ["fluency", "lexicalResource", "grammaticalRange", "pronunciation"] };
  }

  const dimensionsToExtract: Array<{
    key: SpeakingDimensionKey;
    data: DimensionAnalysis | null;
  }> = [
    { key: "fluency", data: ielts.fluency },
    { key: "lexicalResource", data: ielts.lexicalResource },
    { key: "grammaticalRange", data: ielts.grammaticalRange },
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

    const obs = await repo.writeObservation(obsInput);
    observations.push(obs);
  }

  if (!ielts.pronunciation) {
    skipped.push("pronunciation");
  }

  return { written: observations.length, observations, skipped };
}
