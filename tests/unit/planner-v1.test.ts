/**
 * Planner V1 单元测试（PRODUCT-LOOP-02B §14 + 03B §18 targeted fix）
 * 纯函数、确定性、无 LLM；Band 不参与；examDate/feasibility context-only；
 * budget 完整性契约（WITHIN_BUDGET / OVERLOADED）。
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

function learnCountOf(plan: ReturnType<typeof planToday>): number {
  return plan.actions.find((a) => a.type === "LEARN_NEW")?.target.count ?? 0;
}

describe("planner-v1 (03B)", () => {
  it("case 1: 有到期复习 → Review 优先", () => {
    const plan = planToday(baseInput({ dueCount: 3 }));
    expect(plan.primary.type).toBe("REVIEW");
    expect(plan.actions[0]!.type).toBe("REVIEW");
    expect(plan.primary.reason).toContain("3");
    expect(plan.primary.href).toBe("/review");
  });

  it("TEST-01/02/03 (§29): due 3→4→5→6→7 无硬 cliff（Learn 由预算决定，不由魔法数字归零）", () => {
    const g = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 30 };
    const counts = [3, 4, 5, 6, 7].map((due) => {
      const plan = planToday(baseInput({ goal: g, dueCount: due }));
      expect(plan.budgetStatus).toBe("WITHIN_BUDGET");
      return learnCountOf(plan);
    });
    // weekly=30 → base=5；预算充足时各档 Learn 数量一致，无 5→0 悬崖
    expect(counts).toEqual([5, 5, 5, 5, 5]);
    // 放大版（weekly=140）：03A 为 due4→18 / due5→0（悬崖）；现在因预算渐进减少 18→17
    const g140 = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 140 };
    expect(learnCountOf(planToday(baseInput({ goal: g140, dueCount: 4 })))).toBe(18);
    expect(learnCountOf(planToday(baseInput({ goal: g140, dueCount: 5 })))).toBe(18);
    expect(learnCountOf(planToday(baseInput({ goal: g140, dueCount: 7 })))).toBe(17); // 复习多 2min → 渐减 1 词
  });

  it("TEST-04: due=20 + budget=10 → Review target 预算感知（14<20），backlog 保留在 inputsSnapshot", () => {
    const plan = planToday(
      baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 10, weeklyWordTarget: 30 }, dueCount: 20 }),
    );
    const review = plan.actions.find((a) => a.type === "REVIEW")!;
    // cap=floor(10×0.7)=7min → capacity=14 → count=14（不是 20）
    expect(review.target.count).toBe(14);
    expect(plan.inputsSnapshot.dueCount).toBe(20); // 总 backlog 保留
    expect(review.reason).toContain("20");
    expect(review.reason).toContain("14");
    const total = plan.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
    expect(total).toBeLessThanOrEqual(plan.dailyBudgetMinutes);
    expect(plan.budgetStatus).toBe("WITHIN_BUDGET");
  });

  it("case 3: due=20 + budget=30 → Review 建议量 + 合理剩余分配，不静默超预算", () => {
    const plan = planToday(baseInput({ dueCount: 20 }));
    const review = plan.actions.find((a) => a.type === "REVIEW")!;
    expect(review.target.count).toBe(20); // 预算内可完成全部
    expect(learnCountOf(plan)).toBeGreaterThan(0);
    const total = plan.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
    expect(total).toBeLessThanOrEqual(plan.dailyBudgetMinutes);
    expect(plan.budgetStatus).toBe("WITHIN_BUDGET");
  });

  it("case 4: due=50 + budget=10 → Review 预算感知，不 silent over-budget", () => {
    const plan = planToday(baseInput({ dueCount: 50, goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 10, weeklyWordTarget: 200 } }));
    const review = plan.actions.find((a) => a.type === "REVIEW")!;
    expect(review.target.count).toBeLessThan(50); // 预算内先完成部分
    expect(review.target.count).toBe(14); // cap=7min / 0.5 = 14
    const total = plan.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
    expect(total).toBeLessThanOrEqual(plan.dailyBudgetMinutes);
    expect(plan.budgetStatus).toBe("WITHIN_BUDGET");
  });

  it("case 5: mandatory floors 真无法装下 → OVERLOADED + overloadReason（不静默）", () => {
    const plan = planToday(
      baseInput({
        goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 5, weeklyWordTarget: 30 },
        dueCount: 20,
        speakingIdleDays: null,
      }),
    );
    expect(plan.budgetStatus).toBe("OVERLOADED");
    expect(plan.overloadReason).toBeDefined();
    expect(plan.overloadReason).toContain("到期复习较多");
    expect(plan.overloadReason).toContain("口语已超期未练");
    const types = plan.actions.map((a) => a.type);
    expect(types).toEqual(["REVIEW", "SPEAKING"]);
  });

  it("case 6: speakingIdleDays=null → cadence floor 生效（新用户首次被提示口语）", () => {
    const plan = planToday(
      baseInput({ speakingIdleDays: null, learnedThisWeek: 30, daysElapsedThisWeek: 7 }),
    );
    expect(plan.primary.type).toBe("SPEAKING");
    expect(plan.primary.reason).toContain("还没有完成过口语训练");
  });

  it("case 7: weeklyWordTarget=0 → 不强制新学（Learn=0，允许 REST）", () => {
    const g = { ...DEFAULT_GOAL_PROFILE, weeklyWordTarget: 0 };
    // (a) 无到期 → REST
    const a = planToday(baseInput({ goal: g, dueCount: 0, learnedThisWeek: 0 }));
    expect(learnCountOf(a)).toBe(0);
    expect(a.primary.type).toBe("REST");
    // (b) 有到期 → 仅复习
    const b = planToday(baseInput({ goal: g, dueCount: 5 }));
    expect(learnCountOf(b)).toBe(0);
    expect(b.actions.some((x) => x.type === "REVIEW")).toBe(true);
  });

  it("case 8: 压缩后 reason 与 target.count 一致", () => {
    const g = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 8, weeklyWordTarget: 140 };
    const a = planToday(baseInput({ goal: g, dueCount: 0 }));
    const learnA = a.actions.find((x) => x.type === "LEARN_NEW")!;
    expect(learnA.target.count).toBe(5); // floor(8/1.5)=5
    expect(learnA.reason).toContain(`建议学 5 个新表达`);

    // 可选口语占用预算后继续压缩
    const g2 = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 12, weeklyWordTarget: 140 };
    const b = planToday(
      baseInput({ goal: g2, dueCount: 0, recurringIssueCount: 3, abilityNextFocusDimension: "fluency" }),
    );
    const learnB = b.actions.find((x) => x.type === "LEARN_NEW")!;
    expect(learnB.target.count).toBe(4); // (12-5)/1.5=4
    expect(learnB.reason).toContain(`建议学 4 个新表达`);
  });

  it("TEST-10: targetBand 6/7/8/9 → Plan 完全一致（Band 不作为 control signal）", () => {
    const plans = [6, 7, 8, 9].map((band) =>
      planToday(baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, targetBand: band }, dueCount: 5, speakingIdleDays: 3 })),
    );
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]).toEqual(plans[0]);
    }
  });

  it("case 10: examDate / feasibility 为 context-only（不改变决策，仅快照）", () => {
    const withDate = planToday(baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, examDate: "2026-12-31" } }));
    const withoutDate = planToday(baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, examDate: null } }));
    expect(withDate.actions).toEqual(withoutDate.actions);
    expect(withDate).toEqual(withoutDate); // examDate 不进入任何决策输出

    const tight = planToday(baseInput({ feasibility: "atRisk" }));
    const comfy = planToday(baseInput({ feasibility: "comfortable" }));
    expect(tight.actions).toEqual(comfy.actions);
    expect(tight.inputsSnapshot.feasibility).toBe("atRisk");
    expect(comfy.inputsSnapshot.feasibility).toBe("comfortable");
  });

  it("case 11: 预算完整性 — WITHIN_BUDGET 时 sum(estimatedMinutes) <= budget", () => {
    const scenarios: PlannerInput[] = [
      baseInput({ dueCount: 0 }),
      baseInput({ dueCount: 20, speakingIdleDays: 5 }),
      baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 10, weeklyWordTarget: 30 }, dueCount: 5, speakingIdleDays: null }),
      baseInput({ learnedThisWeek: 200, daysElapsedThisWeek: 7 }),
      baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 5, weeklyWordTarget: 30 }, dueCount: 3 }),
    ];
    for (const input of scenarios) {
      const plan = planToday(input);
      const total = plan.actions.reduce((s, a) => s + a.estimatedMinutes, 0);
      expect(plan.budgetStatus).toBe("WITHIN_BUDGET");
      expect(total).toBeLessThanOrEqual(plan.dailyBudgetMinutes);
    }
  });

  it("case 12: REST + null idle → 不 REST（cadence 未满足）", () => {
    const plan = planToday(
      baseInput({ speakingIdleDays: null, learnedThisWeek: 30, daysElapsedThisWeek: 7 }),
    );
    expect(plan.primary.type).not.toBe("REST");
    expect(plan.primary.type).toBe("SPEAKING");
  });

  it("case 13: 相同输入 → 完全相同 Plan（确定性）", () => {
    const input = baseInput({ dueCount: 2, speakingIdleDays: 1, learnedThisWeek: 40 });
    expect(planToday(input)).toEqual(planToday(input));
    expect(planToday(input).computedBy).toBe("planner-v1");
  });

  it("case 14: 薄弱维度触发定向 Speaking（recurring>=2，可压缩项）", () => {
    const plan = planToday(
      baseInput({ recurringIssueCount: 3, abilityNextFocusDimension: "fluency" }),
    );
    const speaking = plan.actions.find((a) => a.type === "SPEAKING");
    expect(speaking).toBeDefined();
    expect(speaking!.target.dimension).toBe("fluency");
  });

  it("case 15: 周目标落后 → Learn New primary（预算充足时按日切片）", () => {
    const plan = planToday(baseInput({ dueCount: 0 }));
    expect(plan.primary.type).toBe("LEARN_NEW");
    expect(learnCountOf(plan)).toBe(20); // min(20, floor(30/1.5)=20)
  });

  it("case 16: 周目标达成 + 无 due + cadence 满足 → REST", () => {
    const plan = planToday(
      baseInput({ learnedThisWeek: 200, daysElapsedThisWeek: 7, speakingIdleDays: 0 }),
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.primary.type).toBe("REST");
  });
});

describe("planner-v1 7-day normal simulation (03B §17)", () => {
  it("无 due=5 悬崖型振荡：Day2 起复习与新学并行，learn 不被闸门清零", () => {
    const budget = 30;
    const weeklyTarget = 30;
    const plans: string[] = [];
    const learnByDay: number[] = [];
    let due = 0;
    let learned = 0;

    for (let day = 1; day <= 7; day++) {
      const plan = planToday(
        baseInput({
          goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: budget, weeklyWordTarget: weeklyTarget },
          dueCount: due,
          speakingIdleDays: 0,
          learnedThisWeek: learned,
          daysElapsedThisWeek: day,
        }),
      );
      const learn = learnCountOf(plan);
      const hasReview = plan.actions.some((a) => a.type === "REVIEW");
      learnByDay.push(learn);
      plans.push(plan.actions.map((a) => a.type).join("+"));
      // 状态推进：review 清空 due；learn 次日到期；无外部到达
      learned += learn;
      due = learn;
    }

    // 关键回归点（旧行为 Day2=REVIEW-only 3 分钟）：
    expect(learnByDay[1]!).toBeGreaterThan(0); // Day2 不再被 due=5 闸门冻结
    // 周目标达成前不允许出现 review-only 饿死日（Day7 达成后可只复习）
    for (let i = 0; i < 6; i++) {
      expect(learnByDay[i]!).toBeGreaterThan(0);
    }
    // 旧振荡为 5→0→5→0→5；新行为无 0 恢复再饿死的交替
    expect(learnByDay).toEqual([5, 5, 5, 5, 5, 5, 0]);
    // Day2 计划不再是"仅复习"
    expect(plans[1]).toContain("LEARN_NEW");
    expect(plans[1]).toContain("REVIEW");
  });
});


describe("planner-v1 03B spec extras (TEST-06 / MONO / TEST-16)", () => {
  it("TEST-06: 极低预算 1–3 分钟 + due>0 + 口语 overdue → OVERLOADED + overloadReason", () => {
    for (const budget of [1, 2, 3]) {
      const plan = planToday(
        baseInput({
          goal: { ...DEFAULT_GOAL_PROFILE, dailyMinutes: budget, weeklyWordTarget: 30 },
          dueCount: 20,
          speakingIdleDays: null,
        }),
      );
      expect(plan.budgetStatus).toBe("OVERLOADED");
      expect(plan.overloadReason).toBeDefined();
      expect(plan.overloadReason!.length).toBeGreaterThan(0);
    }
  });

  it("MONO-01: due↑ → Learn New 不增（预算约束，非阈值跳变）", () => {
    const g = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 15, weeklyWordTarget: 30 };
    const learns = [0, 1, 5, 10, 20, 30, 50].map((due) =>
      learnCountOf(planToday(baseInput({ goal: g, dueCount: due }))),
    );
    for (let i = 1; i < learns.length; i++) {
      expect(learns[i]!).toBeLessThanOrEqual(learns[i - 1]!);
    }
    // 预算确实耗尽时才允许降（due 0→20 时 learn 5→3）
    expect(learns[0]).toBe(5);
    expect(learns[5]).toBe(3);
  });

  it("MONO-02: budget↓ → 总计划 effort 不增（显式 OVERLOADED mandatory 除外）", () => {
    const g = (m: number) => ({ ...DEFAULT_GOAL_PROFILE, dailyMinutes: m, weeklyWordTarget: 30 });
    const totals = [30, 15, 10, 8, 5, 3].map((m) => {
      const plan = planToday(baseInput({ goal: g(m), dueCount: 20, speakingIdleDays: null }));
      return plan.actions.reduce((sum, a) => sum + a.estimatedMinutes, 0);
    });
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]!).toBeLessThanOrEqual(totals[i - 1]!);
    }
  });

  it("MONO-03: idle↑（含 null）→ Speaking 优先级不降", () => {
    const idleCases: (number | null)[] = [null, 2, 3, 5];
    for (const idle of idleCases) {
      const plan = planToday(
        baseInput({ speakingIdleDays: idle, learnedThisWeek: 30, daysElapsedThisWeek: 7 }),
      );
      const speaking = plan.actions.find((a) => a.type === "SPEAKING");
      expect(speaking).toBeDefined();
      expect(speaking!.priority).toBe("HIGH"); // due=0 时 cadence floor 为 HIGH
    }
  });

  it("MONO-04: weeklyTarget↑ → Learn pressure 不降", () => {
    const learns = [0, 7, 30, 70, 140].map((w) =>
      learnCountOf(planToday(baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, weeklyWordTarget: w }, dueCount: 0 }))),
    );
    for (let i = 1; i < learns.length; i++) {
      expect(learns[i]!).toBeGreaterThanOrEqual(learns[i - 1]!);
    }
    expect(learns).toEqual([0, 1, 5, 10, 20]);
  });

  it("MONO-05: targetBand 变化 → Plan 不变（已由 TEST-10 覆盖，此处做 due/idle 组合复核）", () => {
    const plans = [5, 6, 7, 8, 9].map((band) =>
      planToday(baseInput({ goal: { ...DEFAULT_GOAL_PROFILE, targetBand: band }, dueCount: 20, speakingIdleDays: 3 })),
    );
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]).toEqual(plans[0]);
    }
  });

  it("MONO-06: 周 progress↑ → Learn pressure 不增（达成后 REST）", () => {
    const g = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 30 };
    const learns = [0, 15, 30, 40].map((learned) =>
      learnCountOf(
        planToday(
          baseInput({ goal: g, dueCount: 0, learnedThisWeek: learned, daysElapsedThisWeek: 7 }),
        ),
      ),
    );
    expect(learns).toEqual([5, 5, 0, 0]);
    for (let i = 1; i < learns.length; i++) {
      expect(learns[i]!).toBeLessThanOrEqual(learns[i - 1]!);
    }
  });

  it("TEST-16: 从未完成口语 → 主动安排 Speaking；完成后重置 → cadence 恢复；再次忽略 → 重新触发", () => {
    const g = { ...DEFAULT_GOAL_PROFILE, dailyMinutes: 30, weeklyWordTarget: 30 };
    // Day1：无 completed history → null → cadence overdue → SPEAKING
    const day1 = planToday(baseInput({ goal: g, speakingIdleDays: null, dueCount: 0, learnedThisWeek: 15, daysElapsedThisWeek: 1 }));
    expect(day1.actions.some((a) => a.type === "SPEAKING")).toBe(true);
    expect(day1.primary.type).toBe("SPEAKING");
    // 用户完成口语 → idle 重置为 0 → Day2 未超 cadence（idle=1）→ 无强制口语
    const day2 = planToday(baseInput({ goal: g, speakingIdleDays: 1, dueCount: 0, learnedThisWeek: 15, daysElapsedThisWeek: 2 }));
    expect(day2.actions.some((a) => a.type === "SPEAKING")).toBe(false);
    // 再次忽略 → Day3 idle=2 → cadence floor 重新触发
    const day3 = planToday(baseInput({ goal: g, speakingIdleDays: 2, dueCount: 0, learnedThisWeek: 15, daysElapsedThisWeek: 3 }));
    expect(day3.actions.some((a) => a.type === "SPEAKING")).toBe(true);
  });
});
