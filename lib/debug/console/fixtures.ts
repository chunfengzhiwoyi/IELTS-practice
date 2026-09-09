/**
 * M2 Phase 3A — Debug Console Trace Fixtures
 * ------------------------------------------------------------
 * 5 个 Trace Capability Fixture，用于在 /debug/traces 展示 Console 能力：
 *   A. normal                  正常链路（LLM + validation + rule + state.write）
 *   B. fallback                主 LLM 失败 → fallback provider 成功（degradation）
 *   C. idempotent_replay       同 client_event_id 两次提交（inserted → duplicate_ignored）
 *   D. empty_answer_short_circuit  空答案短路（llm_call_count=0 正向解释，Case 008 真实行为）
 *   E. retrieval_miss          检索 miss（knowledge_miss_flag=true，Case 035 真实行为）
 *
 * 诚实性声明：
 *   - 这些是 Trace Capability Fixtures，不是 ELS-EVAL Case 执行。
 *   - D/E 记录的是产品**当前真实行为**：空答案确实短路（不调 LLM）、未知词确实 miss。
 *     不得因 Case 008 / 035 当前 FAIL 而伪造「正确 Trace」——Console 的工作是展示真实发生了什么。
 *   - Fixture 通过 TraceContext emitter 生成（与产品代码同一埋点路径），trace_id 固定便于链接。
 */
import { MemoryLearningRepository } from "@/lib/learning/repositories/memory-learning-repository";
import { canonicalKey } from "@/lib/learning/item-id";
import { TraceContext } from "@/lib/observability/trace-context";
import { traceStore } from "@/lib/observability/trace-store";

export type DebugFixtureScenario =
  | "normal"
  | "fallback"
  | "idempotent_replay"
  | "empty_answer_short_circuit"
  | "retrieval_miss";

export interface DebugFixtureMeta {
  traceId: string;
  label: string;
  scenario: DebugFixtureScenario;
  description: string;
  /** 关联 trace（幂等重放的第二条 trace 等） */
  relatedTraceIds?: string[];
}

export const DEBUG_FIXTURES: DebugFixtureMeta[] = [
  {
    traceId: "trc_m2a_normal",
    label: "A. Normal request",
    scenario: "normal",
    description: "/api/review/submit 正常链路：request → state.read → llm → validation → rule → state.write → response",
  },
  {
    traceId: "trc_m2b_fallback",
    label: "B. Fallback request",
    scenario: "fallback",
    description: "主 LLM MODEL_TIMEOUT → fallback provider 成功（degradation_flag=true）",
  },
  {
    traceId: "trc_m2c_replay_1",
    label: "C. Idempotent replay（第 1 次）",
    scenario: "idempotent_replay",
    description: "同 client_event_id 首次提交：state.write.idempotency_outcome=inserted",
    relatedTraceIds: ["trc_m2c_replay_2"],
  },
  {
    traceId: "trc_m2c_replay_2",
    label: "C. Idempotent replay（第 2 次）",
    scenario: "idempotent_replay",
    description: "同 client_event_id 重复提交：state.write.idempotency_outcome=duplicate_ignored（正确重放行为）",
    relatedTraceIds: ["trc_m2c_replay_1"],
  },
  {
    traceId: "trc_m2d_empty",
    label: "D. Empty-answer short-circuit",
    scenario: "empty_answer_short_circuit",
    description: "空答案短路：llm_call_count=0，rule.applied(empty_answer_short_circuit) 正向解释（Case 008 真实行为）",
  },
  {
    traceId: "trc_m2e_retrieval_miss",
    label: "E. Retrieval miss trace",
    scenario: "retrieval_miss",
    description: "检索 miss：knowledge_miss_flag=true、ids=[]，LLM 未被阻塞（Case 035 真实行为）",
  },
];

// =============================================================
// Fixture 构建
// =============================================================

