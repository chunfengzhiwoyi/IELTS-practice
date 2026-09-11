/**
 * Planner V1 — 确定性 Today Plan / Next Action（PRODUCT-LOOP-02B）
 * ------------------------------------------------------------
 * Goal + Learner State → 今天做什么。
 * - 纯函数、确定性、可测试；不调用 LLM。
 * - 三条冻结原则：
 *   1. MEMORY_FLOOR：到期复习必须得到最低保障，任何压缩不删除 Review。
 *   2. SPEAKING_CADENCE_FLOOR：口语不能因复习积压无限期消失；
 *      超过最大闲置天数时即使当天有复习，预算允许即保留最小 Speaking slot。
 *   3. 时间不足舍弃顺序：LEARN_NEW → 可选 SPEAKING（薄弱定向）→ Review 不减。
 * - Band（targetBand/currentBand）不参与任何数量/优先级计算（无已验证 Band→训练规则）。
 */
import { PLANNER_CONFIG as C } from "@/lib/planner/config";
import { localDayKey } from "@/lib/client/day";
import type { GoalProfile } from "@/lib/goal/types";

export type PlannerActionType = "REVIEW" | "LEARN_NEW" | "SPEAKING" | "REST";
export type PlannerPriority = "HIGH" | "MEDIUM" | "LOW";
export type Feasibility = "comfortable" | "tight" | "atRisk" | "unknown";

export interface NextAction {
  type: PlannerActionType;
  priority: PlannerPriority;
  /** 用户可读原因：为什么是今天做这个 */
  reason: string;
  target: {
    count?: number;
    dimension?: string;
  };
  estimatedMinutes: number;
  href: string;
}

export interface TodayPlan {
  date: string;
  /** 已按优先级排序（即 render 顺序），UI 不得重新排序 */
  actions: NextAction[];
  /** UI 主 CTA = actions[0] */
  primary: NextAction;
  dailyBudgetMinutes: number;
  computedBy: "planner-v1";
  inputsSnapshot: {
    dueCount: number;
    speakingIdleDays: number | null;
    weeklyProgress: number;
    feasibility: Feasibility;
    recurringIssueCount: number;
  };
}

export interface PlannerInput {
  goal: GoalProfile;
  dueCount: number;
  speakingIdleDays: number | null;
  /** ability 画像 nextFocus 维度（无则为 null） */
  abilityNextFocusDimension: string | null;
  /** ability 画像 recurring issues 数量 */
  recurringIssueCount: number;
  /** 本周已学新表达数（本自然周，Mon 起） */
  learnedThisWeek: number;
  /** 本周已流逝天数 1..7（Mon 起） */
  daysElapsedThisWeek: number;
  /** 周计划可行性（无考试日期时为 unknown） */
  feasibility?: Feasibility;
  /** 可注入的当前时间（确定性测试用）；缺省取 new Date() */
  now?: Date;
}

const ACTION_TYPE_LABEL: Record<PlannerActionType, string> = {
  REVIEW: "复习",
  LEARN_NEW: "学新",
  SPEAKING: "口语",
  REST: "休息",
};

function weeklyTargetSoFar(weeklyTarget: number, daysElapsed: number): number {
  return Math.ceil((weeklyTarget * Math.min(7, Math.max(1, daysElapsed))) / 7);
}

