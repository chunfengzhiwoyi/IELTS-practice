/**
 * ELS Eval Runner — Metric Aggregator（§3，M3-P1 扩展）
 * ------------------------------------------------------------
 * EVAL-M1 Eval Pass Rate / EVAL-M2 Bad Case Rate / EVAL-M3 Critical Failure Rate /
 * EVAL-M4 Intent Accuracy / EVAL-M5 State Consistency / EVAL-M6 Retrieval Success /
 * EVAL-M7 Answer Judge Accuracy / EVAL-M8 Speaking Feedback Quality /
 * EVAL-M9 Fallback Success / EVAL-M10 Release-Blocking Failure Rate。
 *
 * 口径（反 gaming）：
 *  - case 级分母 = 真实运行的 Case（PASS + FAIL）；UNVERIFIED / MANUAL_REVIEW / BLOCKED /
 *    NOT_RUN 不计入分母，更不允许当 PASS。
 *  - 行级分母 = 全部已执行断言行（PASS + FAIL）；BLOCKED / NOT_RUN 行不算已执行。
 *  - M3 = S1 FAIL 行 / 已执行行。
 *  - M4–M9 = 按 EvalRow.metrics 打标归因的域指标（分母 = 该域已执行行）。
 *  - M10 = (S1 + 阻断型 S2) FAIL 行 / 已执行行。
 *  - coverage：39 Case Registry 覆盖统计；TOTAL_GOLD_CASES 固定来自 spec，禁止用
 *    部分执行结果生成“总体通过率”。
 */
import type { EvalCaseResult, EvalMetrics } from "./types";

/** Frozen Contract §5.2 可判性分级（29 A / 7 B / 3 C），M3-P1 不做重分类 */
export const FROZEN_AUTOMATION_LEVELS: Record<string, "A" | "B" | "C"> = Object.fromEntries(
  (
    "001,002,003,004,005,007,008,009,010,011,012,014,015,020,021,022,024,025,026,027,028,029,031,032,033,035,036,037,038".split(",")
  ).map((id) => [`ELS-EVAL-${id}`, "A"] as const),
);
for (const id of "006,016,017,018,019,023,030".split(",")) {
  FROZEN_AUTOMATION_LEVELS[`ELS-EVAL-${id}`] = "B";
}
for (const id of "013,034,039".split(",")) {
  FROZEN_AUTOMATION_LEVELS[`ELS-EVAL-${id}`] = "C";
}

export function frozenAutomationLevel(caseId: string): "A" | "B" | "C" {
  return FROZEN_AUTOMATION_LEVELS[caseId] ?? "B";
}

