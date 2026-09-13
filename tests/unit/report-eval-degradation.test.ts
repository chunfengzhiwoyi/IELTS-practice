/**
 * LEARNING-REPORT-ONLINE-02 — speaking_evaluations 缺表降级判定
 * ------------------------------------------------------------
 * 仅对「明确指向 speaking_evaluations 表不存在」的错误放行降级：
 *   PGRST205（schema cache 未找到表）/ 42P01（undefined_table）+ message 含表名。
 * auth / RLS / network / 未知错误必须 fail loudly（返回 false）。
 */
import { describe, expect, it } from "vitest";

import { isSpeakingEvaluationsMissingError } from "@/lib/evaluation/missing-table";

describe("isSpeakingEvaluationsMissingError", () => {
  it("PGRST205 + speaking_evaluations message -> true", () => {
    const err = {
      code: "PGRST205",
      message: "Could not find the table 'public.speaking_evaluations' in the schema cache",
    };
    expect(isSpeakingEvaluationsMissingError(err)).toBe(true);
  });

  it("42P01 undefined_table + speaking_evaluations -> true", () => {
    const err = {
      code: "42P01",
      message: 'relation "public.speaking_evaluations" does not exist',
    };
    expect(isSpeakingEvaluationsMissingError(err)).toBe(true);
  });

  it("42P01 for a DIFFERENT table -> false (never swallow unrelated)", () => {
    const err = {
      code: "42P01",
      message: 'relation "public.learning_items" does not exist',
    };
    expect(isSpeakingEvaluationsMissingError(err)).toBe(false);
  });

  it("auth error -> false", () => {
    const err = { code: "PGRST301", message: "JWT expired" };
    expect(isSpeakingEvaluationsMissingError(err)).toBe(false);
    const err2 = { code: "42501", message: "permission denied for table speaking_evaluations" };
    expect(isSpeakingEvaluationsMissingError(err2)).toBe(false);
  });

  it("network / unknown errors -> false", () => {
    expect(isSpeakingEvaluationsMissingError(new Error("fetch failed"))).toBe(false);
    expect(isSpeakingEvaluationsMissingError("not an object")).toBe(false);
    expect(isSpeakingEvaluationsMissingError(null)).toBe(false);
    expect(isSpeakingEvaluationsMissingError(undefined)).toBe(false);
    expect(isSpeakingEvaluationsMissingError({ code: 42, message: "numeric code" })).toBe(false);
    expect(isSpeakingEvaluationsMissingError({ code: "PGRST205" })).toBe(false); // no message
  });
});
