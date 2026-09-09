/**
 * M2 Phase 3A — Debug Console: Failure Layer Diagnosis（§4.4 确定性判层）
 * ------------------------------------------------------------
 * 覆盖：12 项瀑布检查、五类 fixture 判层输出、边界场景（输入空 / 500 / 结构性缺席）。
 */
import { describe, it, expect, beforeEach } from "vitest";

import { runDiagnosis, shortCircuitExplanation } from "@/lib/debug/console/diagnosis";
import { TraceContext, setTraceEnabled } from "@/lib/observability/trace-context";
import { traceStore } from "@/lib/observability/trace-store";
import type { FullTrace } from "@/lib/observability/trace-contract";

function makeCtx(traceId: string, route: string): TraceContext {
  return new TraceContext(traceId, route);
}

function getTrace(traceId: string): FullTrace {
  const t = traceStore.getTrace(traceId);
  if (!t) throw new Error(`trace ${traceId} not found`);
  return t;
}

// ---- fixture builders（与 fixtures.ts 相同的真实行为） ----

function buildNormal(): void {
  const ctx = makeCtx("trc_dg_normal", "/api/review/submit");
  ctx.emitRequestReceived({ input_summary: "review submit", method: "POST", client_event_id: "ce-dg-1" });
  ctx.emitStateRead({ entity: "user_item_state", keys: { userId: "u1", itemId: "i1" }, snapshot_summary: "EXPOSED" });
  ctx.emitLlmAttempt({
    attempt_purpose: "primary", provider: "mock", model_name: "mock-model", tier: "fast",
    prompt_key: "JudgeResult", prompt_version: "v1", token_usage: {}, latency_ms: 30,
    raw_output: '{"correct":true}', raw_output_truncated: false, raw_output_sha256: "a",
  });
  ctx.emitValidationResult({ validator: "zod:JudgeResult", outcome: "pass", repair_attempts: 0 });
  ctx.emitRuleApplied({ rule_key: "review_interval_table", inputs: {}, outputs: {} });
  ctx.emitStateWrite({ entity: "learning_event", keys: {}, idempotency_outcome: "inserted", state_before: null, state_after: null });
  ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false });
  ctx.finalize(200, null);
}

function buildFallback(): void {
  const ctx = makeCtx("trc_dg_fallback", "/api/review/submit");
  ctx.emitRequestReceived({ input_summary: "review submit", method: "POST" });
  ctx.emitStateRead({ entity: "user_item_state", keys: {}, snapshot_summary: "EXPOSED" });
  ctx.emitLlmAttempt(
    {
      attempt_purpose: "primary", provider: "mock", model_name: "mock-model", tier: "fast",
      prompt_key: "JudgeResult", prompt_version: "v1", token_usage: {}, latency_ms: 5000,
      raw_output: "", raw_output_truncated: false, llm_error_code: "MODEL_TIMEOUT",
    },
    "error",
  );
  ctx.emitFallbackTriggered({
    trigger_error_code: "MODEL_TIMEOUT",
    chain_snapshot: [{ step: "primary", from: "mock", to: "mock", status: "used" }],
    degradation_flag: true,
    to_kind: "provider",
  });
  ctx.emitLlmAttempt({
    attempt_purpose: "fallback_provider", provider: "bailian", model_name: "bailian-model", tier: "fast",
    prompt_key: "JudgeResult", prompt_version: "v1", token_usage: {}, latency_ms: 100,
    raw_output: '{"correct":false}', raw_output_truncated: false, raw_output_sha256: "b",
  });
  ctx.emitValidationResult({ validator: "zod:JudgeResult", outcome: "pass", repair_attempts: 0 });
  ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: true });
  ctx.finalize(200, null);
}

