/**
 * 复习间隔调度（小程序端复刻 · 纯 TS）
 * 根据复习质量计算下次复习时间。
 */
export type ReviewScheduleQuality = "CORRECT_INDEPENDENT" | "CORRECT_WITH_HINT" | "INCORRECT" | "SKIPPED";

const HOURS_MAP: Record<ReviewScheduleQuality, number> = {
  CORRECT_INDEPENDENT: 72, // 3 天
  CORRECT_WITH_HINT: 24, // 1 天
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
