/**
 * M2 Phase 2 — Product State & Decision Trace Tests
 * ------------------------------------------------------------
 * Fixtures A-E + Endpoint Node Conformance + Idempotency Trace
 *
 * 注意：这些是 Trace Capability Fixtures，不是 Eval Case 执行。
 * Eval Case 由 Eval Runner 负责。
 */
import { describe, it, expect, beforeEach } from "vitest";

import { TraceContext, setTraceEnabled, canonicalStateHash } from "@/lib/observability/trace-context";
import { traceStore } from "@/lib/observability/trace-store";
import {
  EVENT_TYPE_TO_LAYER,
  type TraceEventType,
} from "@/lib/observability/trace-contract";
import { MemoryLearningRepository } from "@/lib/learning/repositories/memory-learning-repository";
import type { LearningEvent, UserItemState } from "@/lib/learning/types";

// =============================================================
// Helpers
// =============================================================

function makeCtx(traceId: string, route: string): TraceContext {
  return new TraceContext(traceId, route);
}

function eventTypes(traceId: string): TraceEventType[] {
  const trace = traceStore.getTrace(traceId);
  return trace ? trace.events.map((e) => e.event_type) : [];
}

function hasEvent(traceId: string, type: TraceEventType): boolean {
  return eventTypes(traceId).includes(type);
}

function countEvents(traceId: string, type: TraceEventType): number {
  return eventTypes(traceId).filter((t) => t === type).length;
}

function findEvents(traceId: string, type: TraceEventType) {
  const trace = traceStore.getTrace(traceId);
  return trace ? trace.events.filter((e) => e.event_type === type) : [];
}

// =============================================================
// Endpoint Node Conformance Matrix
// =============================================================

const ENDPOINT_MATRIX: Record<string, { required: TraceEventType[]; optional?: TraceEventType[] }> = {
  "/api/agent/message": {
    required: ["request.received", "routing.decided", "response.sent"],
    optional: ["llm.attempt", "validation.result", "fallback.triggered"],
  },
  "/api/learn/card": {
    required: ["request.received", "retrieval.executed", "state.read", "response.sent"],
    optional: ["llm.attempt", "validation.result", "fallback.triggered"],
  },
  "/api/learn/submit": {
    required: ["request.received", "state.read", "rule.applied", "state.write", "response.sent"],
    optional: ["llm.attempt", "validation.result", "fallback.triggered"],
  },
  "/api/review/session": {
    required: ["request.received", "state.read", "response.sent"],
  },
  "/api/review/submit": {
    required: ["request.received", "state.read", "rule.applied", "state.write", "response.sent"],
    optional: ["llm.attempt", "validation.result", "fallback.triggered"],
  },
  "/api/speaking/analyze": {
    required: ["request.received", "state.read", "state.write", "response.sent"],
    optional: ["llm.attempt", "validation.result", "fallback.triggered", "rule.applied"],
  },
  "/api/report": {
    required: ["request.received", "state.read", "report.aggregated", "response.sent"],
    optional: ["rule.applied", "llm.attempt", "validation.result"],
  },
};

// =============================================================
// Tests
// =============================================================