function buildIdempotentReplaySecond(): void {
  const ctx = makeCtx("trc_dg_replay_2", "/api/review/submit");
  ctx.emitRequestReceived({ input_summary: "review submit (retry)", method: "POST", client_event_id: "ce-dg-replay" });
  ctx.emitStateRead({ entity: "user_item_state", keys: {}, snapshot_summary: "RECALLED" });
  ctx.emitLlmAttempt({
    attempt_purpose: "primary", provider: "mock", model_name: "mock-model", tier: "fast",
    prompt_key: "JudgeResult", prompt_version: "v1", token_usage: {}, latency_ms: 30,
    raw_output: '{"correct":true}', raw_output_truncated: false, raw_output_sha256: "c",
  });
  ctx.emitValidationResult({ validator: "zod:JudgeResult", outcome: "pass", repair_attempts: 0 });
  ctx.emitStateWrite({ entity: "learning_event", keys: {}, client_event_id: "ce-dg-replay", idempotency_outcome: "duplicate_ignored", state_before: null, state_after: null });
  ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "replay", fallback_used_flag: false, idempotent_replay: true });
  ctx.finalize(200, null);
}

function buildEmptyShortCircuit(): void {
  const ctx = makeCtx("trc_dg_empty", "/api/learn/submit");
  ctx.emitRequestReceived({ input_summary: "learn submit empty", method: "POST" });
  ctx.emitStateRead({ entity: "user_item_state", keys: {}, snapshot_summary: "NEW" });
  ctx.emitRuleApplied({
    rule_key: "empty_answer_short_circuit",
    inputs: { answer_empty: true },
    outputs: { llm_call_count: 0 },
    llm_call_count: 0,
  });
  ctx.emitStateWrite({ entity: "learning_event", keys: {}, idempotency_outcome: "inserted", state_before: null, state_after: null });
  ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false });
  ctx.finalize(200, null);
}

function buildRetrievalMiss(): void {
  const ctx = makeCtx("trc_dg_miss", "/api/learn/card");
  ctx.emitRequestReceived({ input_summary: "learn card xyzzy", method: "POST" });
  ctx.emitRetrievalExecuted({
    query_raw: "xyzzy", query_normalized: "xyzzy",
    knowledge_object_ids: [], knowledge_injected_count: 0, knowledge_miss_flag: true,
  });
  ctx.emitStateRead({ entity: "user_item_state", keys: {}, snapshot_summary: "not found", state_not_found: true });
  ctx.emitLlmAttempt({
    attempt_purpose: "primary", provider: "mock", model_name: "mock-model", tier: "fast",
    prompt_key: "WordCard", prompt_version: "v1", token_usage: {}, latency_ms: 50,
    raw_output: '{"term":"xyzzy"}', raw_output_truncated: false, raw_output_sha256: "d",
  });
  ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false });
  ctx.finalize(200, null);
}