export function planToday(input: PlannerInput): TodayPlan {
  const now = input.now ?? new Date();
  const budget = Math.max(1, Math.round(input.goal.dailyMinutes));
  const weeklyTarget = Math.max(1, Math.round(input.goal.weeklyWordTarget));
  const daysElapsed = Math.min(7, Math.max(1, input.daysElapsedThisWeek));
  const targetSoFar = weeklyTargetSoFar(weeklyTarget, daysElapsed);
  const behindWeekly = input.learnedThisWeek < targetSoFar;
  const weeklyProgress = Math.min(1, targetSoFar > 0 ? input.learnedThisWeek / targetSoFar : 0);

  const actions: NextAction[] = [];
  let total = 0;

  // 1) MEMORY_FLOOR — 到期复习
  if (input.dueCount > 0) {
    const effort = Math.max(1, Math.ceil(input.dueCount * C.REVIEW_MINUTES_PER_ITEM));
    actions.push({
      type: "REVIEW",
      priority: "HIGH",
      reason: `有 ${input.dueCount} 个词条到期复习`,
      target: { count: input.dueCount },
      estimatedMinutes: effort,
      href: "/review",
    });
    total += effort;
  }

  // 2) SPEAKING — cadence floor（受保护） / 薄弱定向（可压缩）
  const overMaxIdle =
    input.speakingIdleDays != null && input.speakingIdleDays >= C.SPEAKING_MAX_IDLE_DAYS;
  const weakTargeted =
    input.recurringIssueCount >= C.WEAKNESS_RECURRING_MIN && input.abilityNextFocusDimension != null;
  let speakingAction: NextAction | null = null;
  if (overMaxIdle) {
    speakingAction = {
      type: "SPEAKING",
      priority: input.dueCount > 0 ? "MEDIUM" : "HIGH",
      reason: `已 ${input.speakingIdleDays} 天没练口语`,
      target: {},
      estimatedMinutes: C.SPEAKING_SLOT_MINUTES,
      href: "/speaking",
    };
  } else if (weakTargeted) {
    speakingAction = {
      type: "SPEAKING",
      priority: "MEDIUM",
      reason: `口语「${input.abilityNextFocusDimension}」维度反复出现薄弱，建议定向练习`,
      target: { dimension: input.abilityNextFocusDimension ?? undefined },
      estimatedMinutes: C.SPEAKING_SLOT_MINUTES,
      href: "/speaking",
    };
  }
  if (speakingAction) total += speakingAction.estimatedMinutes;

  // 3) LEARN_NEW — 日切片，仅在周目标落后时安排；受 Review 压力压缩（可降到 0）。
  //    周目标已达成（learnedThisWeek ≥ 当日折算份额）→ 不强制学新（REST 可达，见 §9）。
  const dailyNewBase = Math.min(
    C.LEARN_MAX_COUNT,
    Math.max(0, Math.ceil(weeklyTarget / C.LEARN_WEEKLY_DIVISOR)),
  );
  let learnCount = behindWeekly ? dailyNewBase : 0;
  if (input.dueCount >= C.REVIEW_PRESSURE_DUE_COUNT) learnCount = 0;

  let learnAction: NextAction | null = null;
  if (learnCount > 0) {
    learnAction = {
      type: "LEARN_NEW",
      priority: behindWeekly ? "MEDIUM" : "LOW",
      reason: behindWeekly
        ? `本周目标 ${weeklyTarget} 词，进度偏慢，建议学 ${learnCount} 个新表达`
        : `保持节奏：学 ${learnCount} 个新表达`,
      target: { count: learnCount },
      estimatedMinutes: Math.round(learnCount * C.LEARN_MINUTES_PER_ITEM * 10) / 10,
      href: "/learn",
    };
    total += learnAction.estimatedMinutes;
  }

  // 4) 预算压缩：先压 LEARN_NEW（可到 0），再压可选 SPEAKING；Review 永不删除
  if (total > budget) {
    while (learnAction && learnCount > 0 && total > budget) {
      learnCount -= 1;
      const newEffort = Math.round(learnCount * C.LEARN_MINUTES_PER_ITEM * 10) / 10;
      total = total - (learnAction.estimatedMinutes - newEffort);
      learnAction =
        learnCount > 0
          ? { ...learnAction, target: { count: learnCount }, estimatedMinutes: newEffort }
          : null;
    }
    if (total > budget && speakingAction && !overMaxIdle) {
      // 可选（薄弱定向）口语可被压缩掉；cadence floor 保留
      total -= speakingAction.estimatedMinutes;
      speakingAction = null;
    }
  }

  if (speakingAction) actions.push(speakingAction);
  if (learnAction) actions.push(learnAction);

  // 5) REST — 仅当无任何必须任务：无到期、周目标已达成、口语 cadence 满足、无高优先薄弱
  const restQualified =
    actions.length === 0 &&
    input.dueCount === 0 &&
    !behindWeekly &&
    !overMaxIdle &&
    input.recurringIssueCount < C.WEAKNESS_RECURRING_MIN;
  if (restQualified) {
    actions.push({
      type: "REST",
      priority: "LOW",
      reason: "今天该完成的目标都完成了，可以休息",
      target: {},
      estimatedMinutes: 0,
      href: "/",
    });
  }

  // 兜底：若确实无任何任务可安排（例如仅因能力画像数据不足），保持节奏学 1 个
  if (actions.length === 0) {
    actions.push({
      type: "LEARN_NEW",
      priority: "LOW",
      reason: "保持节奏，学一个新表达",
      target: { count: 1 },
      estimatedMinutes: Math.round(C.LEARN_MINUTES_PER_ITEM * 10) / 10,
      href: "/learn",
    });
  }

  const primary = actions[0]!;
  return {
    date: localDayKey(now.toISOString()),
    actions,
    primary,
    dailyBudgetMinutes: budget,
    computedBy: "planner-v1",
    inputsSnapshot: {
      dueCount: input.dueCount,
      speakingIdleDays: input.speakingIdleDays,
      weeklyProgress: Math.round(weeklyProgress * 100) / 100,
      feasibility: input.feasibility ?? "unknown",
      recurringIssueCount: input.recurringIssueCount,
    },
  };
}

export { ACTION_TYPE_LABEL };
