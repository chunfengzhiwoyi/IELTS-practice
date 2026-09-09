/**
 * Evidence Status 自动升迁逻辑（纯函数，服务端/客户端共享）
 * ------------------------------------------------------------
 * 根据历史观察自动计算新 observation 的 evidenceStatus。
 * 从原 LocalStorageAbilityRepository 中提取，供 Memory/Supabase 实现复用。
 */
import type { AbilityObservation, AbilityLevel, EvidenceStatus, SpeakingDimensionKey } from "./types";

const LEVEL_ORDER: Record<AbilityLevel, number> = {
  weak: 1,
  developing: 2,
  adequate: 3,
  strong: 4,
};

/**
 * 计算新观察的 evidenceStatus。
 *
 * 规则：
 * 1. 该维度首次出现 → SINGLE_OBSERVATION
 * 2. 该维度已有 ≥1 条且 level ≤ adequate → REPEATED_PATTERN
 * 3. 最近 2+ 条 level 呈上升趋势 → IMPROVING
 * 4. 之前是 IMPROVING 但 level 回退 → DISPUTED
 * 5. 连续 3+ 次 strong → RESOLVED
 */
export function computeEvidenceStatus(
  userId: string,
  dimension: SpeakingDimensionKey,
  currentLevel: AbilityLevel,
  allObservations: AbilityObservation[],
): EvidenceStatus {
  const history = allObservations
    .filter((o) => o.userId === userId && o.dimension === dimension)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // 首次观察
  if (history.length === 0) {
    return "SINGLE_OBSERVATION";
  }

  const currentScore = LEVEL_ORDER[currentLevel] ?? 2;

  // 连续 strong 检查 → RESOLVED
  const recentLevels = [...history.slice(-2).map((o) => o.level), currentLevel];
  if (recentLevels.length >= 3 && recentLevels.every((l) => l === "strong")) {
    return "RESOLVED";
  }

  const lastObs = history[history.length - 1]!;
  const lastScore = LEVEL_ORDER[lastObs.level] ?? 2;
  const lastStatus = lastObs.evidenceStatus;

  // 之前是 IMPROVING 但回退 → DISPUTED
  if (lastStatus === "IMPROVING" && currentScore < lastScore) {
    return "DISPUTED";
  }

  // 上升趋势检查 → IMPROVING
  if (history.length >= 2) {
    const prevPrevScore = LEVEL_ORDER[history[history.length - 2]!.level] ?? 2;
    if (lastScore > prevPrevScore && currentScore >= lastScore) {
      return "IMPROVING";
    }
  }
  if (currentScore > lastScore && history.length >= 1) {
    return "IMPROVING";
  }

  // 同维度再次出现非 strong → REPEATED_PATTERN
  if (currentScore <= 3) {
    return "REPEATED_PATTERN";
  }

  return "SINGLE_OBSERVATION";
}
