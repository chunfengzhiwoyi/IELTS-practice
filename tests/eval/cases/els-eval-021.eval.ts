/**
 * ELS-EVAL-021 — SPEAKING_ANALYSIS（LLM 失败 → 规则引擎降级，结构完整 + 明确标记）
 * provider 注入 MODEL_TIMEOUT → ruleBasedAnalysis 返回结构完整分析（无幻觉证据），
 * HTTP 2xx + degradation_flag=true + speaking_rule_engine 埋点。
 */
import { LlmError } from "@/lib/llm/errors";
import { POST as SPEAKING_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPEAKING_ANALYZE } from "@/app/api/speaking/analyze/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { T0_ISO, traceOf, eventsOfType, payloadOf } from "./helpers";

interface AnalysisResponse {
  analysis?: {
    summary?: string;
    mainIssue?: { dimension?: string; description?: string; suggestion?: string };
    microDrill?: { prompt?: string; exampleImprovement?: string };
    ieltsAnalysis?: Record<string, unknown> | null;
  };
}

interface FallbackPayload {
  trigger_error_code?: string;
  degradation_flag?: boolean;
  to_kind?: string;
  chain_snapshot?: Array<{ step?: string }>;
}

interface RuleAppliedPayload {
  rule_key?: string;
  outputs?: { llm_call_count?: number; main_issue?: string };
}

const failingPrimary = () => {
  throw new LlmError("MODEL_TIMEOUT", "scripted timeout", { provider: "mock" }, "trc_eval_021");
};

export const case_021: EvalCaseDefinition = {
  case_id: "ELS-EVAL-021",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const sess = await callRoute(SPEAKING_SESSION, { questionId: "sp-p1-001" }, evalTraceId("021-session"));
    const sessionId = (sess.json as { session?: { id?: string } } | null)?.session?.id;
    if (!sessionId) {
      ctx.rec.blocked("r-session", "创建口语会话失败", "sessionId", sessionId, { failure_layer: "SPEAKING" });
      return { coverage: "partial", actualSummary: "会话创建失败（BLOCKED）" };
    }

    ctx.script([failingPrimary]);
    const traceId = evalTraceId("021-fallback");
    const res = await callRoute(
      SPEAKING_ANALYZE,
      { sessionId, answer: "I think reading is a good habit because it helps us learn new things and relax at the same time." },
      traceId,
    );
    const json = res.json as AnalysisResponse | null;
    const analysis = json?.analysis;
    const trace = traceOf(traceId);
    const fb = eventsOfType(trace?.events, "fallback.triggered").map((e) =>
      payloadOf<FallbackPayload>(e),
    )[0];
    const rule = eventsOfType(trace?.events, "rule.applied")
      .map((e) => payloadOf<RuleAppliedPayload>(e))
      .find((r) => r?.rule_key === "speaking_rule_engine");

    ctx.rec.check(
      "r-path",
      "LLM 失败 → analysis_path=rule（ieltsAnalysis 缺省）+ HTTP 2xx 功能可用",
      { status200: true, pathRule: true, no5xx: true },
      {
        status200: res.status === 200,
        pathRule: analysis?.ieltsAnalysis == null,
        no5xx: res.status < 500,
      },
      {
        failure_layer: "FALLBACK",
        metrics: ["M9"],
        evidence: { traceEvents: trace?.events.map((e) => e.event_type), responseStatus: res.status },
      },
    );

    ctx.rec.check(
      "r-structure",
      "规则引擎输出结构完整（mainIssue / microDrill / summary 齐备，无幻觉证据）",
      { hasMainIssue: true, hasMicroDrill: true, hasSummary: true },
      {
        hasMainIssue: Boolean(analysis?.mainIssue?.description && analysis?.mainIssue?.suggestion),
        hasMicroDrill: Boolean(analysis?.microDrill?.prompt),
        hasSummary: Boolean(analysis?.summary),
      },
      { failure_layer: "FALLBACK", metrics: ["M9"], evidence: { analysis } },
    );

    ctx.rec.check(
      "r-marked",
      "降级被明确标记：fallback.triggered=LLM_ANALYSIS_UNAVAILABLE + degradation_flag=true + rule llm_call_count=0",
      { triggered: true, errorCode: "LLM_ANALYSIS_UNAVAILABLE", degradation: true, llmCalls: 0 },
      {
        triggered: fb?.trigger_error_code === "LLM_ANALYSIS_UNAVAILABLE",
        errorCode: fb?.trigger_error_code,
        degradation: fb?.degradation_flag === true,
        llmCalls: rule?.outputs?.llm_call_count,
      },
      { failure_layer: "FALLBACK", metrics: ["M9"], evidence: { fallback: fb, rule } },
    );

    return {
      coverage: "full",
      actualSummary:
        "LLM 强制失败 → 规则引擎降级：HTTP 200、结构完整、degradation_flag=true、speaking_rule_engine(llm_call_count=0) 已埋点。",
      notes: "A 级确定性断言。scripted provider 抛 LlmError(MODEL_TIMEOUT) 模拟主模型超时。",
    };
  },
};
