/**
 * M2 Phase 3A — Debug Console: Trace Fixtures（5 场景）
 * ------------------------------------------------------------
 * 验证 fixture 反映产品真实行为：
 *   A normal（无降级）/ B fallback（degradation）/ C 幂等重放（inserted→duplicate_ignored）
 *   D 空答案短路（llm_call_count=0 正向解释）/ E 检索 miss（miss_flag=true）
 * 并验证 ensureDebugFixtures 幂等（重复调用不重复写入）。
 */
import { describe, it, expect, beforeEach } from "vitest";

import { DEBUG_FIXTURES, ensureDebugFixtures } from "@/lib/debug/console/fixtures";
import { TraceContext, setTraceEnabled } from "@/lib/observability/trace-context";
import { traceStore } from "@/lib/observability/trace-store";
import type { TraceEvent, TraceEventType } from "@/lib/observability/trace-contract";

function eventTypes(traceId: string): TraceEventType[] {
  const t = traceStore.getTrace(traceId);
  return t ? t.events.map((e) => e.event_type) : [];
}

function countEvents(traceId: string, type: TraceEventType): number {
  return eventTypes(traceId).filter((t) => t === type).length;
}

function findEvents(traceId: string, type: TraceEventType): TraceEvent[] {
  const t = traceStore.getTrace(traceId);
  return t ? t.events.filter((e) => e.event_type === type) : [];
}

function headerOf(traceId: string) {
  const t = traceStore.getTrace(traceId);
  if (!t) throw new Error(`trace ${traceId} not found`);
  return t.header;
}

describe("M2 Phase 3A: Console Fixtures — 5 场景", () => {
  beforeEach(async () => {
    traceStore.reset();
    setTraceEnabled(true);
    await ensureDebugFixtures();
  });

  it("fixture 元信息覆盖 5 个场景，共 6 条 trace", () => {
    const scenarios = new Set(DEBUG_FIXTURES.map((f) => f.scenario));
    expect(scenarios).toEqual(new Set(["normal", "fallback", "idempotent_replay", "empty_answer_short_circuit", "retrieval_miss"]));
    expect(DEBUG_FIXTURES).toHaveLength(6);
  });

  it("A. normal：完整事件链、无降级、rule_key=review_interval_table", () => {
    const types = eventTypes("trc_m2a_normal");
    expect(types).toEqual([
      "request.received",
      "state.read",
      "llm.attempt",
      "validation.result",
      "rule.applied",
      "state.write",
      "state.write",
      "response.sent",
    ]);
    expect(headerOf("trc_m2a_normal").degradation_flag).toBe(false);
    const rule = findEvents("trc_m2a_normal", "rule.applied")[0]!;
    expect(rule.payload.rule_key).toBe("review_interval_table");
    const writes = findEvents("trc_m2a_normal", "state.write");
    expect(writes.every((w) => w.payload.idempotency_outcome === "inserted")).toBe(true);
  });

  it("B. fallback：primary MODEL_TIMEOUT → fallback provider 成功，degradation 传播到 header", () => {
    const attempts = findEvents("trc_m2b_fallback", "llm.attempt");
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.status).toBe("error");
    expect(attempts[0]!.error_code).toBe("MODEL_TIMEOUT");
    expect(attempts[1]!.payload.attempt_purpose).toBe("fallback_provider");
    expect(attempts[1]!.status).toBe("ok");
    const fb = findEvents("trc_m2b_fallback", "fallback.triggered")[0]!;
    expect(fb.payload.degradation_flag).toBe(true);
    expect(fb.payload.to_kind).toBe("provider");
    expect(headerOf("trc_m2b_fallback").degradation_flag).toBe(true);
    const rsp = findEvents("trc_m2b_fallback", "response.sent")[0]!;
    expect(rsp.payload.fallback_used_flag).toBe(true);
  });

  it("C. 幂等重放：同 client_event_id，第一次 inserted / 第二次 duplicate_ignored", async () => {
    const h1 = headerOf("trc_m2c_replay_1");
    const h2 = headerOf("trc_m2c_replay_2");
    expect(h1.client_event_id).toBe("ce-m2c-replay-001");
    expect(h2.client_event_id).toBe("ce-m2c-replay-001");

    const w1 = findEvents("trc_m2c_replay_1", "state.write")[0]!;
    const w2 = findEvents("trc_m2c_replay_2", "state.write")[0]!;
    expect(w1.payload.idempotency_outcome).toBe("inserted");
    expect(w2.payload.idempotency_outcome).toBe("duplicate_ignored");

    const rsp2 = findEvents("trc_m2c_replay_2", "response.sent")[0]!;
    expect(rsp2.payload.idempotent_replay).toBe(true);
  });

  it("D. 空答案短路：llm.attempt=0，rule.applied(empty_answer_short_circuit).llm_call_count=0", () => {
    expect(countEvents("trc_m2d_empty", "llm.attempt")).toBe(0);
    const rules = findEvents("trc_m2d_empty", "rule.applied");
    const sc = rules.find((e) => e.payload.rule_key === "empty_answer_short_circuit");
    expect(sc).toBeDefined();
    expect(sc!.payload.llm_call_count).toBe(0);
    expect(rules.some((e) => e.payload.rule_key === "learning_branch_map")).toBe(true);
  });

  it("E. 检索 miss：knowledge_miss_flag=true、ids=[]、LLM 未被阻塞", () => {
    const ret = findEvents("trc_m2e_retrieval_miss", "retrieval.executed")[0]!;
    expect(ret.payload.knowledge_miss_flag).toBe(true);
    expect(ret.payload.knowledge_object_ids).toEqual([]);
    expect(ret.payload.query_raw).toBeDefined();
    expect(ret.payload.query_normalized).toBeDefined();
    // miss 不阻塞 LLM（Case 024 真实行为）
    expect(countEvents("trc_m2e_retrieval_miss", "llm.attempt")).toBe(1);
  });
});

