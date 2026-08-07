/**
 * Demo Review Seed
 * ------------------------------------------------------------
 * When DEMO_REVIEW_SEED_ENABLED=true, seeds 4 items (seed-001 through seed-004)
 * as already-learned with nextReviewAt in the past (so they show as due).
 * Only runs once per process lifetime. Does NOT overwrite existing states.
 */
import type { LearningRepository } from "@/lib/learning/repository";
import { getAllSeedItems, seedToLearningItem } from "@/lib/learning/seed-catalog";

const DEMO_USER_ID = process.env.DEMO_USER_ID ?? "demo-user-001";
const SEED_IDS = ["seed-001", "seed-002", "seed-003", "seed-004"];

let seeded = false;

export async function seedDemoReviewItems(repo: LearningRepository): Promise<void> {
  if (seeded) return;
  seeded = true;

  const allSeeds = getAllSeedItems();
  const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

  for (const seedId of SEED_IDS) {
    const seed = allSeeds.find((s) => s.itemId === seedId);
    if (!seed) continue;

    // Ensure item exists in repo
    const item = await repo.createOrGetItem(seedToLearningItem(seed));

    // Only seed state if not already present
    const existingState = await repo.getUserItemState(DEMO_USER_ID, item.id);
    if (existingState) continue;

    await repo.upsertUserItemState({
      userId: DEMO_USER_ID,
      itemId: item.id,
      status: "RECALLED_INDEPENDENTLY",
      recognitionLevel: 1,
      recallLevel: 1,
      applicationLevel: 0,
      consecutiveCorrect: 1,
      currentIntervalDays: 1,
      nextReviewAt: pastTime,
    });
  }
}

/** 测试辅助：重置 seeded 标志 */
export function __resetDemoReviewSeedForTests(): void {
  seeded = false;
}
