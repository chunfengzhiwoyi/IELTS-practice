/**
 * ELS-EVAL-031 — FALLBACK_FAILURE（primary timeout → fallback provider，结果正确）
 * primary(mock) 注入 MODEL_TIMEOUT；fallback(deepseek) 注入 judgeJson(true)。
 * 断言：fallback.triggered（MODEL_TIMEOUT → fallback_provider 链）、结果正确（INDEPENDENT）、
 * HTTP 200（MODEL_TIMEOUT 不落 500）。
 */
import { LlmError } from "@/lib/llm/errors";
import { resetServerEnvCacheForTests } from "@/lib/env";
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import { T0_ISO, traceOf, eventsOfType, payloadOf, seedItemIntoRepo } from "./helpers";

interface SubmitResponse {
  correctness?: string;
  status?: string;
}

interface FallbackPayload {
  trigger_error_code?: string;
  degradation_flag?: boolean;
  to_kind?: string;
  chain_snapshot?: Array<{ step?: string; from?: string; to?: string }>;
}

const throwingPrimary = () => {
  throw new LlmError("MODEL_TIMEOUT", "scripted primary timeout", { provider: "mock" }, "trc_eval_031");
};

export const case_031: EvalCaseDefinition = {
  case_id: "ELS-EVAL-031",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    await seedItemIntoRepo("seed-001");

    // primary=mock（抛 MODEL_TIMEOUT），fallback=deepseek（判对）
    ctx.script([throwingPrimary], "mock");
    ctx.script([judgeJson(true)], "deepseek");
    process.env.LLM_FALLBACK_ENABLED = "true";
    process.env.LLM_FALLBACK_PROVIDER = "deepseek";
    // getServerEnv 有进程级缓存：改 env 后必须清缓存，否则 fallback 决策读到旧值
    resetServerEnvCacheForTests();

    const traceId = evalTraceId("031-timeout");
    const res = await callRoute(
      LEARN_SUBMIT,
      { itemId: "seed-001", taskType: "MEANING_RECALL", answer: "可持续", usedHint: false, clientEventId: "evt-031" },
      traceId,
    );
    const json = res.json as SubmitResponse | null;
    const trace = traceOf(traceId);
    const fb = eventsOfType(trace?.events, "fallback.triggered").map((e) =>
      payloadOf<FallbackPayload>(e),
    )[0];
    const chain = fb?.chain_snapshot ?? [];

    ctx.rec.check(
      "r-fallback-chain",
      "primary(timeout) → fallback provider 路径被记录（fallback_chain / fallback.triggered）",
      { triggered: true, errorCode: "MODEL_TIMEOUT", toKind: "provider", hasFallbackStep: true },
      {
        triggered: fb?.trigger_error_code === "MODEL_TIMEOUT",
        errorCode: fb?.trigger_error_code,
        toKind: fb?.to_kind,
        hasFallbackStep: chain.some((s) => s.step === "fallback_provider"),
      },
      {
        failure_layer: "FALLBACK",
        metrics: ["M9"],
        evidence: { fallback: fb, traceEvents: trace?.events.map((e) => e.event_type) },
      },
    );

    ctx.rec.check(
      "r-result",
      "fallback 判题正确 + 结构完整 + MODEL_TIMEOUT 不落 500",
      { status: 200, correctness: "INDEPENDENT", no500: true },
      {
        status: res.status,
        correctness: json?.correctness,
        no500: res.status !== 500,
      },
      {
        failure_layer: "FALLBACK",
        metrics: ["M9"],
        evidence: { response: json, status: res.status },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        "primary MODEL_TIMEOUT → fallback provider（deepseek）判对：fallback.triggered 记录链、结果 INDEPENDENT、HTTP 200。",
      notes: "A 级确定性断言。双 provider 均 scripted（mock 抛错 / deepseek 判对），fallbackEnabled=true。",
    };
  },
};