function buildNormal(): void {
  const ctx = new TraceContext("trc_m2a_normal", "/api/review/submit");
  ctx.emitRequestReceived({
    input_summary: "review submit: answer='sustainable'",
    client_event_id: "ce-m2a-normal",
    method: "POST",
  });
  ctx.emitStateRead({
    entity: "user_item_state",
    keys: { userId: "u1", itemId: "item-1" },
    snapshot_summary: "status=EXPOSED, recallLevel=0, nextReviewAt=2026-09-09",
  });
  ctx.emitLlmAttempt({
    attempt_purpose: "primary",
    provider: "mock",
    model_name: "mock-model",
    tier: "fast",
    prompt_key: "JudgeResult",
    prompt_version: "v1",
    token_usage: { prompt: 120, completion: 60, total: 180 },
    latency_ms: 180,
    raw_output: '{"correct":true,"confidence":"high"}',
    raw_output_truncated: false,
    raw_output_sha256: "m2a-abc123",
  });
  ctx.emitValidationResult({ validator: "zod:JudgeResult", outcome: "pass", repair_attempts: 0 });
  ctx.emitRuleApplied({
    rule_key: "review_interval_table",
    inputs: { result: "CORRECT_INDEPENDENT", used_hint: false, previous_recall_level: 0 },
    outputs: { next_review_at: "2026-09-12T00:00:00Z", recall_level_delta: 1, interval_hours: 72 },
  });
  ctx.emitStateWrite({
    entity: "learning_event",
    keys: { userId: "u1", itemId: "item-1", eventId: "evt-m2a-1" },
    client_event_id: "ce-m2a-normal",
    idempotency_outcome: "inserted",
    state_before: null,
    state_after: { eventType: "REVIEW", correctness: "INDEPENDENT" },
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
  ctx.emitResponseSent({
    http_status: 200,
    app_error_code: null,
    output_summary: "correct=true, next review 2026-09-12",
    fallback_used_flag: false,
  });
  ctx.finalize(200, null);
}

function buildFallback(): void {
  const ctx = new TraceContext("trc_m2b_fallback", "/api/review/submit");
  ctx.emitRequestReceived({
    input_summary: "review submit: answer='parliament'",
    client_event_id: "ce-m2b-fallback",
    method: "POST",
  });
  ctx.emitStateRead({
    entity: "user_item_state",
    keys: { userId: "u1", itemId: "item-2" },
    snapshot_summary: "status=EXPOSED, recallLevel=0",
  });
  ctx.emitLlmAttempt(
    {
      attempt_purpose: "primary",
      provider: "mock",
      model_name: "mock-model",
      tier: "fast",
      prompt_key: "JudgeResult",
      prompt_version: "v1",
      token_usage: {},
      latency_ms: 5000,
      raw_output: "",
      raw_output_truncated: false,
      llm_error_code: "MODEL_TIMEOUT",
    },
    "error",
  );
  ctx.emitFallbackTriggered({
    trigger_error_code: "MODEL_TIMEOUT",
    chain_snapshot: [
      { step: "primary", from: "mock", to: "mock", status: "used" },
      { step: "fallback_provider", from: "mock", to: "bailian", status: "used" },
    ],
    degradation_flag: true,
    to_kind: "provider",
  });
  ctx.emitLlmAttempt({
    attempt_purpose: "fallback_provider",
    provider: "bailian",
    model_name: "bailian-model",
    tier: "fast",
    prompt_key: "JudgeResult",
    prompt_version: "v1",
    token_usage: { prompt: 110, completion: 55, total: 165 },
    latency_ms: 120,
    raw_output: '{"correct":false,"confidence":"medium"}',
    raw_output_truncated: false,
    raw_output_sha256: "m2b-def456",
  });
  ctx.emitValidationResult({ validator: "zod:JudgeResult", outcome: "pass", repair_attempts: 0 });
  ctx.emitStateWrite({
    entity: "learning_event",
    keys: { userId: "u1", itemId: "item-2", eventId: "evt-m2b-1" },
    client_event_id: "ce-m2b-fallback",
    idempotency_outcome: "inserted",
    state_before: null,
    state_after: { eventType: "REVIEW", correctness: "INCORRECT" },
  });
  ctx.emitResponseSent({
    http_status: 200,
    app_error_code: null,
    output_summary: "correct=false (fallback provider)",
    fallback_used_flag: true,
  });
  ctx.finalize(200, null);
}

async function buildIdempotentReplay(): Promise<void> {
  const repo = new MemoryLearningRepository();
  const userId = "u1";
  const itemId = "item-3";
  const clientEventId = "ce-m2c-replay-001";

  await repo.createOrGetItem({
    id: itemId,
    itemType: "WORD",
    canonicalForm: "resilience",
    normalizedTerm: "resilience",
    canonicalKey: canonicalKey("resilience"),
    contentJson: {} as never,
    topicTags: [],
    createdAt: new Date().toISOString(),
  });

  // 第 1 次提交
  const ctx1 = new TraceContext("trc_m2c_replay_1", "/api/review/submit");
  ctx1.emitRequestReceived({
    input_summary: "review submit: answer='resilience'",
    client_event_id: clientEventId,
    method: "POST",
  });
  ctx1.emitStateRead({
    entity: "user_item_state",
    keys: { userId, itemId },
    snapshot_summary: "status=EXPOSED, recallLevel=0",
  });
  ctx1.emitLlmAttempt({
    attempt_purpose: "primary",
    provider: "mock",
    model_name: "mock-model",
    tier: "fast",
    prompt_key: "JudgeResult",
    prompt_version: "v1",
    token_usage: {},
    latency_ms: 90,
    raw_output: '{"correct":true,"confidence":"high"}',
    raw_output_truncated: false,
    raw_output_sha256: "m2c-111",
  });
  ctx1.emitValidationResult({ validator: "zod:JudgeResult", outcome: "pass", repair_attempts: 0 });
  const r1 = await repo.createLearningEvent({
    userId,
    itemId,
    eventType: "REVIEW",
    taskType: "MEANING_RECALL",
    answer: "resilience",
    correctness: "INDEPENDENT",
    hintLevel: 0,
    resultJson: {},
    clientEventId,
    traceId: "trc_m2c_replay_1",
  });
  ctx1.emitStateWrite({
    entity: "learning_event",
    keys: { userId, itemId, eventId: r1.event.id },
    client_event_id: clientEventId,
    idempotency_outcome: r1.created ? "inserted" : "duplicate_ignored",
    state_before: null,
    state_after: { eventType: "REVIEW", correctness: "INDEPENDENT" },
  });
  ctx1.emitResponseSent({
    http_status: 200,
    app_error_code: null,
    output_summary: "first submit ok",
    fallback_used_flag: false,
    idempotent_replay: false,
  });
  ctx1.finalize(200, null);

  // 第 2 次提交（同 clientEventId，网络重试模拟）
  const ctx2 = new TraceContext("trc_m2c_replay_2", "/api/review/submit");
  ctx2.emitRequestReceived({
    input_summary: "review submit: answer='resilience' (retry)",
    client_event_id: clientEventId,
    method: "POST",
  });
  ctx2.emitStateRead({
    entity: "user_item_state",
    keys: { userId, itemId },
    snapshot_summary: "status=RECALLED_INDEPENDENTLY, recallLevel=1",
  });
  ctx2.emitLlmAttempt({
    attempt_purpose: "primary",
    provider: "mock",
    model_name: "mock-model",
    tier: "fast",
    prompt_key: "JudgeResult",
    prompt_version: "v1",
    token_usage: {},
    latency_ms: 85,
    raw_output: '{"correct":true,"confidence":"high"}',
    raw_output_truncated: false,
    raw_output_sha256: "m2c-222",
  });
  ctx2.emitValidationResult({ validator: "zod:JudgeResult", outcome: "pass", repair_attempts: 0 });
  const r2 = await repo.createLearningEvent({
    userId,
    itemId,
    eventType: "REVIEW",
    taskType: "MEANING_RECALL",
    answer: "resilience",
    correctness: "INDEPENDENT",
    hintLevel: 0,
    resultJson: {},
    clientEventId,
    traceId: "trc_m2c_replay_2",
  });
  ctx2.emitStateWrite({
    entity: "learning_event",
    keys: { userId, itemId, eventId: r2.event.id },
    client_event_id: clientEventId,
    idempotency_outcome: r2.created ? "inserted" : "duplicate_ignored",
    state_before: null,
    state_after: { eventType: "REVIEW", correctness: "INDEPENDENT" },
  });
  ctx2.emitResponseSent({
    http_status: 200,
    app_error_code: null,
    output_summary: "replay ignored, same event returned",
    fallback_used_flag: false,
    idempotent_replay: true,
  });
  ctx2.finalize(200, null);
}

function buildEmptyAnswerShortCircuit(): void {
  const ctx = new TraceContext("trc_m2d_empty", "/api/learn/submit");
  ctx.emitRequestReceived({
    input_summary: "learn submit: answer empty ('' skipped)",
    client_event_id: "ce-m2d-empty",
    method: "POST",
  });
  ctx.emitStateRead({
    entity: "user_item_state",
    keys: { userId: "u1", itemId: "item-4" },
    snapshot_summary: "status=NEW, not answered yet",
  });
  // 空答案短路：确定性规则，不调用 LLM（Case 008 真实行为）
  ctx.emitRuleApplied({
    rule_key: "empty_answer_short_circuit",
    inputs: { answer_empty: true, skipped: false },
    outputs: { result: "INCORRECT", llm_call_count: 0 },
    llm_call_count: 0,
  });
  ctx.emitRuleApplied({
    rule_key: "learning_branch_map",
    inputs: { correctness: "INCORRECT", used_hint: false, short_circuited: true },
    outputs: { status: "EXPOSED", schedule_quality: "relearn" },
  });
  ctx.emitStateWrite({
    entity: "learning_event",
    keys: { userId: "u1", itemId: "item-4", eventId: "evt-m2d-1" },
    client_event_id: "ce-m2d-empty",
    idempotency_outcome: "inserted",
    state_before: null,
    state_after: { eventType: "LEARN", correctness: "INCORRECT", short_circuited: true },
  });
  ctx.emitStateWrite({
    entity: "user_item_state",
    keys: { userId: "u1", itemId: "item-4" },
    idempotency_outcome: "inserted",
    state_before: null,
    state_after: { status: "EXPOSED", recallLevel: 0 },
  });
  ctx.emitResponseSent({
    http_status: 200,
    app_error_code: null,
    output_summary: "empty answer handled without LLM (llm_call_count=0)",
    fallback_used_flag: false,
  });
  ctx.finalize(200, null);
}

function buildRetrievalMiss(): void {
  const ctx = new TraceContext("trc_m2e_retrieval_miss", "/api/learn/card");
  ctx.emitRequestReceived({
    input_summary: "learn card: term='xyzzy'",
    method: "POST",
  });
  // 检索 miss：query_normalized 无命中，ids=[]（Case 035 真实行为）
  ctx.emitRetrievalExecuted({
    query_raw: "xyzzy",
    query_normalized: "xyzzy",
    knowledge_object_ids: [],
    knowledge_injected_count: 0,
    knowledge_miss_flag: true,
    conflict_detected: false,
    conflict_resolution: "capability_missing",
  });
  ctx.emitStateRead({
    entity: "user_item_state",
    keys: { userId: "u1", itemId: "item-xyzzy" },
    snapshot_summary: "not learned yet",
    state_not_found: true,
  });
  // miss 不阻塞：LLM 继续生成（Case 024 真实行为）
  ctx.emitLlmAttempt({
    attempt_purpose: "primary",
    provider: "mock",
    model_name: "mock-model",
    tier: "fast",
    prompt_key: "WordCard",
    prompt_version: "v1",
    token_usage: { prompt: 200, completion: 150, total: 350 },
    latency_ms: 260,
    raw_output: '{"term":"xyzzy","definition":"LLM generated, no knowledge hit"}',
    raw_output_truncated: false,
    raw_output_sha256: "m2e-333",
  });
  ctx.emitValidationResult({ validator: "zod:WordCard", outcome: "pass", repair_attempts: 0 });
  ctx.emitResponseSent({
    http_status: 200,
    app_error_code: null,
    output_summary: "card generated via LLM (knowledge miss)",
    fallback_used_flag: false,
  });
  ctx.finalize(200, null);
}

// =============================================================
// Hydration（幂等：已存在则跳过）
// =============================================================

export async function ensureDebugFixtures(): Promise<DebugFixtureMeta[]> {
  if (!traceStore.getTrace("trc_m2a_normal")) buildNormal();
  if (!traceStore.getTrace("trc_m2b_fallback")) buildFallback();
  if (!traceStore.getTrace("trc_m2c_replay_1") || !traceStore.getTrace("trc_m2c_replay_2")) {
    await buildIdempotentReplay();
  }
  if (!traceStore.getTrace("trc_m2d_empty")) buildEmptyAnswerShortCircuit();
  if (!traceStore.getTrace("trc_m2e_retrieval_miss")) buildRetrievalMiss();
  return DEBUG_FIXTURES;
}