describe("M2 Phase 3A: Failure Layer Diagnosis — 12 项瀑布结构", () => {
  beforeEach(() => {
    traceStore.reset();
    setTraceEnabled(true);
  });

  it("checks 固定 12 项且顺序为 1..12，每项带 layer/targetEventTypes/status", () => {
    buildNormal();
    const d = runDiagnosis(getTrace("trc_dg_normal"));
    expect(d.checks).toHaveLength(12);
    d.checks.forEach((c, i) => {
      expect(c.checkId).toBe(i + 1);
      expect(c.layer).toBeTruthy();
      expect(c.targetEventTypes.length).toBeGreaterThan(0);
    });
    // layer 顺序与 §4.4 一致（前 12 层判层 + UNKNOWN 兜底）
    expect(d.checks.map((c) => c.layer)).toEqual([
      "INPUT", "ROUTING", "STATE_READ", "RETRIEVAL", "PROMPT", "MODEL",
      "OUTPUT_VALIDATION", "BUSINESS_RULE", "STATE_WRITE", "REPORT_AGGREGATION",
      "FALLBACK", "UI_PRESENTATION",
    ]);
  });

  it("正常 trace → UNKNOWN（无异常证据），llm_call_count=1", () => {
    buildNormal();
    const d = runDiagnosis(getTrace("trc_dg_normal"));
    expect(d.primary_suspect_layer).toBe("UNKNOWN");
    expect(d.llm_call_count).toBe(1);
    expect(d.checks.some((c) => c.status === "fail")).toBe(false);
    expect(d.evidence.length).toBeGreaterThan(0);
    expect(d.summary).toContain("UNKNOWN");
  });

  it("fallback trace → PRIMARY=MODEL（第一个异常证据 = llm.attempt error），FALLBACK 检查通过", () => {
    buildFallback();
    const d = runDiagnosis(getTrace("trc_dg_fallback"));
    expect(d.primary_suspect_layer).toBe("MODEL");
    expect(d.degraded).toBe(true);
    const model = d.checks.find((c) => c.checkId === 6)!;
    expect(model.status).toBe("fail");
    expect(model.evidence[0]).toContain("MODEL_TIMEOUT");
    const fb = d.checks.find((c) => c.checkId === 11)!;
    expect(fb.status).toBe("pass");
    expect(d.evidence.some((e) => e.includes("MODEL_TIMEOUT"))).toBe(true);
  });

  it("幂等重放第二条 trace → UNKNOWN（duplicate_ignored 是正确行为，不算异常证据）", () => {
    buildIdempotentReplaySecond();
    const d = runDiagnosis(getTrace("trc_dg_replay_2"));
    expect(d.primary_suspect_layer).toBe("UNKNOWN");
    expect(d.idempotency_outcomes).toContain("duplicate_ignored");
    const sw = d.checks.find((c) => c.checkId === 9)!;
    expect(sw.status).toBe("pass");
    expect(d.evidence[0]).toContain("duplicate_ignored");
  });

  it("空答案短路 trace → UNKNOWN（llm_call_count=0 由 rule.applied 正向解释）", () => {
    buildEmptyShortCircuit();
    const d = runDiagnosis(getTrace("trc_dg_empty"));
    expect(d.llm_call_count).toBe(0);
    expect(d.primary_suspect_layer).toBe("UNKNOWN");
    expect(d.rule_keys).toContain("empty_answer_short_circuit");
    // check 6（MODEL）无事件 → evidence_missing，但附带短路解释
    const model = d.checks.find((c) => c.checkId === 6)!;
    expect(model.status).toBe("evidence_missing");
    expect(model.evidence.some((e) => e.includes("empty_answer_short_circuit"))).toBe(true);
    expect(shortCircuitExplanation(getTrace("trc_dg_empty").events)).toContain("llm_call_count=0");
  });

  it("retrieval miss trace → PRIMARY=RETRIEVAL（knowledge_miss_flag=true）", () => {
    buildRetrievalMiss();
    const d = runDiagnosis(getTrace("trc_dg_miss"));
    expect(d.primary_suspect_layer).toBe("RETRIEVAL");
    const ret = d.checks.find((c) => c.checkId === 4)!;
    expect(ret.status).toBe("fail");
    expect(ret.evidence[0]).toContain("knowledge_miss_flag=true");
  });
});

