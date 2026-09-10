/**
 * Bad Case 030 — Report Baseline / Missing vs Zero
 * -------------------------------------------------------
 * ELS-EVAL-030 (S1): 没有前七天 baseline 时，CompareSection 仍显示
 * "新收表达 1 → 0 ▲ 1" 等伪造趋势。
 *
 * 核心语义：
 * - MISSING: 上一周期无任何活动，无法形成趋势比较
 * - ZERO: 上一周期有活动，真实值为 0
 * 禁止 missing → 0 → 参与 delta 计算。
 */
import { describe, expect, it } from "vitest";

import { buildWeekBuckets } from "@/lib/client/report-transform";
import type { LearningEvent } from "@/lib/learning/types";
import type { SpeakingSession } from "@/lib/speaking/types";

// =============================================================
// Test Helpers
// =============================================================

function makeEvent(
  itemId: string,
  eventType: "NEW" | "REVIEW",
  daysAgo: number,
  correctness: "INDEPENDENT" | "HINTED" | "FAIL" | "SKIPPED" = "INDEPENDENT",
): LearningEvent {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return {
    id: `ev-${itemId}-${eventType}-${daysAgo}`,
    userId: "u1",
    itemId,
    eventType,
    taskType: "MEANING_RECALL",
    answer: "ok",
    correctness,
    hintLevel: 0,
    resultJson: {},
    clientEventId: `ce-${itemId}-${eventType}-${daysAgo}`,
    traceId: "t",
    createdAt: d.toISOString(),
  };
}

function makeSession(daysAgo: number): SpeakingSession {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return {
    id: `s-${daysAgo}`,
    userId: "u1",
    part: "PART1",
    questionId: "q1",
    status: "COMPLETED",
    createdAt: d.toISOString(),
    topic: "",
    question: "",
    firstAnswer: "",
    secondAnswer: "",
  } as unknown as SpeakingSession;
}

// =============================================================
// Tests
// =============================================================

describe("BC-030: buildWeekBuckets — hasActivity distinguishes missing from zero", () => {
  it("CASE A: 本周有数据，上周期完全无数据 → lastWeek.hasActivity=false", () => {
    const events = [makeEvent("item1", "NEW", 1)]; // 本周
    const sessions: SpeakingSession[] = [];
    const { thisWeek, lastWeek } = buildWeekBuckets(events, sessions);

    expect(thisWeek.hasActivity).toBe(true);
    expect(thisWeek.newItems).toBe(1);
    expect(lastWeek.hasActivity).toBe(false);
    expect(lastWeek.newItems).toBe(0); // 0 是 folded 值，但 hasActivity=false 表示 missing
  });

  it("CASE B: 本周=1，上周真实存在且 lastV=0 → lastWeek.hasActivity=true", () => {
    const events = [
      makeEvent("item1", "NEW", 1), // 本周 NEW
      makeEvent("item2", "REVIEW", 10), // 上周 REVIEW（有活动但 newItems=0）
    ];
    const sessions: SpeakingSession[] = [];
    const { thisWeek, lastWeek } = buildWeekBuckets(events, sessions);

    expect(thisWeek.hasActivity).toBe(true);
    expect(thisWeek.newItems).toBe(1);
    expect(lastWeek.hasActivity).toBe(true); // 有 REVIEW 事件
    expect(lastWeek.newItems).toBe(0); // 真实零值，不是 missing
    expect(lastWeek.reviews).toBe(1);
  });

  it("CASE C: 本周=0，上周>0 → 合法下降比较", () => {
    const events = [
      makeEvent("item1", "NEW", 10), // 上周 NEW
      makeEvent("item1", "REVIEW", 10), // 上周 REVIEW
    ];
    const sessions: SpeakingSession[] = [];
    const { thisWeek, lastWeek } = buildWeekBuckets(events, sessions);

    expect(thisWeek.hasActivity).toBe(false);
    expect(lastWeek.hasActivity).toBe(true);
    expect(lastWeek.newItems).toBe(1);
  });

  it("CASE D: 两期都有真实数据 → 正常比较", () => {
    const events = [
      makeEvent("item1", "NEW", 1),
      makeEvent("item1", "REVIEW", 1),
      makeEvent("item2", "NEW", 10),
      makeEvent("item2", "REVIEW", 10),
    ];
    const sessions = [makeSession(1), makeSession(10)];
    const { thisWeek, lastWeek } = buildWeekBuckets(events, sessions);

    expect(thisWeek.hasActivity).toBe(true);
    expect(lastWeek.hasActivity).toBe(true);
  });

  it("CASE E: 两期都无数据 → 都 hasActivity=false", () => {
    const { thisWeek, lastWeek } = buildWeekBuckets([], []);
    expect(thisWeek.hasActivity).toBe(false);
    expect(lastWeek.hasActivity).toBe(false);
  });

  it("CASE F: 上周有 REVIEW 但无 NEW → newItems=0 是真实零值，hasActivity=true", () => {
    const events = [
      makeEvent("item1", "NEW", 1), // 本周 NEW
      makeEvent("item1", "REVIEW", 10), // 上周只有 REVIEW
    ];
    const { lastWeek } = buildWeekBuckets(events, []);
    expect(lastWeek.hasActivity).toBe(true);
    expect(lastWeek.newItems).toBe(0); // 真实零
    expect(lastWeek.reviews).toBe(1);
  });

  it("reviewAccuracy 无复习时返回 null（不是 0）", () => {
    const events = [makeEvent("item1", "NEW", 1)]; // 只有 NEW，无 REVIEW
    const { thisWeek } = buildWeekBuckets(events, []);
    expect(thisWeek.reviewAccuracy).toBeNull();
  });

  it("speaking session 单独也能标记 hasActivity", () => {
    const sessions = [makeSession(10)]; // 上周只有口语
    const { lastWeek } = buildWeekBuckets([], sessions);
    expect(lastWeek.hasActivity).toBe(true);
    expect(lastWeek.newItems).toBe(0);
    expect(lastWeek.speakingCompleted).toBe(1);
  });
});

