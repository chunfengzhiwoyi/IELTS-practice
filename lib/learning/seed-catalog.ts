/**
 * 本地词库读取
 * ------------------------------------------------------------
 * Mock 模式只允许从本文件读取确定性内容。
 * 未命中时返回 null（调用方返回 DEMO_ITEM_NOT_FOUND）。
 */
import fs from "node:fs";
import path from "node:path";

import type { LearningItem, SeedLearningItem } from "@/lib/learning/types";

let catalog: SeedLearningItem[] | null = null;

function loadCatalog(): SeedLearningItem[] {
  if (catalog) return catalog;
  const filePath = path.resolve(process.cwd(), "data/seed/ielts-learning-items.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  catalog = JSON.parse(raw) as SeedLearningItem[];
  return catalog;
}

/** 标准化 term：全小写，去首尾空格，合并连续空格 */
export function normalizeTerm(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 从本地词库查找 */
export function findSeedItem(rawTerm: string): SeedLearningItem | null {
  const normalized = normalizeTerm(rawTerm);
  return loadCatalog().find((item) => item.normalizedTerm === normalized) ?? null;
}

/** 将 seed 条目转换为 LearningItem（Repository 可直接使用） */
export function seedToLearningItem(seed: SeedLearningItem): LearningItem {
  return {
    id: seed.itemId,
    itemType: seed.itemType,
    canonicalForm: seed.term,
    normalizedTerm: seed.normalizedTerm,
    contentJson: seed,
    topicTags: seed.topicTags,
    createdAt: new Date().toISOString(),
  };
}

/** 获取完整词库供调试 */
export function getAllSeedItems(): SeedLearningItem[] {
  return loadCatalog();
}

/** 测试辅助：重置缓存 */
export function __resetCatalogForTests(): void {
  catalog = null;
}
