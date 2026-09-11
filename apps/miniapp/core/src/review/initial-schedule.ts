/**
 * 首次复习调度（小程序端复刻 · 纯 TS）
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

export function computeInitialReviewAt(quality: InitialScheduleQuality, clock: ClockFn = defaultClock): string {
  const hours = HOURS_MAP[quality];
  const now = clock();
  const next = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return next.toISOString();
}

export function initialIntervalDays(quality: InitialScheduleQuality): number {
  const hours = HOURS_MAP[quality];
  return hours / 24;
}
