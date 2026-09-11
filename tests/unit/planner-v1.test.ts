/**
 * Planner V1 单元测试（PRODUCT-LOOP-02B §14 cases 1–8）
 * 纯函数、确定性、无 LLM；Band 不参与数量计算。
 */
import { describe, it, expect } from "vitest";
import { planToday } from "@/lib/planner/planner-v1";
import type { PlannerInput } from "@/lib/planner/planner-v1";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goal/types";

const NOW = new Date("2026-09-11T09:00:00+08:00");

function baseInput(over: Partial<PlannerInput> = {}): PlannerInput {
  return {
    goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 200 },
    dueCount: 0,
    speakingIdleDays: null,
    abilityNextFocusDimension: null,
    recurringIssueCount: 0,
    learnedThisWeek: 0,
    daysElapsedThisWeek: 3,
    feasibility: "comfortable",
    now: NOW,
    ...over,
  };
}

describe("planner-v1", () => {
  it("case 1: 有到期复习 → Review 优先", () => {
    const plan = planToday(baseInput({ dueCount: 3 }));
    expect(plan.primary.type).toBe("REVIEW");
    expect(plan.actions[0]!.type).toBe("REVIEW");
    expect(plan.primary.reason).toContain("3");
    expect(plan.primary.href).toBe("/review");
  });

  it("case 2: due 很多 → 新学可降到 0", () => {
    const plan = planToday(baseInput({ dueCount: 10 }));
    expect(plan.actions.some((a) => a.type === "REVIEW")).toBe(true);
    expect(plan.actions.some((a) => a.type === "LEARN_NEW")).toBe(false);
  });

  it("case 3: Speaking idle 超阈值 → 有 Review 时也保留最小 Speaking slot（预算允许）", () => {
    const plan = planToday(baseInput({ dueCount: 2, speakingIdleDays: 5 }));
    const types = plan.actions.map((a) => a.type);
    expect(types).toContain("REVIEW");
    expect(types).toContain("SPEAKING");
    const speaking = plan.actions.find((a) => a.type === "SPEAKING")!;
    expect(speaking.estimatedMinutes).toBeGreaterThanOrEqual(5);
  });

  it("case 4: 无 due + Speaking idle → Speaking primary", () => {
    const plan = planToday(baseInput({ dueCount: 0, speakingIdleDays: 6 }));
    expect(plan.primary.type).toBe("SPEAKING");
    expect(plan.actions[0]!.type).toBe("SPEAKING");
  });

  it("case 5: 周目标落后 → Learn New", () => {
    const plan = planToday(baseInput({ dueCount: 0, learnedThisWeek: 0, daysElapsedThisWeek: 3 }));
    expect(plan.primary.type).toBe("LEARN_NEW");
    const learn = plan.actions.find((a) => a.type === "LEARN_NEW")!;
    expect(learn.target.count).toBeGreaterThan(0);
    // 200/7=28.6 → 上限 20
    expect(learn.target.count).toBe(20);
    expect(plan.primary.reason).toContain("进度偏慢");
  });

  it("case 6: 周目标达成 + 无 due + cadence 满足 → REST", () => {
    const plan = planToday(
      baseInput({ dueCount: 0, learnedThisWeek: 200, daysElapsedThisWeek: 7, speakingIdleDays: 0 }),
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.primary.type).toBe("REST");
  });

  it("case 7: Band 不参与数量计算（改 Band 结果不变）", () => {
    const p6 = planToday(baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 200, targetBand: 6.5 } }));
    const p7 = planToday(baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 200, targetBand: 7.5 } }));
    expect(p6).toEqual(p7);
  });

  it("case 8: 相同输入 → 完全相同 Plan（确定性）", () => {
    const input = baseInput({ dueCount: 2, speakingIdleDays: 1, learnedThisWeek: 40 });
    const a = planToday(input);
    const b = planToday(input);
    expect(a).toEqual(b);
    expect(a.computedBy).toBe("planner-v1");
  });

  it("case 7b: 薄弱维度触发定向 Speaking（recurring >= 2）", () => {
    const plan = planToday(
      baseInput({ dueCount: 0, recurringIssueCount: 3, abilityNextFocusDimension: "fluency" }),
    );
    const speaking = plan.actions.find((a) => a.type === "SPEAKING");
    expect(speaking).toBeDefined();
    expect(speaking!.target.dimension).toBe("fluency");
  });

  it("压缩顺序：预算不足先压 LEARN_NEW，再压可选 Speaking，Review 保留", () => {
    // 预算 5：due 2（1min）→ 复习；口语超 idle（5min，受保护）→ 保留；learn 被压到 0
    const plan = planToday(
      baseInput({
        goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 5, weeklyWordTarget: 200 },
        dueCount: 2,
        speakingIdleDays: 4,
        learnedThisWeek: 0,
        daysElapsedThisWeek: 3,
      }),
    );
    const types = plan.actions.map((a) => a.type);
    expect(types).toEqual(["REVIEW", "SPEAKING"]);
  });
});