describe("M2 Phase 2: Trace Contract — new event types", () => {
  beforeEach(() => {
    traceStore.reset();
    setTraceEnabled(true);
  });

  it("routing.decided maps to ROUTING layer", () => {
    expect(EVENT_TYPE_TO_LAYER["routing.decided"]).toBe("ROUTING");
  });

  it("state.read maps to STATE_READ layer", () => {
    expect(EVENT_TYPE_TO_LAYER["state.read"]).toBe("STATE_READ");
  });

  it("retrieval.executed maps to RETRIEVAL layer", () => {
    expect(EVENT_TYPE_TO_LAYER["retrieval.executed"]).toBe("RETRIEVAL");
  });

  it("rule.applied maps to BUSINESS_RULE layer", () => {
    expect(EVENT_TYPE_TO_LAYER["rule.applied"]).toBe("BUSINESS_RULE");
  });

  it("state.write maps to STATE_WRITE layer", () => {
    expect(EVENT_TYPE_TO_LAYER["state.write"]).toBe("STATE_WRITE");
  });

  it("report.aggregated maps to REPORT_AGGREGATION layer", () => {
    expect(EVENT_TYPE_TO_LAYER["report.aggregated"]).toBe("REPORT_AGGREGATION");
  });

  it("canonicalStateHash: same input → same hash", () => {
    const a = canonicalStateHash({ status: "NEW", recallLevel: 0 });
    const b = canonicalStateHash({ recallLevel: 0, status: "NEW" });
    expect(a).toBe(b);
  });

  it("canonicalStateHash: different input → different hash", () => {
    const a = canonicalStateHash({ status: "NEW" });
    const b = canonicalStateHash({ status: "EXPOSED" });
    expect(a).not.toBe(b);
  });

  it("canonicalStateHash: null → 'null'", () => {
    expect(canonicalStateHash(null)).toBe("null");
  });
});

describe("M2 Phase 2: Fixture A — Review Independent Correct", () => {
  beforeEach(() => traceStore.reset());

  it("完整事件链: request → state.read → llm → validation → rule → state.write → response", () => {
    const ctx = makeCtx("trc_fix_a", "/api/review/submit");
    ctx.emitRequestReceived({ input_summary: "review submit", method: "POST", client_event_id: "ce-a" });
    ctx.emitStateRead({
      entity: "user_item_state",
      keys: { userId: "u1", itemId: "item-1" },
      snapshot_summary: "status=EXPOSED, recallLevel=0",
    });
    ctx.emitLlmAttempt({
      attempt_purpose: "primary", provider: "mock", model_name: "mock-model", tier: "fast",
      prompt_key: "JudgeResult", prompt_version: "v1", token_usage: {}, latency_ms: 30,
      raw_output: '{"correct":true}', raw_output_truncated: false, raw_output_sha256: "abc",
    });
    ctx.emitValidationResult({ validator: "zod:JudgeResult", outcome: "pass", repair_attempts: 0 });
    ctx.emitRuleApplied({
      rule_key: "review_interval_table",
      inputs: { result: "CORRECT_INDEPENDENT", previous_recall_level: 0 },
      outputs: { next_review_at: "2026-09-12T00:00:00Z", recall_level_delta: "+1" },
    });
    ctx.emitStateWrite({
      entity: "user_item_state",
      keys: { userId: "u1", itemId: "item-1" },
      idempotency_outcome: "inserted",
      state_before: { status: "EXPOSED", recallLevel: 0 },
      state_after: { status: "RECALLED_INDEPENDENTLY", recallLevel: 1 },
      next_review_at_before: "2026-09-09T00:00:00Z",
      next_review_at_after: "2026-09-12T00:00:00Z",
    });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "correct", fallback_used_flag: false });
    ctx.finalize(200, null);

    const types = eventTypes("trc_fix_a");
    expect(types).toEqual([
      "request.received",
      "state.read",
      "llm.attempt",
      "validation.result",
      "rule.applied",
      "state.write",
      "response.sent",
    ]);

    // rule.applied 必须是 review_interval_table
    const ruleEvents = findEvents("trc_fix_a", "rule.applied");
    expect(ruleEvents[0]!.payload.rule_key).toBe("review_interval_table");

    // state.write 必须有 before/after diff
    const writeEvents = findEvents("trc_fix_a", "state.write");
    expect(writeEvents[0]!.payload.next_review_at_before).toBe("2026-09-09T00:00:00Z");
    expect(writeEvents[0]!.payload.next_review_at_after).toBe("2026-09-12T00:00:00Z");
  });
});