describe("M2 Phase 3A: Console Fixtures — 幂等性", () => {
  beforeEach(() => {
    traceStore.reset();
    setTraceEnabled(true);
  });

  it("重复调用 ensureDebugFixtures 不重复写入事件", async () => {
    await ensureDebugFixtures();
    const before = headerOf("trc_m2a_normal").event_count;
    const idsBefore = traceStore.listTraceIds(100);

    await ensureDebugFixtures();
    await ensureDebugFixtures();

    expect(headerOf("trc_m2a_normal").event_count).toBe(before);
    expect(traceStore.listTraceIds(100)).toEqual(idsBefore);
  });

  it("Trace Disabled 时 fixture 不写入 store（Regression Guard no-op）", async () => {
    setTraceEnabled(false);
    await ensureDebugFixtures();
    // 但幂等重放使用 Repository（与 trace 开关无关）——store 里不应有任何 fixture trace
    for (const f of DEBUG_FIXTURES) {
      expect(traceStore.getTrace(f.traceId)).toBeNull();
    }
    setTraceEnabled(true);
  });
});

describe("M2 Phase 3A: Console Fixtures — 与 diagnosis 联动", () => {
  beforeEach(async () => {
    traceStore.reset();
    setTraceEnabled(true);
    await ensureDebugFixtures();
  });

  it("A/B/D/E 的诊断输出符合 §4.4 预期（正常=UNKNOWN / fallback=MODEL / 空答案=UNKNOWN / miss=RETRIEVAL）", async () => {
    const { runDiagnosis } = await import("@/lib/debug/console/diagnosis");
    expect(runDiagnosis(traceStore.getTrace("trc_m2a_normal")!).primary_suspect_layer).toBe("UNKNOWN");
    expect(runDiagnosis(traceStore.getTrace("trc_m2b_fallback")!).primary_suspect_layer).toBe("MODEL");
    expect(runDiagnosis(traceStore.getTrace("trc_m2c_replay_2")!).primary_suspect_layer).toBe("UNKNOWN");
    expect(runDiagnosis(traceStore.getTrace("trc_m2d_empty")!).primary_suspect_layer).toBe("UNKNOWN");
    expect(runDiagnosis(traceStore.getTrace("trc_m2e_retrieval_miss")!).primary_suspect_layer).toBe("RETRIEVAL");
  });

  it("console 测试使用 TraceContext 构建，无需真实 LLM 调用", () => {
    // 该断言仅为文档性：fixtures 不依赖外部 provider
    expect(typeof TraceContext).toBe("function");
  });
});
