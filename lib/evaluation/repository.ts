"use client";
/**
 * Evaluation Repository
 * -------------------------------------------------------
 * Phase 5: localStorage 存取 SpeakingEvaluation。
 * key: els_speaking_evaluations
 */

import { getItem, setItem } from "@/lib/client/storage";
import type { SpeakingEvaluation } from "@/lib/evaluation/types";

// =============================================================
// Interface
// =============================================================

export interface EvaluationRepository {
  /** 保存一条评估结果 */
  save(evaluation: SpeakingEvaluation): void;
  /** 按 session ID 获取评估 */
  getBySession(sessionId: string): SpeakingEvaluation | null;
  /** 获取用户所有评估（时间倒序） */
  getAll(userId: string): SpeakingEvaluation[];
  /** 获取用户最近 N 条评估 */
  getRecent(userId: string, limit: number): SpeakingEvaluation[];
}

// =============================================================
// localStorage Implementation
// =============================================================

const STORAGE_KEY = "speaking_evaluations";

function loadAll(): SpeakingEvaluation[] {
  return getItem<SpeakingEvaluation[]>(STORAGE_KEY) ?? [];
}

function saveAll(evaluations: SpeakingEvaluation[]): void {
  setItem(STORAGE_KEY, evaluations);
}

export class LocalStorageEvaluationRepository implements EvaluationRepository {
  save(evaluation: SpeakingEvaluation): void {
    const all = loadAll();

    // 避免重复（同一 session 只保存一次）
    const existing = all.findIndex((e) => e.sessionId === evaluation.sessionId);
    if (existing >= 0) {
      all[existing] = evaluation; // 覆盖更新
    } else {
      all.push(evaluation);
    }

    saveAll(all);
  }

  getBySession(sessionId: string): SpeakingEvaluation | null {
    return loadAll().find((e) => e.sessionId === sessionId) ?? null;
  }

  getAll(userId: string): SpeakingEvaluation[] {
    return loadAll()
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
  }

  getRecent(userId: string, limit: number): SpeakingEvaluation[] {
    return this.getAll(userId).slice(0, limit);
  }
}

// =============================================================
// Singleton
// =============================================================

let _instance: LocalStorageEvaluationRepository | null = null;

export function getEvaluationRepository(): EvaluationRepository {
  if (!_instance) {
    _instance = new LocalStorageEvaluationRepository();
  }
  return _instance;
}
