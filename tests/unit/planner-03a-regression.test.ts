/**
 * Planner 03A 场景回归（PRODUCT-LOOP-03B §17/§20）
 * 把 03A 审计发现的关键场景固化为测试：
 * - P1-1 悬崖（due 4→5）、REVIEW 垄断日（B1–B3）
 * - P1-2 静默超预算（B10–B11 / D6–D7）
 * - P2-3 weekly=0（E1）、P2-1 examDate（F4/F5）
 * - 7-day 模拟：NORMAL / REVIEW_HEAVY / SPEAKING_NEGLECT
 */
import { describe, it, expect } from "vitest";
import { planToday } from "@/lib/planner/planner-v1";
import type { PlannerInput } from "@/lib/planner/planner-v1";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goal/types";

const NOW = new Date("2026-09-11T09:00:00+08:00");

function input(over: Partial<PlannerInput>): PlannerInput {
  return {
    goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 200 },
    dueCount: 0,
    speakingIdleDays: 0,
    abilityNextFocusDimension: null,
    recurringIssueCount: 0,
    learnedThisWeek: 0,
    daysElapsedThisWeek: 3,
    feasibility: "comfortable",
    now: NOW,
    ...over,
  };
}

function sumMinutes(plan: ReturnType<typeof planToday>): number {
  return plan.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
}

function learnOf(plan: ReturnType<typeof planToday>): number {
  return plan.actions.find((a) => a.type === "LEARN_NEW")?.target.count ?? 0;
}

describe("03A P1-1 regression: due gate 悬崖与垄断", () => {
  it("B1–B3: due=5 且预算 10/20/30 → 不再「仅复习」垄断日（有预算余量即有新学）", () => {
    const g = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 30 };
    for (const budget of [10, 20, 30]) {
      const plan = planToday(input({ goal: { ...g, dailyMinutes: budget }, dueCount: 5 }));
      expect(learnOf(plan)).toBeGreaterThan(0);
      expect(plan.actions.some((a) => a.type === "REVIEW")).toBe(true);
      expect(plan.budgetStatus).toBe("WITHIN_BUDGET");
    }
  });

  it("weekly=140 放大版悬崖消失（due 4→5 不再 18→0）", () => {
    const g = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 140 };
    const p4 = planToday(input({ goal: g, dueCount: 4 }));
    const p5 = planToday(input({ goal: g, dueCount: 5 }));
    expect(learnOf(p4)).toBe(18);
    expect(learnOf(p5)).toBe(18);
  });
});

describe("03A P1-2 regression: 静默超预算", () => {
  it("B10–B11: due=50 预算 10/20 → 不再静默超预算", () => {
    for (const budget of [10, 20]) {
      const plan = planToday(input({ goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: budget, weeklyWordTarget: 200 }, dueCount: 50 }));
      if (plan.budgetStatus === "WITHIN_BUDGET") {
        expect(sumMinutes(plan)).toBeLessThanOrEqual(plan.dailyBudgetMinutes);
      } else {
        expect(plan.overloadReason).toBeDefined();
      }
    }
  });

  it("D6–D7: due=20 idle=5 预算 5/10 → OVERLOADED 且带原因（floor 装不下）", () => {
    for (const budget of [5, 10]) {
      const plan = planToday(
        input({
          goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: budget, weeklyWordTarget: 30 },
          dueCount: 20,
          speakingIdleDays: 5,
        }),
      );
      expect(plan.budgetStatus).toBe("OVERLOADED");
      expect(plan.overloadReason).toBeTruthy();
    }
  });
});

describe("03A P2 regression: 语义边界", () => {
  it("E1: weeklyWordTarget=0 → 不再强制 learn=1", () => {
    const g = { ...DEFAULT_GOAL_PROFILE, weeklyWordTarget: 0 };
    const plan = planToday(input({ goal: g, dueCount: 0 }));
    expect(learnOf(plan)).toBe(0);
    expect(plan.primary.type).toBe("REST");
  });

  it("F4/F5: examDate null/明天 → 决策完全一致（context-only）", () => {
    const a = planToday(input({ goal: { ...DEFAULT_GOAL_PROFILE, examDate: null } }));
    const b = planToday(input({ goal: { ...DEFAULT_GOAL_PROFILE, examDate: "2026-09-13" } }));
    expect(a).toEqual(b);
  });
});

describe("03A 7-day regression: 三类学习者", () => {
  it("NORMAL: 不再 LEARN↔REVIEW-only 机械交替", () => {
    let due = 0;
    let learned = 0;
    const learnByDay: number[] = [];
    for (let day = 1; day <= 7; day++) {
      const plan = planToday(
        input({
          goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 30 },
          dueCount: due,
          learnedThisWeek: learned,
          daysElapsedThisWeek: day,
        }),
      );
      const learn = learnOf(plan);
      learnByDay.push(learn);
      learned += learn;
      due = learn;
    }
    // 旧行为 [5,0,5,0,5,0,5]（Day2/4/6 被闸门冻结为仅复习）
    expect(learnByDay).toEqual([5, 5, 5, 5, 5, 5, 0]);
  });

  it("REVIEW_HEAVY: 持续积压下新学不再饿死（7/7 天有新学）", () => {
    let due = 20;
    let learned = 0;
    const learnByDay: number[] = [];
    const dueByDay: number[] = [];
    const incoming = 15;
    for (let day = 1; day <= 7; day++) {
      const plan = planToday(
        input({
          goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 15, weeklyWordTarget: 20 },
          dueCount: due,
          learnedThisWeek: learned,
          daysElapsedThisWeek: day,
        }),
      );
      const learn = learnOf(plan);
      const reviewCount = plan.actions.find((a) => a.type === "REVIEW")?.target.count ?? 0;
      learnByDay.push(learn);
      dueByDay.push(due);
      learned += learn;
      // review 清空 count 项；外部到达补充
      due = Math.max(0, due - reviewCount) + incoming;
    }
    expect(learnByDay.every((n) => n > 0)).toBe(true); // 新学不饿死
    expect(dueByDay.every((d) => d <= 20)).toBe(true); // 积压不螺旋（预算内清得完）
  });

  it("SPEAKING_NEGLECT: 口语不被饿死，learn 不因 due 闪烁", () => {
    // 模拟 03A：due 逐日波动，idle 逐日增长（用户跳口语）
    const dues = [0, 5, 8, 3, 5, 4, 3];
    const speakingDays: number[] = [];
    const learnByDay: number[] = [];
    for (let day = 1; day <= 7; day++) {
      const plan = planToday(
        input({
          goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 30 },
          dueCount: dues[day - 1]!,
          speakingIdleDays: day - 1,
          learnedThisWeek: 10,
          daysElapsedThisWeek: day,
        }),
      );
      speakingDays.push(plan.actions.some((a) => a.type === "SPEAKING") ? 1 : 0);
      learnByDay.push(learnOf(plan));
    }
    // 口语：idle>=2 的 6 天中至少出现（cadence floor 不放弃）
    expect(speakingDays.filter(Boolean).length).toBeGreaterThanOrEqual(5);
    // learn 不因 due=8 归零（旧行为 day3 due=8 → learn 0；新行为按预算余量保留）
    expect(learnByDay[2]!).toBeGreaterThan(0);
  });
});
