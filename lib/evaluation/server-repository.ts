/**
 * Speaking Evaluation Repository — 服务端接口 + Memory 实现
 * ------------------------------------------------------------
 * M1: Single Source of Truth
 * 评估结果由服务端 Repository 管理，前端通过 API 访问。
 */
import type { SpeakingEvaluation } from "./types";

export interface EvaluationRepository {
  save(evaluation: SpeakingEvaluation): Promise<SpeakingEvaluation>;
  getBySession(sessionId: string): Promise<SpeakingEvaluation | null>;
  getAll(userId: string): Promise<SpeakingEvaluation[]>;
  getRecent(userId: string, limit: number): Promise<SpeakingEvaluation[]>;
}

export class MemoryEvaluationRepository implements EvaluationRepository {
  private evaluations: SpeakingEvaluation[] = [];

  async save(evaluation: SpeakingEvaluation): Promise<SpeakingEvaluation> {
    const existing = this.evaluations.findIndex((e) => e.sessionId === evaluation.sessionId);
    if (existing >= 0) {
      this.evaluations[existing] = evaluation;
    } else {
      this.evaluations.push(evaluation);
    }
    return evaluation;
  }

  async getBySession(sessionId: string): Promise<SpeakingEvaluation | null> {
    return this.evaluations.find((e) => e.sessionId === sessionId) ?? null;
  }

  async getAll(userId: string): Promise<SpeakingEvaluation[]> {
    return this.evaluations
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
  }

  async getRecent(userId: string, limit: number): Promise<SpeakingEvaluation[]> {
    return (await this.getAll(userId)).slice(0, limit);
  }

  _reset(): void {
    this.evaluations = [];
  }
}