export function computeMetrics(cases: EvalCaseResult[], totalGoldCases = 39): EvalMetrics {
  // ---- case 级 ----
  const executed = cases.filter((c) => c.status === "PASS" || c.status === "FAIL");
  const passed = cases.filter((c) => c.status === "PASS");
  const failed = cases.filter((c) => c.status === "FAIL");
  const manualReview = cases.filter((c) => c.status === "MANUAL_REVIEW");
  const unverified = cases.filter((c) => c.status === "UNVERIFIED");
  const blocked = cases.filter((c) => c.status === "BLOCKED");
  const notRun = cases.filter((c) => c.status === "NOT_RUN");
  const skipped = cases.filter((c) => c.status === "SKIPPED");

  const casePassRate =
    executed.length > 0 ? round2((passed.length / executed.length) * 100) : null;

  // ---- 行级 ----
  const rows = cases.flatMap((c) => c.rows);
  const executedRows = rows.filter((r) => r.status === "PASS" || r.status === "FAIL");
  const passedRows = executedRows.filter((r) => r.status === "PASS");
  const failedRows = executedRows.filter((r) => r.status === "FAIL");

  const rowPassRate =
    executedRows.length > 0 ? round2((passedRows.length / executedRows.length) * 100) : null;
  const badCaseRate = rowPassRate === null ? null : round2(100 - rowPassRate);

  const s1FailRows = failedRows.filter((r) => r.severity === "S1");
  const criticalRate =
    executedRows.length > 0 ? round2((s1FailRows.length / executedRows.length) * 100) : null;

  // Phase 0：阻断型 S2 Registry（M10 说明；M3-P1 沿用为空，阻断判定见 bad-case-registry.json）
  const blockingS2Registry: string[] = [];
  const m10FailRows = [
    ...s1FailRows,
    ...failedRows.filter((r) => r.severity === "S2" && blockingS2Registry.includes(r.row_id)),
  ];
  const releaseBlockingRate =
    executedRows.length > 0 ? round2((m10FailRows.length / executedRows.length) * 100) : null;

  // ---- 域指标（M4–M9）：按 EvalRow.metrics 归因 ----
  const metricRows: Record<string, { executed: number; passed: number; failed: number }> = {};
  for (const row of executedRows) {
    const tags = row.metrics ?? [];
    for (const tag of tags) {
      const acc = (metricRows[tag] ??= { executed: 0, passed: 0, failed: 0 });
      acc.executed += 1;
      if (row.status === "PASS") acc.passed += 1;
      else acc.failed += 1;
    }
  }
  const metricRate = (tag: string): number | null => {
    const acc = metricRows[tag];
    if (!acc || acc.executed === 0) return null;
    return round2((acc.passed / acc.executed) * 100);
  };

  // ---- coverage：39 Case Registry 覆盖统计 ----
  const registeredCases = cases.length;
  const aLevel = cases.filter((c) => frozenAutomationLevel(c.case_id) === "A");
  const bLevel = cases.filter((c) => frozenAutomationLevel(c.case_id) === "B");
  const cLevel = cases.filter((c) => frozenAutomationLevel(c.case_id) === "C");
  // adapter 实现度：A 级 adapter 存在且真实执行（有断言行）；B 级 packet 就绪（MANUAL_REVIEW）；C 级 special-tool requirement 就绪（BLOCKED/UNVERIFIED placeholder）
  const aLevelImplemented = aLevel.filter(
    (c) => c.status !== "NOT_RUN" && c.rows.length > 0,
  ).length;
  const bLevelPackets = bLevel.filter((c) => c.status === "MANUAL_REVIEW").length;
  const cLevelSpecial = cLevel.filter((c) => c.status === "BLOCKED" || c.status === "UNVERIFIED").length;

  return {
    case_level: {
      executed: executed.length,
      passed: passed.length,
      failed: failed.length,
      manual_review: manualReview.length,
      unverified: unverified.length,
      blocked: blocked.length,
      skipped: skipped.length,
      pass_rate_pct: casePassRate,
    },
    row_level: {
      executed: executedRows.length,
      passed: passedRows.length,
      failed: failedRows.length,
      pass_rate_pct: rowPassRate,
      bad_case_rate_pct: badCaseRate,
      critical_failure_rate_pct: criticalRate,
      release_blocking_failure_rate_pct: releaseBlockingRate,
      blocking_s2_registry_size: blockingS2Registry.length,
    },
    coverage: {
      total_gold_cases: totalGoldCases,
      registered_cases: registeredCases,
      executed_cases: executed.length,
      auto_pass: passed.length,
      fail: failed.length,
      manual_review: manualReview.length,
      unverified: unverified.length,
      not_run: notRun.length,
      blocked: blocked.length,
      skipped: skipped.length,
      a_level_registered: aLevel.length,
      b_level_registered: bLevel.length,
      c_level_registered: cLevel.length,
      a_level_implemented: aLevelImplemented,
      b_level_packets: bLevelPackets,
      c_level_special_requirements: cLevelSpecial,
    },
    evals: {
      m1_eval_pass_rate_pct: casePassRate,
      m2_bad_case_rate_pct: badCaseRate,
      m3_critical_failure_rate_pct: criticalRate,
      m4_intent_accuracy_pct: metricRate("M4"),
      m5_state_consistency_rate_pct: metricRate("M5"),
      m6_retrieval_success_rate_pct: metricRate("M6"),
      m7_answer_judge_accuracy_pct: metricRate("M7"),
      m8_speaking_feedback_quality_pass_rate_pct: metricRate("M8"),
      m9_fallback_success_rate_pct: metricRate("M9"),
      m10_release_blocking_failure_rate_pct: releaseBlockingRate,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