describe("M2 Phase 2: Fixture B — Empty Answer Short Circuit", () => {
  beforeEach(() => traceStore.reset());

  it("empty answer: no llm.attempt, rule.applied(empty_answer_short_circuit) 正向解释", () => {
    const ctx = makeCtx("trc_fix_b", "/api/review/submit");
    ctx.emitRequestReceived({ input_summary: "review submit", method: "POST", client_event_id: "ce-b" });
    ctx.emitStateRead({
      entity: "user_item_state",
      keys: { userId: "u1", itemId: "item-1" },
      snapshot_summary: "status=EXPOSED",
    });
    // 空答案短路：不调用 LLM
    ctx.emitRuleApplied({
      rule_key: "empty_answer_short_circuit",
      inputs: { answer_empty: true, skipped: false },
      outputs: { result: "INCORRECT", llm_call_count: 0 },
      llm_call_count: 0,
    });
    ctx.emitRuleApplied({
      rule_key: "review_interval_table",
      inputs: { result: "INCORRECT" },
      outputs: { next_review_at: "2026-09-09T04:00:00Z" },
    });
    ctx.emitStateWrite({
      entity: "user_item_state",
      keys: { userId: "u1", itemId: "item-1" },
      idempotency_outcome: "inserted",
      state_before: null,
      state_after: { status: "EXPOSED" },
    });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "incorrect", fallback_used_flag: false });
    ctx.finalize(200, null);

    // 关键断言：llm.attempt count = 0
    expect(countEvents("trc_fix_b", "llm.attempt")).toBe(0);

    // 必须有 empty_answer_short_circuit 正向解释
    const ruleEvents = findEvents("trc_fix_b", "rule.applied");
    const shortCircuit = ruleEvents.find((e) => e.payload.rule_key === "empty_answer_short_circuit");
    expect(shortCircuit).toBeDefined();
    expect(shortCircuit!.payload.llm_call_count).toBe(0);

    // 事件链完整
    expect(hasEvent("trc_fix_b", "request.received")).toBe(true);
    expect(hasEvent("trc_fix_b", "state.read")).toBe(true);
    expect(hasEvent("trc_fix_b", "state.write")).toBe(true);
    expect(hasEvent("trc_fix_b", "response.sent")).toBe(true);
  });
});

describe("M2 Phase 2: Fixture C — Retrieval Hit", () => {
  beforeEach(() => traceStore.reset());

  it("retrieval hit: retrieval.executed 记录 knowledge_object_ids 和 miss_flag", () => {
    const ctx = makeCtx("trc_fix_c", "/api/learn/card");
    ctx.emitRequestReceived({ input_summary: "learn card", method: "POST" });
    ctx.emitRetrievalExecuted({
      query_raw: "sustainable",
      query_normalized: "sustainable",
      knowledge_object_ids: ["seed:sustainable"],
      knowledge_injected_count: 1,
      knowledge_miss_flag: false,
      conflict_detected: false,
      conflict_resolution: "capability_missing",
    });
    ctx.emitStateRead({
      entity: "user_item_state",
      keys: { userId: "u1", itemId: "item-sustainable" },
      snapshot_summary: "not learned yet",
      state_not_found: true,
    });
    ctx.emitLlmAttempt({
      attempt_purpose: "primary", provider: "mock", model_name: "mock-model", tier: "fast",
      prompt_key: "WordCard", prompt_version: "v1", token_usage: {}, latency_ms: 50,
      raw_output: '{"term":"sustainable"}', raw_output_truncated: false, raw_output_sha256: "def",
    });
    ctx.emitValidationResult({ validator: "zod:WordCard", outcome: "pass", repair_attempts: 0 });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "card generated", fallback_used_flag: false });
    ctx.finalize(200, null);

    const retrievalEvents = findEvents("trc_fix_c", "retrieval.executed");
    expect(retrievalEvents.length).toBe(1);
    expect(retrievalEvents[0]!.payload.knowledge_miss_flag).toBe(false);
    expect(retrievalEvents[0]!.payload.knowledge_object_ids).toEqual(["seed:sustainable"]);
    expect(retrievalEvents[0]!.payload.knowledge_injected_count).toBe(1);
    // conflict detection capability missing 明确标记
    expect(retrievalEvents[0]!.payload.conflict_resolution).toBe("capability_missing");

    expect(hasEvent("trc_fix_c", "state.read")).toBe(true);
    expect(hasEvent("trc_fix_c", "llm.attempt")).toBe(true);
  });

  it("retrieval miss: knowledge_miss_flag=true, 后续 LLM 生成", () => {
    const ctx = makeCtx("trc_fix_c_miss", "/api/learn/card");
    ctx.emitRequestReceived({ input_summary: "learn card", method: "POST" });
    ctx.emitRetrievalExecuted({
      query_raw: "nonexistentword",
      query_normalized: "nonexistentword",
      knowledge_object_ids: [],
      knowledge_injected_count: 0,
      knowledge_miss_flag: true,
    });
    ctx.emitLlmAttempt({
      attempt_purpose: "primary", provider: "mock", model_name: "mock-model", tier: "fast",
      prompt_key: "WordCard", prompt_version: "v1", token_usage: {}, latency_ms: 100,
      raw_output: '{"term":"nonexistentword"}', raw_output_truncated: false, raw_output_sha256: "ghi",
    });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "llm generated", fallback_used_flag: false });
    ctx.finalize(200, null);

    const retrievalEvents = findEvents("trc_fix_c_miss", "retrieval.executed");
    expect(retrievalEvents[0]!.payload.knowledge_miss_flag).toBe(true);
    expect(retrievalEvents[0]!.payload.knowledge_injected_count).toBe(0);
  });
});

