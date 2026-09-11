/**
 * ELS-EVAL-028 — REPORT（数据不足：不调 LLM、不编造总结）
 * 空数据 → insufficient_data_flag=true + insufficientDataMessage + summary=null（LLM 跳过）+
 * section_render_flags 全 false + rule.applied(insufficient_data) 埋点。
 */
import { GET as REPORT_GET } from "@/app/api/report/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRouteGet, evalTraceId } from "../runner/http";
import { T0_ISO, traceOf, eventsOfType, payloadOf, memRepo } from "./helpers";

interface ReportBody {
  insufficientData?: boolean;
  insufficientDataMessage?: string;
  llmSummary?: Record<string, unknown> | null;
  memory?: { totalItems?: number };
  review?: { totalReviews?: number };
}

interface RuleAppliedPayload {
  rule_key?: string;
  outputs?: { insufficient_data?: boolean; show_message?: boolean; llm_summary_skipped?: boolean };
}

interface ReportAggregatedPayload {
  insufficient_data_flag?: boolean;
  section_render_flags?: Record<string, boolean>;
}

export const case_028: EvalCaseDefinition = {
  case_id: "ELS-EVAL-028",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    // 空仓库：无事件 / 无会话 / 无状态
    const traceId = evalTraceId("028-empty");
    const res = await callRouteGet(REPORT_GET, { period: "7d" }, traceId);
    const json = res.json as ReportBody | null;
    const trace = traceOf(traceId);
    const agg = eventsOfType(trace?.events, "report.aggregated").map((e) =>
      payloadOf<ReportAggregatedPayload>(e),
    )[0];
    const rule = eventsOfType(trace?.events, "rule.applied")
      .map((e) => payloadOf<RuleAppliedPayload>(e))
      .find((r) => r?.rule_key === "insufficient_data");

    ctx.rec.check(
      "r-flag",
      "空数据 → insufficient_data=true + 提示文案 + 不生成总结",
      {
        status: 200,
        insufficientData: true,
        hasMessage: true,
        llmSummaryNull: true,
        totalItems: 0,
      },
      {
        status: res.status,
        insufficientData: json?.insufficientData === true,
        hasMessage: Boolean(json?.insufficientDataMessage),
        llmSummaryNull: json?.llmSummary === null,
        totalItems: json?.memory?.totalItems,
      },
      {
        failure_layer: "REPORT",
        metrics: ["M9"],
        evidence: { response: json, traceEvents: trace?.events.map((e) => e.event_type) },
      },
    );

    ctx.rec.check(
      "r-no-llm",
      "数据不足时 rule.applied(insufficient_data) 明确 llm_summary_skipped=true，LLM 零调用",
      { skipped: true, showMessage: true },
      { skipped: rule?.outputs?.llm_summary_skipped === true, showMessage: rule?.outputs?.show_message === true },
      {
        failure_layer: "FALLBACK",
        metrics: ["M9"],
        evidence: { rule },
      },
    );

    ctx.rec.check(
      "r-render-flags",
      "section_render_flags 全 false（memory/review/speaking 均无数据）",
      { memory: false, review: false, speaking: false },
      {
        memory: agg?.section_render_flags?.memory === true,
        review: agg?.section_render_flags?.review === true,
        speaking: agg?.section_render_flags?.speaking === true,
      },
      { failure_layer: "REPORT", evidence: { flags: agg?.section_render_flags } },
    );

    return {
      coverage: "full",
      actualSummary:
        "空数据报告：insufficientData=true + 提示文案 + llmSummary=null；rule.applied(insufficient_data) 标注 llm_summary_skipped；render flags 全 false。",
      notes: "A 级确定性断言。空仓库不伪造总结（禁止编造）。",
    };
  },
};
