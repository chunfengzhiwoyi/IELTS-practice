/**
 * Learning Service — Repository 工厂
 * ------------------------------------------------------------
 * 根据 DATA_PROVIDER 环境变量返回对应 Repository 实例。
 *   - memory   ：进程内实现（重启即丢，演示用）
 *   - supabase ：Supabase 持久化实现，跨端记忆的同步底座（P2）
 */
import type { LearningRepository } from "@/lib/learning/repository";
import { MemoryLearningRepository } from "@/lib/learning/repositories/memory-learning-repository";
import { SupabaseLearningRepository } from "@/lib/learning/repositories/supabase-learning-repository";
import { seedDemoReviewItems } from "@/lib/learning/demo-review-seed";

let instance: LearningRepository | null = null;

export function getRepository(): LearningRepository {
  if (instance) return instance;
  const provider = process.env.DATA_PROVIDER ?? "memory";
  switch (provider) {
    case "memory":
      instance = new MemoryLearningRepository();
      break;
    case "supabase":
      instance = new SupabaseLearningRepository();
      break;
    default:
      throw new Error(`[learning] 未知 DATA_PROVIDER: ${provider}`);
  }

  // Seed demo review items if enabled
  if (process.env.DEMO_REVIEW_SEED_ENABLED === "true") {
    void seedDemoReviewItems(instance);
  }

  return instance;
}

/** 测试辅助：重置单例 */
export function __resetRepositoryForTests(): void {
  instance = null;
}