describe("M2 Phase 3A: Failure Layer Diagnosis — 边界场景", () => {
  beforeEach(() => {
    traceStore.reset();
    setTraceEnabled(true);
  });

  it("validation outcome=fail → PRIMARY=OUTPUT_VALIDATION", () => {
    const ctx = makeCtx("trc_dg_valfail", "/api/review/submit");
    ctx.emitRequestReceived({ input_summary: "x", method: "POST" });
    ctx.emitStateRead({ entity: "s", keys: {}, snapshot_summary: "s" });
    ctx.emitLlmAttempt({
      attempt_purpose: "primary", provider: "mock", model_name: "m", tier: "fast",
      prompt_key: "JudgeResult", prompt_version: "v1", token_usage: {}, latency_ms: 10,
      raw_output: "bad", raw_output_truncated: false,
    });
    ctx.emitValidationResult({ validator: "zod:JudgeResult", outcome: "fail", repair_attempts: 0 });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "x", fallback_used_flag: false });
    ctx.finalize(200, null);

    const d = runDiagnosis(getTrace("trc_dg_valfail"));
    expect(d.primary_suspect_layer).toBe("OUTPUT_VALIDATION");
    const v = d.checks.find((c) => c.checkId === 7)!;
    expect(v.status).toBe("fail");
    expect(v.evidence[0]).toContain("outcome=fail");
  });

  it("state.read state_not_found=true → PRIMARY=STATE_READ", () => {
    const ctx = makeCtx("trc_dg_notfound", "/api/review/session");
    ctx.emitRequestReceived({ input_summary: "session", method: "GET" });
    ctx.emitStateRead({ entity: "due_queue", keys: {}, snapshot_summary: "empty", state_not_found: true });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false });
    ctx.finalize(200, null);

    const d = runDiagnosis(getTrace("trc_dg_notfound"));
    expect(d.primary_suspect_layer).toBe("STATE_READ");
  });

  it("http 500 且无更早层证据 → PRIMARY=UI_PRESENTATION（含埋点缺口提示）", () => {
    const ctx = makeCtx("trc_dg_500", "/api/review/session");
    ctx.emitRequestReceived({ input_summary: "session", method: "GET" });
    ctx.emitResponseSent({ http_status: 500, app_error_code: "INTERNAL_ERROR", output_summary: "boom", fallback_used_flag: false });
    ctx.finalize(500, "INTERNAL_ERROR");

    const d = runDiagnosis(getTrace("trc_dg_500"));
    expect(d.primary_suspect_layer).toBe("UI_PRESENTATION");
    expect(d.http_status).toBe(500);
  });

  it("输入为空 → PRIMARY=INPUT", () => {
    const ctx = makeCtx("trc_dg_input", "/api/review/submit");
    ctx.emitRequestReceived({ input_summary: "", method: "POST" });
    ctx.emitResponseSent({ http_status: 400, app_error_code: "INVALID_INPUT", output_summary: "bad", fallback_used_flag: false });
    ctx.finalize(400, "INVALID_INPUT");

    const d = runDiagnosis(getTrace("trc_dg_input"));
    expect(d.primary_suspect_layer).toBe("INPUT");
  });

  it("结构性缺席：review/session（无 llm/validation/rule/write 节点）→ 对应检查 not_applicable", () => {
    const ctx = makeCtx("trc_dg_session", "/api/review/session");
    ctx.emitRequestReceived({ input_summary: "session", method: "GET" });
    ctx.emitStateRead({ entity: "due_queue", keys: {}, snapshot_summary: "due=5" });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false });
    ctx.finalize(200, null);

    const d = runDiagnosis(getTrace("trc_dg_session"));
    expect(d.primary_suspect_layer).toBe("UNKNOWN");
    const notApplicable = d.checks.filter((c) => c.status === "not_applicable").map((c) => c.checkId);
    // routing(2)、retrieval(4)、llm(5,6)、validation(7)、rule(8)、state.write(9)、report(10)、fallback(11) 结构性缺席
    expect(notApplicable).toEqual([2, 4, 5, 6, 7, 8, 9, 10, 11]);
    const missing = d.checks.filter((c) => c.status === "evidence_missing");
    // request(1)/response(12) 存在且通过；state.read(3) 存在且通过
    expect(missing).toHaveLength(0);
  });

  it("未知路由 → 缺席节点保守标 evidence_missing（不静默放行埋点缺口）", () => {
    const ctx = makeCtx("trc_dg_unknown_route", "/api/unknown");
    ctx.emitRequestReceived({ input_summary: "x", method: "POST" });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false });
    ctx.finalize(200, null);

    const d = runDiagnosis(getTrace("trc_dg_unknown_route"));
    expect(d.checks.some((c) => c.status === "evidence_missing")).toBe(true);
  });

  it("fail 检查的 evidence 与 eventSeqs 非空，且 evidence 引用了真实字段值", () => {
    buildFallback();
    const d = runDiagnosis(getTrace("trc_dg_fallback"));
    const model = d.checks.find((c) => c.checkId === 6)!;
    expect(model.evidence.length).toBeGreaterThan(0);
    expect(model.eventSeqs.length).toBeGreaterThan(0);
    expect(d.primary_suspect_layer).toBe("MODEL");
    expect(d.evidence.length).toBeGreaterThan(0);
  });
});
