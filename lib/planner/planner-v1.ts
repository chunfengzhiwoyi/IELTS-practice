/**
 * Planner V1 — 确定性 Today Plan / Next Action（PRODUCT-LOOP-02B + 03B targeted fix）
 * ------------------------------------------------------------
 * Goal + Learner State → 今天做什么。
 * - 纯函数、确定性、可测试；不调用 LLM。
 * - 冻结决策原则：
 *   A. MEMORY_FLOOR：dueCount > 0 → 必须安排 Review；任何压缩不删除 Review。
 *   B. SPEAKING_CADENCE_FLOOR：speakingIdleDays == null（从未完成口语）或 ≥ 阈值
 *      → cadence overdue，必须安排 Speaking（受保护）；薄弱定向 Speaking 为可压缩项。
 *   C. Learn New 可压缩：使用完成 Review / mandatory Speaking 后的剩余预算，
 *      可为 0；不再因 dueCount 单独一刀切（03B 移除绝对闸门）。
 * - 时间不足舍弃顺序：LEARN_NEW → 可选 SPEAKING（薄弱定向）→ Review 不减。
 * - Band（targetBand/currentBand）不参与任何数量/优先级计算（无已验证 Band→训练规则）。
 * - examDate / feasibility 为 contextOnly（snapshot-only），不参与任何决策，
 *   仅写入 inputsSnapshot / Goal context 供展示（03A P2-1 契约修正）。
 */
import { PLANNER_CONFIG as C } from "@/lib/planner/config";
import { localDayKey } from "@/lib/client/day";
import type { GoalProfile } from "@/lib/goal/types";

export type PlannerActionType = "REVIEW" | "LEARN_NEW" | "SPEAKING" | "REST";
export type PlannerPriority = "HIGH" | "MEDIUM" | "LOW";
export type Feasibility = "comfortable" | "tight" | "atRisk" | "unknown";
export type BudgetStatus = "WITHIN_BUDGET" | "OVERLOADED";

