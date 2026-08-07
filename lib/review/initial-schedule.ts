/**
 * 首次复习调度
 * ------------------------------------------------------------
 * P1 只处理"第一次学习后"的复习时间计算。
 *
 * 规则：
 *  - 无提示完成（INDEPENDENT）：24 小时后
 *  - 提示后完成（HINTED）：8 小时后
 *  - 未完成或跳过（FAIL / SKIPPED）：2 小时后
 *  - 仅查看词卡、未提交任务（EXPOSED）：4 小时后
 *
 * clock 可注入，便于测试。
 */

export type InitialScheduleQuality = "INDEPENDENT" | "HINTED" | "FAIL" | "SKIPPED" | "EXPOSED";

const HOURS_MAP: Record<InitialScheduleQuality, number> = {
  INDEPENDENT: 24,
  HINTED: 8,
  FAIL: 2,
  SKIPPED: 2,
  EXPOSED: 4,
};

export interface ClockFn {
  (): Date;
}

const defaultClock: ClockFn = () => new Date();

/**
 * 计算首次 next_review_at
 * @param quality 本次学习质量
 * @param clock   可注入时钟（测试用）
 * @returns ISO 时间字符串
 */
export function computeInitialReviewAt(
  quality: InitialScheduleQuality,
  clock: ClockFn = defaultClock,
): string {
  const hours = HOURS_MAP[quality];
  const now = clock();
  const next = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return next.toISOString();
}

/**
 * 将首次学习质量映射为间隔天数（供 UserItemState.currentIntervalDays）
 */
export function initialIntervalDays(quality: InitialScheduleQuality): number {
  const hours = HOURS_MAP[quality];
  return hours / 24; // 0.083... / 0.333... / 1
}
