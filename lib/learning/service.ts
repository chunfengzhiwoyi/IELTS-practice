/**
 * Learning Service — Repository 工厂
 * ------------------------------------------------------------
 * 根据 DATA_PROVIDER 环境变量返回对应 Repository 实例。
 * 当前 P1 只实现 memory；supabase 实现留作后续。
 */
import type { LearningRepository } from "@/lib/learning/repository";
import { MemoryLearningRepository } from "@/lib/learning/repositories/memory-learning-repository";
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
      // TODO P1+: import { SupabaseLearningRepository } from "./repositories/supabase-learning-repository";
      throw new Error("[learning] DATA_PROVIDER=supabase 尚未实现，请使用 memory");
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
