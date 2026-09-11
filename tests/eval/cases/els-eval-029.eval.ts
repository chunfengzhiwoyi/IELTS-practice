/**
 * ELS-EVAL-029 — REPORT（section_render_flags 与数据存在性一致）
 * 场景 A：仅有学习数据 → memory/review=true、speaking=false。
 * 场景 B：追加口语会话 → speaking=true；memory/review 仍为 true。
 * 断言：flags 与 states/events/sessions 存在性逐项一致（不渲染空 section）。
 */
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import { POST as SPEAKING_SESSION } from "@/app/api/speaking/session/route";
import { GET as REPORT_GET } from "@/app/api/report/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, callRouteGet, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import { T0_ISO, traceOf, eventsOfType, payloadOf, seedItemIntoRepo } from "./helpers";

interface ReportAggregatedPayload {
  section_render_flags?: Record<string, boolean>;
}

export const case_029: EvalCaseDefinition = {
  case_id: "ELS-EVAL-029",
  automation_level: "A",
  async run(ctx) {
    // ---- 场景 A：只有学习数据 ----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");
    ctx.script([judgeJson(true)]);
    await callRoute(
      LEARN_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "可持续的", usedHint: false, clientEventId: "evt-029-a" },
      evalTraceId("029-1"),
    );

    const resA = await callRouteGet(REPORT_GET, { period: "7d" }, evalTraceId("029-report-a"));
    const flagsA = eventsOfType(traceOf(evalTraceId("029-report-a"))?.events, "report.aggregated")
      .map((e) => payloadOf<ReportAggregatedPayload>(e))[0]?.section_render_flags;

    ctx.rec.check(
      "r-a",
      "场景A 仅有学习数据 → memory=true, review=true, speaking=false（flags 与数据存在性一致）",
      { memory: true, review: true, speaking: false, status: 200 },
      {
        memory: flagsA?.memory === true,
        review: flagsA?.review === true,
        speaking: flagsA?.speaking === true,
        status: resA.status,
      },
      {
        failure_layer: "REPORT",
        evidence: { flagsA, traceEvents: traceOf(evalTraceId("029-report-a"))?.events.map((e) => e.event_type) },
      },
    );

    // ---- 场景 B：追加口语会话（无 LLM，仅建会话）----
    const sessRes = await callRoute(
      SPEAKING_SESSION,
      { questionId: "sp-p1-001" },
      evalTraceId("029-session"),
    );

    const resB = await callRouteGet(REPORT_GET, { period: "7d" }, evalTraceId("029-report-b"));
    const flagsB = eventsOfType(traceOf(evalTraceId("029-report-b"))?.events, "report.aggregated")
      .map((e) => payloadOf<ReportAggregatedPayload>(e))[0]?.section_render_flags;

    ctx.rec.check(
      "r-b",
      "场景B 追加口语会话 → speaking=true（会话存在即渲染），memory/review 保持 true",
      { speaking: true, memory: true, review: true, sessionStatus: 200 },
      {
        speaking: flagsB?.speaking === true,
        memory: flagsB?.memory === true,
        review: flagsB?.review === true,
        sessionStatus: sessRes.status,
      },
      { failure_layer: "REPORT", evidence: { flagsB, sessionResponse: sessRes.json } },
    );

    return {
      coverage: "full",
      actualSummary:
        "section_render_flags 与数据存在性逐项一致：仅学习数据时 memory/review=true、speaking=false；追加口语会话后 speaking=true。",
      notes: "A 级确定性断言。口语会话通过真实 /api/speaking/session 创建（questionId=sp-p1-001）。",
    };
  },
};