describe("BC-030: CompareSection — missing baseline 不产生伪造 delta", () => {
  // 注意：CompareSection 是 React 组件，这里通过数据契约验证逻辑。
  // 组件级渲染测试由 Playwright E2E 覆盖（ELS-EVAL-030）。

  it("missing baseline 时：lastWeek.hasActivity=false，组件应进入空态", () => {
    const events = [makeEvent("item1", "NEW", 1)];
    const { thisWeek, lastWeek } = buildWeekBuckets(events, []);

    // 这是 CompareSection 的核心判断条件
    const shouldShowEmptyState = !lastWeek.hasActivity;
    expect(shouldShowEmptyState).toBe(true);
  });

  it("true zero baseline 时：lastWeek.hasActivity=true，允许 delta 计算", () => {
    const events = [
      makeEvent("item1", "NEW", 1),
      makeEvent("item2", "REVIEW", 10),
    ];
    const { lastWeek } = buildWeekBuckets(events, []);

    const shouldShowEmptyState = !lastWeek.hasActivity;
    expect(shouldShowEmptyState).toBe(false);
    // lastWeek.newItems=0 是真实零值，允许 thisWeek=1 vs lastWeek=0 的比较
    expect(lastWeek.newItems).toBe(0);
  });

  it("不得把 null/undefined/missing 简单等价为 0", () => {
    const { lastWeek } = buildWeekBuckets([], []);
    // hasActivity=false 明确表示 missing，不是 0
    expect(lastWeek.hasActivity).toBe(false);
    expect(lastWeek.reviewAccuracy).toBeNull();
    // newItems/reviews 是 0，但 hasActivity=false 告诉消费者这是 missing 而非 true zero
  });

  it("missing baseline 时不得出现趋势符号的语义条件", () => {
    const events = [makeEvent("item1", "NEW", 1)];
    const { thisWeek, lastWeek } = buildWeekBuckets(events, []);

    // 模拟 CompareSection 的 delta 计算逻辑
    const thisV = thisWeek.newItems; // 1
    const lastV = lastWeek.newItems; // 0 (folded)
    const baselineExists = lastWeek.hasActivity; // false

    // 只有 baselineExists 时才计算 delta
    let deltaShown = false;
    if (baselineExists) {
      const a = thisV ?? 0;
      const b = lastV ?? 0;
      deltaShown = a !== b;
    }
    expect(deltaShown).toBe(false); // missing baseline → 不显示 delta
  });
});
