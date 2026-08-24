"use client";
/**
 * Ability Observation Repository
 * -------------------------------------------------------
 * Interface + localStorage 实现（demo 模式）。
 * 后续可增加 SupabaseAbilityRepository 对接 ability_observations 表。
 */

import { getItem, setItem } from "@/lib/client/storage";
import type {
  AbilityObservation,
  EvidenceStatus,
  SpeakingDimensionKey,
  WriteObservationInput,
} from "@/lib/ability/types";

// =============================================================
// Interface
// =============================================================

export interface AbilityObservationRepository {
  /** 写入一条新的能力观察 */
  writeObservation(input: WriteObservationInput): AbilityObservation;

  /** 获取用户某维度的所有观察（按时间倒序） */
  getByDimension(userId: string, dimension: SpeakingDimensionKey): AbilityObservation[];

  /** 获取用户所有观察（按时间倒序） */
  getAll(userId: string): AbilityObservation[];

  /** 获取用户某维度最近 N 条观察 */
  getRecent(userId: string, dimension: SpeakingDimensionKey, limit: number): AbilityObservation[];

  /** 更新某条观察的 evidenceStatus */
  updateStatus(observationId: string, newStatus: EvidenceStatus): void;
}

// =============================================================
// localStorage Implementation
// =============================================================

const STORAGE_KEY = "ability_observations";

function loadAll(): AbilityObservation[] {
  return getItem<AbilityObservation[]>(STORAGE_KEY) ?? [];
}

function saveAll(observations: AbilityObservation[]): void {
  setItem(STORAGE_KEY, observations);
}

function generateId(): string {
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * localStorage-backed AbilityObservationRepository.
 * 适用于 demo 模式和未登录用户。
 */
export class LocalStorageAbilityRepository implements AbilityObservationRepository {
  writeObservation(input: WriteObservationInput): AbilityObservation {
    const observations = loadAll();

    // 自动计算 evidenceStatus
    const evidenceStatus = this.computeEvidenceStatus(
      input.userId,
      input.dimension,
      input.level,
      observations,
    );

    const observation: AbilityObservation = {
      id: generateId(),
      userId: input.userId,
      dimension: input.dimension,
      level: input.level,
      issues: input.issues,
      evidence: input.evidence,
      suggestions: input.suggestions.slice(0, 2),
      evidenceStatus,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
    };

    observations.push(observation);
    saveAll(observations);
    return observation;
  }

  getByDimension(userId: string, dimension: SpeakingDimensionKey): AbilityObservation[] {
    return loadAll()
      .filter((o) => o.userId === userId && o.dimension === dimension)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getAll(userId: string): AbilityObservation[] {
    return loadAll()
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getRecent(userId: string, dimension: SpeakingDimensionKey, limit: number): AbilityObservation[] {
    return this.getByDimension(userId, dimension).slice(0, limit);
  }

  updateStatus(observationId: string, newStatus: EvidenceStatus): void {
    const observations = loadAll();
    const target = observations.find((o) => o.id === observationId);
    if (target) {
      target.evidenceStatus = newStatus;
      saveAll(observations);
    }
  }

  // =============================================================
  // Evidence Status 自动升迁逻辑
  // =============================================================

  /**
   * 根据历史观察自动计算新 observation 的 evidenceStatus。
   *
   * 规则：
   * 1. 该维度首次出现 → SINGLE_OBSERVATION
   * 2. 该维度已有 ≥1 条且 level ≤ adequate → REPEATED_PATTERN
   * 3. 最近 2+ 条 level 呈上升趋势 → IMPROVING
   * 4. 之前是 IMPROVING 但 level 回退 → DISPUTED
   * 5. 连续 3+ 次 strong → RESOLVED
   */
  private computeEvidenceStatus(
    userId: string,
    dimension: SpeakingDimensionKey,
    currentLevel: string,
    allObservations: AbilityObservation[],
  ): EvidenceStatus {
    const history = allObservations
      .filter((o) => o.userId === userId && o.dimension === dimension)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // 按时间正序

    // 首次观察
    if (history.length === 0) {
      return "SINGLE_OBSERVATION";
    }

    const levelOrder: Record<string, number> = { weak: 1, developing: 2, adequate: 3, strong: 4 };
    const currentScore = levelOrder[currentLevel] ?? 2;

    // 连续 strong 检查 → RESOLVED
    const recentLevels = [...history.slice(-2).map((o) => o.level), currentLevel];
    if (recentLevels.length >= 3 && recentLevels.every((l) => l === "strong")) {
      return "RESOLVED";
    }

    // 最近的 observation
    const lastObs = history[history.length - 1]!;
    const lastScore = levelOrder[lastObs.level] ?? 2;
    const lastStatus = lastObs.evidenceStatus;

    // 之前是 IMPROVING 但回退 → DISPUTED
    if (lastStatus === "IMPROVING" && currentScore < lastScore) {
      return "DISPUTED";
    }

    // 上升趋势检查 → IMPROVING
    if (history.length >= 2) {
      const prevPrevScore = levelOrder[history[history.length - 2]!.level] ?? 2;
      if (lastScore > prevPrevScore && currentScore >= lastScore) {
        return "IMPROVING";
      }
    }
    if (currentScore > lastScore) {
      // 比上次高也算 improving（只要有 2+ 条历史）
      if (history.length >= 1) {
        return "IMPROVING";
      }
    }

    // 同维度再次出现非 strong → REPEATED_PATTERN
    if (currentScore <= 3) {
      return "REPEATED_PATTERN";
    }

    return "SINGLE_OBSERVATION";
  }
}

// =============================================================
// Singleton Export（demo 模式）
// =============================================================

let _instance: LocalStorageAbilityRepository | null = null;

export function getAbilityRepository(): AbilityObservationRepository {
  if (!_instance) {
    _instance = new LocalStorageAbilityRepository();
  }
  return _instance;
}
