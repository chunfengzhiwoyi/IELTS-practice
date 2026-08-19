/**
 * 本地时区日期工具。
 * 避免直接用 toISOString().slice(0,10)（UTC），否则在东八区会把
 * 当地 00:00–08:00 的事件归到前一天，污染 streak / activeDays / 周对比。
 */

/** 本地年月日（YYYY-MM-DD）。入参可为 Date 或 ISO 字符串。 */
export function localDayKey(d: Date | string = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 本地当天 00:00:00 的时间戳，可偏移 offsetDays 天。 */
export function localDayStart(offsetDays = 0): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

/** 两个本地日期之间相差的整天数（a - b）。 */
export function dayDiff(a: Date | string, b: Date | string): number {
  const ka = localDayStartFrom(a);
  const kb = localDayStartFrom(b);
  return Math.round((ka - kb) / 86_400_000);
}

function localDayStartFrom(d: Date | string): number {
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();
  return new Date(y, m, day, 0, 0, 0, 0).getTime();
}
