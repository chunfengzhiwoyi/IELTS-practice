/**
 * 复习间隔调度
 * ------------------------------------------------------------
 * 根据复习质量计算下次复习时间。
 *
 * 规则：
 *  - CORRECT_INDEPENDENT: 3 天后
 *  - CORRECT_WITH_HINT: 1 天后
 *  - INCORRECT: 4 小时后
 *  - SKIPPED: 2 小时后
 *
 * now 函数可注入，便于测试。
 */

export type ReviewScheduleQuality = "CORRECT_INDEPENDENT" | "CORRECT_WITH_HINT" | "INCORRECT" | "SKIPPED";

const HOURS_MAP: Record<ReviewScheduleQuality, number> = {
  CORRECT_INDEPENDENT: 72, // 3 days
  CORRECT_WITH_HINT: 24, // 1 day
  INCORRECT: 4,
  SKIPPED: 2,
};

export function computeReviewNextAt(quality: ReviewScheduleQuality, now?: () => Date): string {
  const clock = now ?? (() => new Date());
  const hours = HOURS_MAP[quality];
  const current = clock();
  const next = new Date(current.getTime() + hours * 60 * 60 * 1000);
  return next.toISOString();
}