export interface NextAction {
  type: PlannerActionType;
  priority: PlannerPriority;
  /** 用户可读原因：为什么是今天做这个（压缩完成后生成，数量与 target.count 一致） */
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
  /**
   * 预算完整性（03B P1-2）：
   * - WITHIN_BUDGET：sum(actions.estimatedMinutes) <= dailyBudgetMinutes。
   * - OVERLOADED：mandatory floors（Review + cadence Speaking）本身无法装进预算；
   *   此时允许 actions 总 effort > budget，但必须给出 overloadReason，绝不静默。
   */
  budgetStatus: BudgetStatus;
  /** 仅 OVERLOADED 时存在 */
  overloadReason?: string;
  inputsSnapshot: {
    /** 总到期数量（非建议完成数） */
    dueCount: number;
    speakingIdleDays: number | null;
    weeklyProgress: number;
    /** contextOnly：不参与决策，仅快照 */
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
  /** contextOnly（snapshot-only）：不参与任何决策，仅写入 inputsSnapshot 供展示 */
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
  // 03B P2-3：weeklyWordTarget=0 合法（表示"本周不学新"），不再钳制为 1。
  const weeklyTarget = Math.max(0, Math.round(input.goal.weeklyWordTarget));
  const daysElapsed = Math.min(7, Math.max(1, input.daysElapsedThisWeek));
  const targetSoFar = weeklyTargetSoFar(weeklyTarget, daysElapsed);
  const behindWeekly = weeklyTarget > 0 && input.learnedThisWeek < targetSoFar;
  // weeklyTarget=0 → 视为已达成（progress=1）
  const weeklyProgress = targetSoFar > 0 ? Math.min(1, input.learnedThisWeek / targetSoFar) : 1;

  const actions: NextAction[] = [];
  let mandatoryTotal = 0;

  // 1) MEMORY_FLOOR — Review（预算感知 count）
  let reviewAction: NextAction | null = null;
  if (input.dueCount > 0) {
    // REVIEW_BUDGET_CAP_RATIO 激活：Review 建议量至多占预算 cap 比例。
    const reviewBudgetCapMinutes = Math.floor(budget * C.REVIEW_BUDGET_CAP_RATIO);
    const reviewCapacity = Math.floor(reviewBudgetCapMinutes / C.REVIEW_MINUTES_PER_ITEM);
    const reviewCount = Math.min(input.dueCount, Math.max(1, reviewCapacity));
    const reviewEffort = Math.max(1, Math.ceil(reviewCount * C.REVIEW_MINUTES_PER_ITEM));
    const reason =
      reviewCount < input.dueCount
        ? `今天有 ${input.dueCount} 个到期复习，按 ${budget} 分钟预算先完成 ${reviewCount} 个`
        : `有 ${input.dueCount} 个词条到期复习`;
    reviewAction = {
      type: "REVIEW",
      priority: "HIGH",
      reason,
      target: { count: reviewCount },
      estimatedMinutes: reviewEffort,
      href: "/review",
    };
    mandatoryTotal += reviewEffort;
  }

  // 2) SPEAKING — cadence floor（受保护，含 null 语义） / 薄弱定向（可压缩）
  const idleDays = input.speakingIdleDays;
  const noSpeakingHistory = idleDays == null;
  const overMaxIdle = idleDays != null && idleDays >= C.SPEAKING_MAX_IDLE_DAYS;
  const cadenceOverdue = noSpeakingHistory || overMaxIdle;
  const weakTargeted =
    input.recurringIssueCount >= C.WEAKNESS_RECURRING_MIN && input.abilityNextFocusDimension != null;

  let cadenceSpeaking: NextAction | null = null;
  let optionalSpeaking: NextAction | null = null;
  if (cadenceOverdue) {
    cadenceSpeaking = {
      type: "SPEAKING",
      priority: input.dueCount > 0 ? "MEDIUM" : "HIGH",
      reason:
        input.speakingIdleDays == null
          ? "你还没有完成过口语训练，今天安排一次短练习"
          : `已 ${input.speakingIdleDays} 天没练口语`,
      target: {},
      estimatedMinutes: C.SPEAKING_SLOT_MINUTES,
      href: "/speaking",
    };
    mandatoryTotal += C.SPEAKING_SLOT_MINUTES;
  } else if (weakTargeted) {
    optionalSpeaking = {
      type: "SPEAKING",
      priority: "MEDIUM",
      reason: `口语「${input.abilityNextFocusDimension}」维度反复出现薄弱，建议定向练习`,
      target: { dimension: input.abilityNextFocusDimension ?? undefined },
      estimatedMinutes: C.SPEAKING_SLOT_MINUTES,
      href: "/speaking",
    };
  }

  // 3) LEARN_NEW — 剩余预算分配（03B：移除 dueCount>=5 绝对闸门；weeklyTarget=0 → 0）
  let learnAction: NextAction | null = null;
  if (weeklyTarget > 0 && behindWeekly) {
    let learnRemaining = budget - mandatoryTotal;
    if (optionalSpeaking) learnRemaining -= C.SPEAKING_SLOT_MINUTES;
    if (learnRemaining < 0) {
      // 剩余连可选口语都放不下 → 放弃可选口语，学习用全部剩余
      optionalSpeaking = null;
      learnRemaining = budget - mandatoryTotal;
    }
    const dailyNewBase = Math.min(
      C.LEARN_MAX_COUNT,
      Math.ceil(weeklyTarget / C.LEARN_WEEKLY_DIVISOR),
    );
    const learnByBudget = Math.floor(learnRemaining / C.LEARN_MINUTES_PER_ITEM);
    const learnCount = Math.max(0, Math.min(dailyNewBase, learnByBudget));
    if (learnCount > 0) {
      // reason 在最终 count 确定后生成（03B P2-4：压缩后 reason 与 target.count 一致）
      learnAction = {
        type: "LEARN_NEW",
        priority: "MEDIUM",
        reason: `本周目标 ${weeklyTarget} 词，进度偏慢，建议学 ${learnCount} 个新表达`,
        target: { count: learnCount },
        estimatedMinutes: Math.round(learnCount * C.LEARN_MINUTES_PER_ITEM * 10) / 10,
        href: "/learn",
      };
    }
  } else if (optionalSpeaking && budget - mandatoryTotal < C.SPEAKING_SLOT_MINUTES) {
    // 无学习需求但可选口语也放不下
    optionalSpeaking = null;
  }

  if (reviewAction) actions.push(reviewAction);
  if (cadenceSpeaking) actions.push(cadenceSpeaking);
  if (optionalSpeaking) actions.push(optionalSpeaking);
  if (learnAction) actions.push(learnAction);

  const total = actions.reduce((s, a) => s + a.estimatedMinutes, 0);

  // 4) 预算完整性（03B P1-2）：仅当 mandatory floors 本身装不进预算 → OVERLOADED
  const overloaded = total > budget;
  let overloadReason: string | undefined;
  if (overloaded) {
    const parts: string[] = [];
    if (reviewAction) parts.push("到期复习较多");
    if (cadenceSpeaking) parts.push("口语已超期未练");
    overloadReason = `今天${parts.join("，同时")}。计划略超出你的时间预算。`;
  }

  // 5) REST — 仅当无任何必须任务：无到期、周目标已达成（或 weeklyTarget=0）、
  //    cadence 已满足（null 视为未满足）、无高优先薄弱
  const restQualified =
    actions.length === 0 &&
    input.dueCount === 0 &&
    !behindWeekly &&
    !cadenceOverdue &&
    input.recurringIssueCount < C.WEAKNESS_RECURRING_MIN;
  if (restQualified) {
    actions.push({
      type: "REST",
      priority: "LOW",
      reason: weeklyTarget === 0
        ? "本周不安排新词学习，今天可以休息"
        : "今天该完成的目标都完成了，可以休息",
      target: {},
      estimatedMinutes: 0,
      href: "/",
    });
  }

  // 兜底：actions 仍为空时（预算过小或画像数据不足），不强制超预算学新
  if (actions.length === 0) {
    if (weeklyTarget > 0 && budget >= C.LEARN_MINUTES_PER_ITEM) {
      actions.push({
        type: "LEARN_NEW",
        priority: "LOW",
        reason: "保持节奏，学一个新表达",
        target: { count: 1 },
        estimatedMinutes: Math.round(C.LEARN_MINUTES_PER_ITEM * 10) / 10,
        href: "/learn",
      });
    } else {
      actions.push({
        type: "REST",
        priority: "LOW",
        reason:
          weeklyTarget > 0
            ? "今日时间预算不足以安排学习任务，建议明天增加时间"
            : "本周不安排新词学习，今天可以休息",
        target: {},
        estimatedMinutes: 0,
        href: "/",
      });
    }
  }

  const primary = actions[0]!;
  return {
    date: localDayKey(now.toISOString()),
    actions,
    primary,
    dailyBudgetMinutes: budget,
    computedBy: "planner-v1",
    budgetStatus: overloaded ? "OVERLOADED" : "WITHIN_BUDGET",
    overloadReason,
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
