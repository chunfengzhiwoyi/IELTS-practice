/**
 * GoalRepository — Goal 档案的 SSOT 仓储（PRODUCT-LOOP-02B）
 * ------------------------------------------------------------
 * Memory 实现：进程内 Map（与既有 Memory repos 同生命周期）。
 * Supabase：ENV-SUPABASE-01 仍 BLOCKED，本任务不新增 migration；
 * 即使 DATA_PROVIDER=supabase，V1 也回退 MemoryGoalRepository 并显式告警：
 * 数据非 durable、不跨设备同步（绝不 silent fail / 绝不假装已持久化）。
 */
import "server-only";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import type { GoalProfile } from "@/lib/goal/types";

export interface GoalRepository {
  getGoalProfile(userId: string): Promise<GoalProfile | null>;
  upsertGoalProfile(userId: string, profile: GoalProfile): Promise<GoalProfile>;
}

export class MemoryGoalRepository implements GoalRepository {
  private readonly store = new Map<string, GoalProfile>();

  async getGoalProfile(userId: string): Promise<GoalProfile | null> {
    return this.store.get(userId) ?? null;
  }

  async upsertGoalProfile(userId: string, profile: GoalProfile): Promise<GoalProfile> {
    this.store.set(userId, profile);
    return profile;
  }
}

let _goalRepo: GoalRepository | null = null;

/**
 * 单例工厂。V1 恒为 Memory 实现；
 * supabase provider 下记录一次非持久化告警（不阻塞产品开发）。
 */
export function getGoalRepository(): GoalRepository {
  if (!_goalRepo) {
    _goalRepo = new MemoryGoalRepository();
    if (getServerEnv().DATA_PROVIDER === "supabase") {
      logger.warn(
        "Supabase goal persistence is not implemented (ENV-SUPABASE-01 BLOCKED). " +
          "Falling back to non-durable MemoryGoalRepository: goal profile is NOT durable and NOT synced across devices.",
        { event: "GOAL_PERSISTENCE" },
      );
    }
  }
  return _goalRepo;
}

/** 测试用：重置单例 */
export function _resetGoalRepositoryForTests(): void {
  _goalRepo = null;
}