describe("M2 Phase 2: Fixture D — Report Insufficient Data", () => {
  beforeEach(() => traceStore.reset());

  it("insufficient data: report.aggregated + rule.applied(insufficient_data), 不调用 LLM summary", () => {
    const ctx = makeCtx("trc_fix_d", "/api/report");
    ctx.emitRequestReceived({ input_summary: "report", method: "GET" });
    ctx.emitStateRead({
      entity: "report_source_data",
      keys: { userId: "u1", period: "7d" },
      snapshot_summary: "states=0, events=0, sessions=0",
    });
    ctx.emitReportAggregated({
      period: "7d",
      aggregate_checksum: "abc123",
      insufficient_data_flag: true,
      baseline_availability: false,
      summary_generated: false,
      section_render_flags: { memory: false, review: false, speaking: false, recommendations: false },
      aggregate_values: { totalItems: 0, totalEvents: 0, totalSessions: 0 },
    });
    ctx.emitRuleApplied({
      rule_key: "insufficient_data",
      inputs: { events_count: 0, sessions_count: 0, states_count: 0 },
      outputs: { insufficient_data: true, show_message: true, llm_summary_skipped: true },
      llm_call_count: 0,
    });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "insufficient data", fallback_used_flag: false });
    ctx.finalize(200, null);

    const reportEvents = findEvents("trc_fix_d", "report.aggregated");
    expect(reportEvents[0]!.payload.insufficient_data_flag).toBe(true);
    expect(reportEvents[0]!.payload.baseline_availability).toBe(false);

    const ruleEvents = findEvents("trc_fix_d", "rule.applied");
    expect(ruleEvents[0]!.payload.rule_key).toBe("insufficient_data");
    expect(ruleEvents[0]!.payload.llm_call_count).toBe(0);

    // 不调用 LLM summary
    expect(countEvents("trc_fix_d", "llm.attempt")).toBe(0);
  });
});

