/**
 * ELS-EVAL-036 — FALLBACK（LLM 判题失败 → fallbackJudge 关键词降级）
 * 行 1：LLM 判题抛错 → 关键词命中「可持续」→ 判为正确（INDEPENDENT，fallbackUsed=true）。
 * 行 2：LLM 判题抛错 → 关键词未命中 → 判为错误（FAIL/EXPOSED）。
 * 断言：fallback.triggered（LLM_JUDGE_FAILED）+ degradation_flag + llm 调用失败但结果正确降级。
 */
import { LlmError } from "@/lib/llm/errors";
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { T0_ISO, traceOf, eventsOfType, payloadOf, seedItemIntoRepo, currentState } from "./helpers";

interface SubmitResponse {
  correctness?: string;
  status?: string;
  nextReviewAt?: string;
  state?: { status?: string; recallLevel?: number; nextReviewAt?: string } | null;
}

interface FallbackPayload {
  trigger_error_code?: string;
  degradation_flag?: boolean;
  to_kind?: string;
  chain_snapshot?: Array<{ step?: string; from?: string; to?: string; status?: string }>;
}

const throwingJudge = () => {
  throw new LlmError("MODEL_ERROR", "scripted judge failure", { provider: "mock" }, "trc_eval_036");
};

export const case_036: EvalCaseDefinition = {
  case_id: "ELS-EVAL-036",
  automation_level: "A",
  async run(ctx) {
    // ---- 行 1：关键词命中 → 判对 ----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");
    ctx.script([throwingJudge]);
    const traceId1 = evalTraceId("036-hit");

    const res1 = await callRoute(
      LEARN_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "可持续的，能维持的", usedHint: false, clientEventId: "evt-036-1" },
      traceId1,
    );
    const json1 = res1.json as SubmitResponse | null;
    const trace1 = traceOf(traceId1);
    const fb1 = eventsOfType(trace1?.events, "fallback.triggered").map((e) =>
      payloadOf<FallbackPayload>(e),
    )[0];
    const state1 = await currentState("seed-001");

    ctx.rec.check(
      "r-hit",
      "行1 LLM 失败 → 关键词「可持续/维持」全部命中 → 判为正确（INDEPENDENT），fallbackUsed=true",
      {
        correctness: "INDEPENDENT",
        status: "RECALLED_INDEPENDENTLY",
        fallbackTriggered: true,
        errorCode: "LLM_JUDGE_FAILED",
        degradationFlag: true,
      },
      {
        correctness: json1?.correctness,
        status: json1?.status,
        fallbackTriggered: fb1?.trigger_error_code === "LLM_JUDGE_FAILED",
        errorCode: fb1?.trigger_error_code,
        degradationFlag: fb1?.degradation_flag === true,
      },
      {
        failure_layer: "FALLBACK",
        metrics: ["M9"],
        evidence: { fallback: fb1, stateAfter: state1, traceEvents: trace1?.events.map((e) => e.event_type) },
      },
    );

    // ---- 行 2：关键词未命中 → 判错 ----
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");
    ctx.script([throwingJudge]);
    const traceId2 = evalTraceId("036-miss");

    const res2 = await callRoute(
      LEARN_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "今天天气不错", usedHint: false, clientEventId: "evt-036-2" },
      traceId2,
    );
    const json2 = res2.json as SubmitResponse | null;
    const trace2 = traceOf(traceId2);
    const fb2 = eventsOfType(trace2?.events, "fallback.triggered").map((e) =>
      payloadOf<FallbackPayload>(e),
    )[0];

    ctx.rec.check(
      "r-miss",
      "行2 LLM 失败 → 关键词未命中 → 判为错误（FAIL/EXPOSED），且不伪装正确",
      {
        correctness: "FAIL",
        status: "EXPOSED",
        fallbackTriggered: true,
      },
      {
        correctness: json2?.correctness,
        status: json2?.status,
        fallbackTriggered: fb2?.trigger_error_code === "LLM_JUDGE_FAILED",
      },
      {
        failure_layer: "FALLBACK",
        metrics: ["M9"],
        evidence: { fallback: fb2, response: json2 },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "LLM 判题失败 → fallbackJudge：关键词命中判正确（INDEPENDENT）、未命中判错误（FAIL/EXPOSED）；fallback.triggered=LLM_JUDGE_FAILED + degradation_flag 均已埋点。",
      notes: "A 级确定性断言。scripted provider 抛出 LlmError(MODEL_ERROR) 模拟判题失败；关键词降级为真实产品 fallbackJudge。",
    };
  },
};
