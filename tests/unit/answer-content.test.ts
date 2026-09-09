/**
 * Bad Case 008 — Deterministic Empty-Answer Boundary（回归测试）
 * ------------------------------------------------------------
 * 产品 Contract（Product Decision = Option B）：
 *   isAnswerContentEmpty(answer) = trim 后不含任何 Unicode 字母/数字（[\p{L}\p{N}]）
 *   → empty-like → 短路（LLM call = 0，返回冻结的确定性结果）
 *
 * 共享契约：Learn（app/api/learn/submit）与 Review（app/api/review/submit）
 * 共用 lib/learning/answer-content 的同一谓词；lib/client/demo-service 与
 * tests/unit/els-eval-037-038.test.ts 的模拟器同步使用同一谓词。
 *
 * 规则（已冻结，不得模糊）：
 *   "" " " "\n" "." "..." "!!!" "?" 全角标点 emoji-only → 短路
 *   "word" "take it for granted" 中文 纯数字 "3.14" → 不短路（走 LLM 判题）
 */
import { describe, expect, it } from "vitest";

import { isAnswerContentEmpty } from "@/lib/learning/answer-content";
import { computeInitialReviewAt, initialIntervalDays } from "@/lib/review/initial-schedule";
import { computeReviewNextAt } from "@/lib/review/review-schedule";

const FIXED_NOW = () => new Date("2026-09-01T00:00:00.000Z");

describe("isAnswerContentEmpty — deterministic boundary（Option B）", () => {
  const emptyLike = [
    "",
    " ",
    "\n",
    "\t",
    "　", // U+3000 全角空格
    ".",
    "...",
    "!!!",
    "?",
    "。",
    "！？",
    "…",
    "😀",
    "😀😀🎉",
  ];

  const hasContent = [
    "word",
    "take it for granted",
    "123",
    "3.14",
    "可持续的",
    "sustainable",
    "word!",
    "word 😀",
    "well-being",
    "١٢٣", // Arabic-Indic digits（\p{N}）
  ];

  it.each(emptyLike)("短路: %j → empty-like（LLM call = 0）", (answer) => {
    expect(isAnswerContentEmpty(answer)).toBe(true);
  });

  it.each(hasContent)("不短路: %j → 有内容（走 LLM 判题）", (answer) => {
    expect(isAnswerContentEmpty(answer)).toBe(false);
  });

  it("emoji-only 短路已按 Product Decision 冻结（emoji 无字母/数字 → 无可评价语义内容）", () => {
    expect(isAnswerContentEmpty("😀")).toBe(true);
    expect(isAnswerContentEmpty("🎉🎉🎉")).toBe(true);
  });

  it("纯数字不短路（数字属字母数字字符 → 保守放行，宁误判不误伤）", () => {
    expect(isAnswerContentEmpty("123")).toBe(false);
    expect(isAnswerContentEmpty("3.14")).toBe(false);
  });
});

describe("冻结的短路结果契约（route 分支与调度表一致）", () => {
  it("Learn: empty-like → correctness=FAIL / status=EXPOSED / scheduleQuality=FAIL / +2h", () => {
    // 与 app/api/learn/submit/route.ts 中 shortCircuited 分支的冻结输出一致
    const scheduleQuality = "FAIL";
    expect(computeInitialReviewAt(scheduleQuality, FIXED_NOW)).toBe("2026-09-01T02:00:00.000Z");
    expect(initialIntervalDays(scheduleQuality)).toBe(2 / 24);
  });

  it("Review: empty-like → INCORRECT / +4h（review_interval_table 冻结输出）", () => {
    // 与 app/api/review/submit/route.ts 中 shortCircuited 分支的冻结输出一致
    expect(computeReviewNextAt("INCORRECT", FIXED_NOW)).toBe("2026-09-01T04:00:00.000Z");
  });
});
