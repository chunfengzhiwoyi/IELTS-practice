/**
 * Ability Observation Repository — 服务端接口 + Memory 实现
 * ------------------------------------------------------------
 * M1: Single Source of Truth
 * 核心业务状态由服务端 Repository 管理，前端通过 API 访问。
 * DATA_PROVIDER=memory 时使用本实现，DATA_PROVIDER=supabase 时使用 Supabase 实现。
 */
import type {
  AbilityObservation,
  AbilityLevel,
  EvidenceStatus,
  SpeakingDimensionKey,
  WriteObservationInput,
} from "./types";
import { computeEvidenceStatus } from "./evidence-status";

export interface AbilityObservationRepository {
  writeObservation(input: WriteObservationInput): Promise<AbilityObservation>;
  getByDimension(userId: string, dimension: SpeakingDimensionKey): Promise<AbilityObservation[]>;
  getAll(userId: string): Promise<AbilityObservation[]>;
  getRecent(userId: string, dimension: SpeakingDimensionKey, limit: number): Promise<AbilityObservation[]>;
  updateStatus(observationId: string, newStatus: EvidenceStatus): Promise<void>;
}

function generateId(): string {
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class MemoryAbilityRepository implements AbilityObservationRepository {
  private observations: AbilityObservation[] = [];

  async writeObservation(input: WriteObservationInput): Promise<AbilityObservation> {
    const evidenceStatus = computeEvidenceStatus(
      input.userId,
      input.dimension,
      input.level as AbilityLevel,
      this.observations,
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

    this.observations.push(observation);
    return observation;
  }

  async getByDimension(userId: string, dimension: SpeakingDimensionKey): Promise<AbilityObservation[]> {
    return this.observations
      .filter((o) => o.userId === userId && o.dimension === dimension)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getAll(userId: string): Promise<AbilityObservation[]> {
    return this.observations
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRecent(userId: string, dimension: SpeakingDimensionKey, limit: number): Promise<AbilityObservation[]> {
    return (await this.getByDimension(userId, dimension)).slice(0, limit);
  }

  async updateStatus(observationId: string, newStatus: EvidenceStatus): Promise<void> {
    const target = this.observations.find((o) => o.id === observationId);
    if (target) {
      target.evidenceStatus = newStatus;
    }
  }

  _reset(): void {
    this.observations = [];
  }
}
