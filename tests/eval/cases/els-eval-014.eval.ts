/**
 * ELS-EVAL-014 — STATE_READ（报告聚合与状态/事件一致：可复算性）
 * 构造混合学习历史（真实 learn/submit + review/submit 路由），
 * 断言报告 memory/review 各数字与 user_item_states / learning_events 可逐项复算。
 */
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import { GET as REPORT_GET } from "@/app/api/report/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, callRouteGet, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import {
  T0_ISO,
  iso,
  HOUR,
  memRepo,
  DEMO_USER_ID,
  seedItemIntoRepo,
} from "./helpers";

interface ReportBody {
  summary?: { overallAssessment?: string } | null;
  memory?: { totalItems?: number; newItems?: number; reviewedCount?: number; statusDistribution?: Record<string, number> };
  review?: { totalReviews?: number; correctIndependent?: number; incorrect?: number; correctRate?: number };
}

export const case_014: EvalCaseDefinition = {
  case_id: "ELS-EVAL-014",
  automation_level: "A",
  async run(ctx) {
    // ---- 构造混合历史（全走真实路由 + scripted judge）----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    await seedItemIntoRepo("seed-001");
    await seedItemIntoRepo("seed-002");
    await seedItemIntoRepo("seed-003"); // 只有词条，无状态无事件

    ctx.script([
      judgeJson(true), // learn seed-001 独立正确
      judgeJson(true), // review seed-001 独立正确
      judgeJson(false), // review seed-001 错误
      judgeJson(true), // learn seed-002 独立正确
    ]);
    await callRoute(
      LEARN_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "可持续的", usedHint: false, clientEventId: "evt-014-a" },
      evalTraceId("014-1"),
    );
    await callRoute(
      REVIEW_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "可持续的", usedHint: false, clientEventId: "evt-014-b" },
      evalTraceId("014-2"),
    );
    await callRoute(
      REVIEW_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "错误答案", usedHint: false, clientEventId: "evt-014-c" },
      evalTraceId("014-3"),
    );
    await callRoute(
      LEARN_SUBMIT,
      { itemId: "seed-002", taskType: "MEANING_RECALL", answer: "重要的", usedHint: false, clientEventId: "evt-014-d" },
      evalTraceId("014-4"),
    );

    // ---- 独立复算基准 ----
    const states = await memRepo().getAllUserItemStates(DEMO_USER_ID);
    const allEvents = memRepo()._getAllEvents();
    const reviewEvents = allEvents.filter((e) => e.eventType === "REVIEW");
    const newEvents = allEvents.filter((e) => e.eventType === "NEW");
    const correctIndependent = reviewEvents.filter((e) => e.correctness === "INDEPENDENT").length;
    const incorrect = reviewEvents.filter((e) => e.correctness === "FAIL").length;
    const expectedRate =
      reviewEvents.length > 0 ? (correctIndependent + 0) / reviewEvents.length : 0;

    const res = await callRouteGet(
      REPORT_GET,
      { period: "7d" },
      evalTraceId("014-report"),
    );
    const json = res.json as ReportBody | null;

    ctx.rec.check(
      "r-memory",
      "报告 memory.totalItems == user_item_states 数；newItems == NEW 事件数；reviewedCount == REVIEW 事件数",
      {
        totalItems: states.length,
        newItems: newEvents.length,
        reviewedCount: reviewEvents.length,
      },
      {
        totalItems: json?.memory?.totalItems,
        newItems: json?.memory?.newItems,
        reviewedCount: json?.memory?.reviewedCount,
      },
      {
        failure_layer: "STATE_READ",
        metrics: ["M5"],
        evidence: { states: states.map((s) => s.itemId), events: allEvents.map((e) => e.eventType + ":" + e.correctness) },
      },
    );

    ctx.rec.check(
      "r-review",
      "报告 review.totalReviews / correctIndependent / incorrect / correctRate 与 REVIEW 事件可复算",
      {
        totalReviews: reviewEvents.length,
        correctIndependent,
        incorrect,
        correctRate: Math.round(expectedRate * 100) / 100,
      },
      {
        totalReviews: json?.review?.totalReviews,
        correctIndependent: json?.review?.correctIndependent,
        incorrect: json?.review?.incorrect,
        correctRate: json?.review?.correctRate,
      },
      {
        failure_layer: "STATE_READ",
        metrics: ["M5"],
        evidence: { recompute: { reviewEvents: reviewEvents.map((e) => e.correctness), expectedRate } },
      },
    );

    const dist: Record<string, number> = {};
    for (const s of states) dist[s.status] = (dist[s.status] ?? 0) + 1;
    // 产品 distribution 会包含零计数状态键；比对口径：仅比对 count>0 的状态（产品必须给出真实计数）
    const actualDist = json?.memory?.statusDistribution ?? {};
    const actualNonZero: Record<string, number> = {};
    for (const [k, v] of Object.entries(actualDist)) if (v > 0) actualNonZero[k] = v;
    ctx.rec.check(
      "r-distribution",
      "报告 statusDistribution 与 user_item_states 逐状态计数一致（零计数键不比对）",
      dist,
      actualNonZero,
      {
        failure_layer: "STATE_READ",
        metrics: ["M5"],
        evidence: { states: states.map((s) => `${s.itemId}=${s.status}`), productDistribution: actualDist },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "报告聚合与真实状态/事件逐项一致：totalItems=newItems/reviewedCount 与事件数一致，correctRate 可由 REVIEW 事件复算，statusDistribution 与状态一致。",
      notes: "A 级确定性断言。混合历史由真实路由产生，报告数字独立复算比对（不采信报告自报）。",
    };
  },
};
