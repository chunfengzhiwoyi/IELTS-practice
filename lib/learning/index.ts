/**
 * Learning 模块公开 API
 * ------------------------------------------------------------
 * 业务代码只从此文件 import。
 */
import "server-only";

export type {
  LearningItem,
  UserItemState,
  LearningEvent,
  SeedLearningItem,
  WordCardResponse,
  LearnSubmitResponse,
  ItemType,
  LearningStatus,
  TaskType,
  EventCorrectness,
} from "@/lib/learning/types";

export type { LearningRepository } from "@/lib/learning/repository";

export { getRepository } from "@/lib/learning/service";
export { findSeedItem, normalizeTerm, seedToLearningItem, getAllSeedItems } from "@/lib/learning/seed-catalog";
export { seedDemoReviewItems } from "@/lib/learning/demo-review-seed";
