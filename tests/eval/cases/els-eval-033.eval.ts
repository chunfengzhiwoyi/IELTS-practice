/**
 * ELS-EVAL-033 — FALLBACK_FAILURE（schema 顽固违规 → MODEL_SCHEMA_MISMATCH，不误切换）
 * scripted LLM 连续两次输出非法 JSON（主调用 + 修复调用均违规）：
 * 断言 app_error_code=MODEL_SCHEMA_MISMATCH（不漂移成 MODEL_ERROR/500 语义）、
 * 响应体含可读错误信息、fallback 链未触发 provider 切换（shouldFallback=false）。
 */
import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { T0_ISO, traceOf, eventsOfType } from "./helpers";

interface ErrorPayload {
  error?: { kind?: string; code?: string; message?: string };
}

export const case_033: EvalCaseDefinition = {
  case_id: "ELS-EVAL-033",
  automation_level: "A",
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    // 两次输出均为「合法 JSON 但 schema 不符」（主调用 + repair 调用都违规 → MODEL_SCHEMA_MISMATCH）
    ctx.script(['{"not_a_word_card":true}', '{"still_not_a_word_card":true}']);

    const traceId = evalTraceId("033-schema");
    const res = await callRoute(LEARN_CARD, { term: "galvanize" }, traceId);
    const json = res.json as ErrorPayload | null;
    const trace = traceOf(traceId);
    const fallbackEvents = eventsOfType(trace?.events, "fallback.triggered");
    const llmAttempts = eventsOfType(trace?.events, "llm.attempt");
    const validations = eventsOfType(trace?.events, "validation.result");
    const repairAttempts = validations
      .map((e) => (e.payload as { repair_attempts?: number })?.repair_attempts ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);

    ctx.rec.check(
      "r-error-code",
      "app_error_code=MODEL_SCHEMA_MISMATCH（精确，不漂移成 MODEL_ERROR / 通用 500）",
      { code: "MODEL_SCHEMA_MISMATCH", structured: true },
      {
        code: json?.error?.kind ?? json?.error?.code ?? "NO_ERROR_BODY",
        structured: Boolean(json?.error?.message),
      },
      {
        failure_layer: "OUTPUT_VALIDATION",
        evidence: {
          response: json,
          llmAttemptKinds: llmAttempts.map((e) => (e.payload as { llm_error_code?: string })?.llm_error_code),
          repairAttempts,
          traceEvents: trace?.events.map((e) => e.event_type),
        },
      },
    );

    ctx.rec.check(
      "r-readable",
      "响应体含可读错误信息（用户安全文案），非静默部分结果",
      { readable: true, noPartial: true },
      {
        readable: Boolean(json?.error?.message && json.error.message.length > 5),
        noPartial: !("item" in (json ?? {})),
      },
      { failure_layer: "OUTPUT_VALIDATION", evidence: { response: json } },
    );

    ctx.rec.check(
      "r-no-switch",
      "schema 错误不触发 provider 切换（shouldFallback=false；fallback.triggered 缺席）；repair 已尝试",
      { fallbackTriggered: false, repairAttempted: true },
      {
        fallbackTriggered: fallbackEvents.length > 0,
        repairAttempted: repairAttempts >= 1,
      },
      { failure_layer: "FALLBACK", evidence: { fallbackEvents: fallbackEvents.length, repairAttempts } },
    );

    return {
      coverage: "full",
      actualSummary:
        "schema 顽固违规 → 响应错误体可读、repair 已尝试、无 provider 误切换；" +
        `错误码=${json?.error?.kind ?? "(无错误体)"}（Gold 要求 MODEL_SCHEMA_MISMATCH，若为 MODEL_ERROR 则登记 Bad Case）。`,
      notes: "A 级确定性断言。scripted LLM 主/修复两次调用均返回非法 JSON，走真实 callLlmStructured 修复路径。",
    };
  },
};