describe("M2 Phase 2: Fixture E — Idempotent Replay", () => {
  beforeEach(() => traceStore.reset());

  it("重复 clientEventId: 第二条 trace state.write.idempotency_outcome=duplicate_ignored", async () => {
    const repo = new MemoryLearningRepository();
    const userId = "u1";
    const itemId = "item-1";
    const clientEventId = "ce-idempotent-001";

    // 先创建 item
    await repo.createOrGetItem({
      id: itemId,
      itemType: "WORD",
      canonicalForm: "test",
      normalizedTerm: "test",
      contentJson: {} as never,
      topicTags: [],
      createdAt: new Date().toISOString(),
    });

    // 第一次提交
    const ctx1 = makeCtx("trc_fix_e_1", "/api/review/submit");
    ctx1.emitRequestReceived({ input_summary: "review submit", method: "POST", client_event_id: clientEventId });
    const result1 = await repo.createLearningEvent({
      userId, itemId, eventType: "REVIEW", taskType: "MEANING_RECALL",
      answer: "test", correctness: "INDEPENDENT", hintLevel: 0,
      resultJson: {}, clientEventId, traceId: "trc_fix_e_1",
    });
    ctx1.emitStateWrite({
      entity: "learning_event",
      keys: { userId, itemId, eventId: result1.event.id },
      client_event_id: clientEventId,
      idempotency_outcome: result1.created ? "inserted" : "duplicate_ignored",
      state_before: null,
      state_after: { eventType: "REVIEW" },
    });
    ctx1.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "first", fallback_used_flag: false });
    ctx1.finalize(200, null);

    // 第二次提交（同 clientEventId）
    const ctx2 = makeCtx("trc_fix_e_2", "/api/review/submit");
    ctx2.emitRequestReceived({ input_summary: "review submit", method: "POST", client_event_id: clientEventId });
    const result2 = await repo.createLearningEvent({
      userId, itemId, eventType: "REVIEW", taskType: "MEANING_RECALL",
      answer: "test", correctness: "INDEPENDENT", hintLevel: 0,
      resultJson: {}, clientEventId, traceId: "trc_fix_e_2",
    });
    ctx2.emitStateWrite({
      entity: "learning_event",
      keys: { userId, itemId, eventId: result2.event.id },
      client_event_id: clientEventId,
      idempotency_outcome: result2.created ? "inserted" : "duplicate_ignored",
      state_before: null,
      state_after: { eventType: "REVIEW" },
    });
    ctx2.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "replay", fallback_used_flag: false, idempotent_replay: true });
    ctx2.finalize(200, null);

    // 第一次: inserted
    const write1 = findEvents("trc_fix_e_1", "state.write");
    expect(write1[0]!.payload.idempotency_outcome).toBe("inserted");

    // 第二次: duplicate_ignored
    const write2 = findEvents("trc_fix_e_2", "state.write");
    expect(write2[0]!.payload.idempotency_outcome).toBe("duplicate_ignored");

    // event id 相同（返回既有 event）
    expect(result1.event.id).toBe(result2.event.id);

    // created 标志
    expect(result1.created).toBe(true);
    expect(result2.created).toBe(false);
  });
});

