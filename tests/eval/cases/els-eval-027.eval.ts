/**
 * ELS-EVAL-027 — REPORT（聚合 checksum 可复算）
 * 构造混合数据 → 报告 report.aggregated 的 aggregate_checksum 必须等于
 * 由真实 states/events 重算的 canonicalStateHash(aggregateValues)，且各值可复算。
 */
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import { GET as REPORT_GET } from "@/app/api/report/route";
import { canonicalStateHash } from "@/lib/observability/trace-context";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, callRouteGet, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import { T0_ISO, traceOf, eventsOfType, payloadOf, memRepo, DEMO_USER_ID, seedItemIntoRepo } from "./helpers";

interface ReportAggregatedPayload {
  aggregate_checksum?: string;
  aggregate_values?: {
    totalItems?: number;
    totalEvents?: number;
    totalSessions?: number;
    recalledIndependently?: number;
    recalledWithHelp?: number;
    reviewCorrectRate?: number;
  };
}

export const case_027: EvalCaseDefinition = {
  case_id: "ELS-EVAL-027",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    await seedItemIntoRepo("seed-001");
    await seedItemIntoRepo("seed-002");
    ctx.script([
      judgeJson(true), // learn seed-001
      judgeJson(true), // review seed-001
      judgeJson(false), // review seed-001 错误
      judgeJson(true), // learn seed-002
    ]);
    await callRoute(
      LEARN_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "可持续的", usedHint: false, clientEventId: "evt-027-a" },
      evalTraceId("027-1"),
    );
    await callRoute(
      REVIEW_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "可持续的", usedHint: false, clientEventId: "evt-027-b" },
      evalTraceId("027-2"),
    );
    await callRoute(
      REVIEW_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "错误答案", usedHint: false, clientEventId: "evt-027-c" },
      evalTraceId("027-3"),
    );
    await callRoute(
      LEARN_SUBMIT,
      { itemId: "seed-002", taskType: "MEANING_RECALL", answer: "重要的", usedHint: false, clientEventId: "evt-027-d" },
      evalTraceId("027-4"),
    );

    // ---- 独立复算 ----
    const states = await memRepo().getAllUserItemStates(DEMO_USER_ID);
    const events = memRepo()._getAllEvents();
    const reviewEvents = events.filter((e) => e.eventType === "REVIEW");
    const recalledIndependently = states.filter((s) => s.status === "RECALLED_INDEPENDENTLY").length;
    const recalledWithHelp = states.filter((s) => s.status === "RECALLED_WITH_HELP").length;
    const correctRate =
      reviewEvents.length > 0
        ? reviewEvents.filter((e) => e.correctness === "INDEPENDENT" || e.correctness === "HINTED").length / reviewEvents.length
        : 0;
    const recomputedValues = {
      totalItems: states.length,
      totalEvents: events.length,
      totalSessions: 0,
      recalledIndependently,
      recalledWithHelp,
      reviewCorrectRate: correctRate,
    };
    const expectedChecksum = canonicalStateHash(recomputedValues);

    const res = await callRouteGet(REPORT_GET, { period: "7d" }, evalTraceId("027-report"));
    const trace = traceOf(evalTraceId("027-report"));
    const agg = eventsOfType(trace?.events, "report.aggregated").map((e) =>
      payloadOf<ReportAggregatedPayload>(e),
    )[0];

    ctx.rec.check(
      "r-values",
      "aggregate_values 与真实 states/events 重算值一致",
      recomputedValues,
      agg?.aggregate_values ?? {},
      {
        failure_layer: "REPORT",
        metrics: ["M5"],
        evidence: { recompute: { states: states.length, events: events.length, reviewEvents: reviewEvents.map((e) => e.correctness) } },
      },
    );

    ctx.rec.check(
      "r-checksum",
      "aggregate_checksum == canonicalStateHash(重算 aggregate_values)",
      { checksumMatches: true },
      { checksumMatches: (agg?.aggregate_checksum ?? null) === expectedChecksum },
      {
        failure_layer: "REPORT",
        metrics: ["M5"],
        evidence: { expectedChecksum, actualChecksum: agg?.aggregate_checksum, recomputedValues },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "report.aggregated 的 aggregate_values 与真实数据逐项一致，aggregate_checksum 与 canonicalStateHash 重算值一致。",
      notes: "A 级确定性断言（checksum 用产品同一 canonicalStateHash 重算，非复制实现）。",
    };
  },
};
