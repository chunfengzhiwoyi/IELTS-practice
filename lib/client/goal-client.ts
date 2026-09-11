"use client";

/**
 * Goal 客户端访问层 — PRODUCT-LOOP-02B
 * ------------------------------------------------------------
 * 服务端 GoalRepository 是 Goal 的 reference-client authority；
 * localStorage 降级为 migration source / offline cache（P2 再清理旧 key）。
 * 迁移策略：
 *   首次加载：服务端无档案 && 本地 weeklyGoal 存在 → PUT /api/goal
 *   成功后：服务端为权威；本地仅作缓存。
 *   新的 Goal 修改必须走 API（saveGoalProfileToServer）。
 */
import {
  getGoalProfile,
  saveGoalProfile,
  hasLocalGoalProfile,
} from "@/lib/goal";
import type { GoalProfile } from "@/lib/goal/types";

export interface GoalApiEnvelope {
  profile: GoalProfile;
  persisted: boolean;
  storage: "memory" | "supabase";
  durable: boolean;
  provider?: string;
}

export type FetchLike = typeof fetch;

async function parseJson<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`goal api ${r.status}`);
  return (await r.json()) as T;
}

export async function fetchGoalProfileFromServer(
  fetchImpl: FetchLike = fetch,
): Promise<GoalApiEnvelope> {
  const r = await fetchImpl("/api/goal");
  return parseJson<GoalApiEnvelope>(r);
}

export async function saveGoalProfileToServer(
  profile: GoalProfile,
  fetchImpl: FetchLike = fetch,
): Promise<GoalApiEnvelope> {
  const r = await fetchImpl("/api/goal", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  return parseJson<GoalApiEnvelope>(r);
}

export type GoalLoadResult = {
  profile: GoalProfile;
  authority: "server" | "migrated" | "local-cache";
};

/**
 * 加载 Goal 档案（含首次迁移）。
 * - 服务端已有 → server（权威）。
 * - 服务端无 + 本地有 → 迁移到服务端 → migrated（此后服务端权威）。
 * - 服务端无 + 本地无 → server（默认轮廓）。
 * - API 不可用（离线/出错）→ local-cache 回退，不抛错。
 */
export async function loadGoalWithMigration(
  fetchImpl: FetchLike = fetch,
): Promise<GoalLoadResult> {
  let server: GoalApiEnvelope;
  try {
    server = await fetchGoalProfileFromServer(fetchImpl);
  } catch {
    return { profile: getGoalProfile(), authority: "local-cache" };
  }
  if (server.persisted) return { profile: server.profile, authority: "server" };
  if (hasLocalGoalProfile()) {
    const local = getGoalProfile();
    try {
      await saveGoalProfileToServer(local, fetchImpl);
      return { profile: local, authority: "migrated" };
    } catch {
      return { profile: local, authority: "local-cache" };
    }
  }
  return { profile: server.profile, authority: "server" };
}

/**
 * 保存 Goal（新修改必须走 API）。成功后刷新本地缓存（写通）。
 * API 失败时保留本地缓存并抛错（调用方决定是否提示）。
 */
export async function saveGoalAuthoritative(
  profile: GoalProfile,
  fetchImpl: FetchLike = fetch,
): Promise<GoalLoadResult> {
  const saved = await saveGoalProfileToServer(profile, fetchImpl);
  saveGoalProfile(saved.profile);
  return { profile: saved.profile, authority: "server" };
}