describe("M2 Phase 2: Endpoint Node Conformance", () => {
  beforeEach(() => traceStore.reset());

  it("每个端点的 required 节点在 Fixture 中都存在", () => {
    // 为每个端点构造最小满足 required 节点的 trace
    for (const [route, matrix] of Object.entries(ENDPOINT_MATRIX)) {
      const traceId = `trc_conform_${route.replace(/[^a-z0-9]/gi, "_")}`;
      const ctx = makeCtx(traceId, route);
      ctx.emitRequestReceived({ input_summary: route, method: "POST" });

      for (const node of matrix.required) {
        switch (node) {
          case "routing.decided":
            ctx.emitRoutingDecided({ intent_decision: "NONE", ui_action_type: "NONE", persistence_required: false });
            break;
          case "state.read":
            ctx.emitStateRead({ entity: "test", keys: {}, snapshot_summary: "test" });
            break;
          case "retrieval.executed":
            ctx.emitRetrievalExecuted({ query_raw: "test", query_normalized: "test", knowledge_object_ids: [], knowledge_injected_count: 0, knowledge_miss_flag: true });
            break;
          case "llm.attempt":
            ctx.emitLlmAttempt({ attempt_purpose: "primary", provider: "mock", model_name: "m", tier: "fast", prompt_key: "k", prompt_version: "v1", token_usage: {}, latency_ms: 1, raw_output: "{}", raw_output_truncated: false, raw_output_sha256: "x" });
            break;
          case "validation.result":
            ctx.emitValidationResult({ validator: "zod", outcome: "pass", repair_attempts: 0 });
            break;
          case "fallback.triggered":
            ctx.emitFallbackTriggered({ trigger_error_code: "TEST", chain_snapshot: [], degradation_flag: true, to_kind: "provider" });
            break;
          case "rule.applied":
            ctx.emitRuleApplied({ rule_key: "test", inputs: {}, outputs: {} });
            break;
          case "state.write":
            ctx.emitStateWrite({ entity: "test", keys: {}, idempotency_outcome: "inserted", state_before: null, state_after: null });
            break;
          case "report.aggregated":
            ctx.emitReportAggregated({ period: "7d", aggregate_checksum: "x", insufficient_data_flag: false, baseline_availability: true, summary_generated: null, section_render_flags: {} });
            break;
        }
      }
      ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false });
      ctx.finalize(200, null);

      // 验证所有 required 节点存在
      for (const node of matrix.required) {
        expect(hasEvent(traceId, node), `${route} missing required node: ${node}`).toBe(true);
      }
    }
  });

  it("主动短路必须通过 rule.applied 正向解释（不能靠没有 llm.attempt 猜测）", () => {
    // Fixture B 已验证：empty_answer_short_circuit 有 rule.applied
    // 这里验证通用原则：如果 llm.attempt=0，必须有对应的 rule.applied 解释
    const ctx = makeCtx("trc_short_circuit_check", "/api/learn/submit");
    ctx.emitRequestReceived({ input_summary: "test", method: "POST" });
    ctx.emitStateRead({ entity: "test", keys: {}, snapshot_summary: "test" });
    ctx.emitRuleApplied({
      rule_key: "empty_answer_short_circuit",
      inputs: { answer_empty: true },
      outputs: { llm_call_count: 0 },
      llm_call_count: 0,
    });
    ctx.emitStateWrite({ entity: "test", keys: {}, idempotency_outcome: "inserted", state_before: null, state_after: null });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false });
    ctx.finalize(200, null);

    expect(countEvents("trc_short_circuit_check", "llm.attempt")).toBe(0);
    const ruleEvents = findEvents("trc_short_circuit_check", "rule.applied");
    expect(ruleEvents.length).toBeGreaterThan(0);
    expect(ruleEvents[0]!.payload.llm_call_count).toBe(0);
  });
});

describe("M2 Phase 2: Regression Guard — Trace Disabled no-op", () => {
  beforeEach(() => traceStore.reset());

  it("Trace Disabled: 所有新事件类型也为 no-op", () => {
    setTraceEnabled(false);
    const ctx = makeCtx("trc_disabled_phase2", "/api/review/submit");
    ctx.emitRequestReceived({ input_summary: "test", method: "POST" });
    ctx.emitStateRead({ entity: "test", keys: {}, snapshot_summary: "test" });
    ctx.emitRuleApplied({ rule_key: "test", inputs: {}, outputs: {} });
    ctx.emitStateWrite({ entity: "test", keys: {}, idempotency_outcome: "inserted", state_before: null, state_after: null });
    ctx.emitRoutingDecided({ intent_decision: "NONE", ui_action_type: "NONE", persistence_required: false });
    ctx.emitRetrievalExecuted({ query_raw: "t", query_normalized: "t", knowledge_object_ids: [], knowledge_injected_count: 0, knowledge_miss_flag: true });
    ctx.emitReportAggregated({ period: "7d", aggregate_checksum: "x", insufficient_data_flag: false, baseline_availability: true, summary_generated: null, section_render_flags: {} });
    ctx.emitResponseSent({ http_status: 200, app_error_code: null, output_summary: "ok", fallback_used_flag: false });
    ctx.finalize(200, null);

    expect(traceStore.getTrace("trc_disabled_phase2")).toBeNull();
    setTraceEnabled(true);
  });
});
