"use client";

/**
 * useGoalProfile — Goal 档案加载 hook（PRODUCT-LOOP-02B）
 * 首次加载触发 localStorage → 服务端迁移；此后服务端为权威。
 */
import { useEffect, useState } from "react";
import { loadGoalWithMigration } from "@/lib/client/goal-client";
import type { GoalLoadResult } from "@/lib/client/goal-client";
import type { GoalProfile } from "@/lib/goal/types";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goal/types";

export function useGoalProfile(): GoalLoadResult & { loaded: boolean } {
  const [result, setResult] = useState<GoalLoadResult & { loaded: boolean }>({
    profile: DEFAULT_GOAL_PROFILE,
    authority: "server",
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    loadGoalWithMigration()
      .then((r) => {
        if (!cancelled) setResult({ ...r, loaded: true });
      })
      .catch(() => {
        if (!cancelled) setResult({ profile: DEFAULT_GOAL_PROFILE, authority: "server", loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}

export type { GoalProfile };
