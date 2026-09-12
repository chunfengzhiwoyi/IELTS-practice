/**
 * Repository Factory — 单例入口
 * ------------------------------------------------------------
 * M1: Single Source of Truth
 * 所有业务 Repository 通过本工厂创建，确保同一进程内单例一致。
 * DATA_PROVIDER=memory → Memory 实现（demo 模式）
 * DATA_PROVIDER=supabase → Supabase 实现（持久化）
 *
 * 前端不感知底层 provider，始终通过 API 使用业务数据。
 */
import { getServerEnv } from "@/lib/env";
import type { LearningRepository } from "@/lib/learning/repository";
import { MemoryLearningRepository } from "@/lib/learning/repositories/memory-learning-repository";
import { SupabaseLearningRepository } from "@/lib/learning/repositories/supabase-learning-repository";
import { seedDemoReviewItems } from "@/lib/learning/demo-review-seed";
import type { SpeakingRepository } from "@/lib/speaking/repository";
import { MemorySpeakingRepository } from "@/lib/speaking/repository";
import { SupabaseSpeakingRepository } from "@/lib/speaking/repositories/supabase-speaking-repository";
import type { AbilityObservationRepository } from "@/lib/ability/server-repository";
import { MemoryAbilityRepository } from "@/lib/ability/server-repository";
import { SupabaseAbilityRepository } from "@/lib/ability/repositories/supabase-ability-repository";
import type { EvaluationRepository } from "@/lib/evaluation/server-repository";
import { MemoryEvaluationRepository } from "@/lib/evaluation/server-repository";
import { SupabaseEvaluationRepository } from "@/lib/evaluation/repositories/supabase-evaluation-repository";
import type { ApplicationEvidenceRepository } from "@/lib/learning/application-evidence";
import { MemoryApplicationEvidenceRepository } from "@/lib/learning/repositories/memory-application-evidence-repository";
import { SupabaseApplicationEvidenceRepository } from "@/lib/learning/repositories/supabase-application-evidence-repository";

// Singleton instances
let _learningRepo: LearningRepository | null = null;
let _speakingRepo: SpeakingRepository | null = null;
let _abilityRepo: AbilityObservationRepository | null = null;
let _evaluationRepo: EvaluationRepository | null = null;
let _applicationEvidenceRepo: ApplicationEvidenceRepository | null = null;

export function getLearningRepository(): LearningRepository {
  if (!_learningRepo) {
    _learningRepo = getServerEnv().DATA_PROVIDER === "supabase"
      ? new SupabaseLearningRepository()
      : new MemoryLearningRepository();

    // Seed demo review items if enabled (memory mode only)
    if (process.env.DEMO_REVIEW_SEED_ENABLED === "true" && getServerEnv().DATA_PROVIDER === "memory") {
      void seedDemoReviewItems(_learningRepo);
    }
  }
  return _learningRepo;
}

export function getSpeakingRepository(): SpeakingRepository {
  if (!_speakingRepo) {
    _speakingRepo = getServerEnv().DATA_PROVIDER === "supabase"
      ? new SupabaseSpeakingRepository()
      : new MemorySpeakingRepository();
  }
  return _speakingRepo;
}

export function getAbilityRepository(): AbilityObservationRepository {
  if (!_abilityRepo) {
    _abilityRepo = getServerEnv().DATA_PROVIDER === "supabase"
      ? new SupabaseAbilityRepository()
      : new MemoryAbilityRepository();
  }
  return _abilityRepo;
}

export function getEvaluationRepository(): EvaluationRepository {
  if (!_evaluationRepo) {
    _evaluationRepo = getServerEnv().DATA_PROVIDER === "supabase"
      ? new SupabaseEvaluationRepository()
      : new MemoryEvaluationRepository();
  }
  return _evaluationRepo;
}

export function getApplicationEvidenceRepository(): ApplicationEvidenceRepository {
  if (!_applicationEvidenceRepo) {
    _applicationEvidenceRepo = getServerEnv().DATA_PROVIDER === "supabase"
      ? new SupabaseApplicationEvidenceRepository()
      : new MemoryApplicationEvidenceRepository();
  }
  return _applicationEvidenceRepo;
}

/** 测试用：重置所有 singleton（仅 memory 模式有意义） */
export function _resetRepositories(): void {
  _learningRepo = null;
  _speakingRepo = null;
  _abilityRepo = null;
  _evaluationRepo = null;
  _applicationEvidenceRepo = null;
}
