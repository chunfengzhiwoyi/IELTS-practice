/**
 * GET /api/today 路由测试（PRODUCT-LOOP-03B §20 today endpoint tests）
 * 服务端聚合 Goal + 学习状态 + Speaking + Ability → Planner → TodayPlan。
 * 验证响应契约：computedBy / budgetStatus / inputsSnapshot / dueCount 透传。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/today/route";
import { _resetGoalRepositoryForTests } from "@/lib/goal/repository";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goal/types";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ DATA_PROVIDER: "memory" }),
}));

vi.mock("@/lib/repository-factory", () => ({
  getLearningRepository: () => ({
    getAllUserItemStates: async () => [
      { itemId: "a", nextReviewAt: new Date(Date.now() - 60000).toISOString(), status: "RECALLED_INDEPENDENTLY" },
      { itemId: "b", nextReviewAt: new Date(Date.now() + 86400000).toISOString(), status: "LEARNING" },
    ],
    getUserEventsInRange: async () => [
      { eventType: "NEW", itemId: "a", createdAt: new Date().toISOString() },
      { eventType: "REVIEW", itemId: "a", createdAt: new Date().toISOString(), correctness: "INDEPENDENT" },
    ],
  }),
  getSpeakingRepository: () => ({
    getRecentSessions: async () => [],
  }),
  getAbilityRepository: () => ({
    getAll: async () => [],
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    }),
  },
}));

function bodyOf(res: { body: unknown }): Record<string, unknown> {
  return (res.body ?? {}) as Record<string, unknown>;
}

describe("api/today", () => {
  beforeEach(() => {
    _resetGoalRepositoryForTests();
  });

  it("GET: 返回 Planner 生成的 TodayPlan（computedBy + budgetStatus + inputsSnapshot）", async () => {
    const res = await GET({ headers: new Headers({ "x-trace-id": "t" }) } as unknown as Request);
    expect(res.status).toBe(200);
    const plan = bodyOf(res) as {
      computedBy: string;
      budgetStatus: string;
      dailyBudgetMinutes: number;
      actions: unknown[];
      inputsSnapshot: { dueCount: number; speakingIdleDays: number | null; feasibility: string };
    };
    expect(plan.computedBy).toBe("planner-v1");
    expect(["WITHIN_BUDGET", "OVERLOADED"]).toContain(plan.budgetStatus);
    expect(Array.isArray(plan.actions)).toBe(true);
    expect(plan.actions.length).toBeGreaterThan(0);
    // due=1（a 已到期；b 正好 now 未到期）→ 透传 inputsSnapshot.dueCount
    expect(plan.inputsSnapshot.dueCount).toBe(1);
    // 无口语历史 → null → cadence overdue → SPEAKING 出现
    expect(plan.inputsSnapshot.speakingIdleDays).toBeNull();
    const types = (plan.actions as { type: string }[]).map((a) => a.type);
    expect(types).toContain("SPEAKING");
    // 无考试日期 → feasibility unknown（context-only 快照）
    expect(plan.inputsSnapshot.feasibility).toBe("unknown");
  });

  it("GET: Goal 已保存时使用服务端档案（dailyMinutes/weeklyWordTarget 生效）", async () => {
    // 预置 Goal（MemoryGoalRepository）
    const repo = (await import("@/lib/goal/repository")).getGoalRepository();
    await repo.upsertGoalProfile("user-1", {
      ...DEFAULT_GOAL_PROFILE,
      dailyMinutes: 10,
      weeklyWordTarget: 30,
      examDate: null,
    });

    const res = await GET({ headers: new Headers({ "x-trace-id": "t" }) } as unknown as Request);
    const plan = bodyOf(res) as { dailyBudgetMinutes: number };
    expect(plan.dailyBudgetMinutes).toBe(10);
  });
});
