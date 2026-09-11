/**
 * 备考目标档案 — 共享类型（client/server 通用，不依赖 localStorage）
 * ------------------------------------------------------------
 * Goal = 用户想去哪（约束输入）。
 * V1 参与调度的 Goal 信号：examDate / dailyMinutes / weeklyWordTarget。
 * targetBand / currentBand 仅展示与记录，不允许参与训练量/能力推断
 * （当前没有经过验证的 Band → 训练规则，见 PRODUCT-LOOP-02B §3）。
 */
export interface GoalProfile {
  /** 考试日期 YYYY-MM-DD；null = 未设定 */
  examDate: string | null;
  /** 目标总分 */
  targetBand: number;
  /** 当前自估分 */
  currentBand: number;
  /** 每日可投入分钟 */
  dailyMinutes: number;
  /** 每周目标表达数 */
  weeklyWordTarget: number;
  /** 首次设定时间 ISO；用于按真实流逝周数推进阶段进度 */
  setAt: string | null;
  /** 设定时的总周数快照（考试日→设定日）；阶段进度分母 */
  plannedWeeks: number | null;
}

export const DEFAULT_GOAL_PROFILE: GoalProfile = {
  examDate: null,
  targetBand: 6.5,
  currentBand: 5.0,
  dailyMinutes: 30,
  weeklyWordTarget: 200,
  setAt: null,
  plannedWeeks: null,
};

/** 归一化部分档案 → 完整档案（各字段独立默认，不整体覆盖） */
export function normalizeGoalProfile(p: Partial<GoalProfile> | null | undefined): GoalProfile {
  return {
    examDate: p?.examDate ?? DEFAULT_GOAL_PROFILE.examDate,
    targetBand: p?.targetBand ?? DEFAULT_GOAL_PROFILE.targetBand,
    currentBand: p?.currentBand ?? DEFAULT_GOAL_PROFILE.currentBand,
    dailyMinutes: p?.dailyMinutes ?? DEFAULT_GOAL_PROFILE.dailyMinutes,
    weeklyWordTarget: p?.weeklyWordTarget ?? DEFAULT_GOAL_PROFILE.weeklyWordTarget,
    setAt: p?.setAt ?? DEFAULT_GOAL_PROFILE.setAt,
    plannedWeeks: p?.plannedWeeks ?? DEFAULT_GOAL_PROFILE.plannedWeeks,
  };
}
