/**
 * M2 Trace Contract — Zod / TypeScript 类型定义
 * ------------------------------------------------------------
 * 基于 docs/v3/m2-observability-contract.md (V2.1, DESIGN_FROZEN)
 *
 * Phase 1 实现的事件类型：
 *   request.received   (INPUT)
 *   llm.attempt        (MODEL)
 *   validation.result  (OUTPUT_VALIDATION)
 *   fallback.triggered (FALLBACK)
 *   response.sent      (UI_PRESENTATION)
 *
 * Failure Layer 严格使用冻结的 13 层 enum，与 ELS_EVALUATION_V1_1 一字不差。
 * trace_id 仅用于 observability，不参与任何业务逻辑（AC-6 Regression Guard）。
 */
import { z } from "zod";

// =============================================================
// 13 层 Failure Layer Enum（冻结，与 ELS_EVALUATION_V1_1 一字不差）
// =============================================================

export const FailureLayerSchema = z.enum([
  "INPUT",
  "ROUTING",
  "STATE_READ",
  "RETRIEVAL",
  "PROMPT",
  "MODEL",
  "OUTPUT_VALIDATION",
  "BUSINESS_RULE",
  "STATE_WRITE",
  "REPORT_AGGREGATION",
  "FALLBACK",
  "UI_PRESENTATION",
  "UNKNOWN",
]);

export type FailureLayer = z.infer<typeof FailureLayerSchema>;

// =============================================================
// Event Type Enum（Phase 1 子集）
// =============================================================

export const TraceEventTypeSchema = z.enum([
  "request.received",
  "routing.decided",
  "state.read",
  "retrieval.executed",
  "llm.attempt",
  "validation.result",
  "fallback.triggered",
  "rule.applied",
  "state.write",
  "report.aggregated",
  "response.sent",
]);

export type TraceEventType = z.infer<typeof TraceEventTypeSchema>;

// =============================================================
// Trace Header（每请求 1 条）
// =============================================================

export const TraceHeaderSchema = z.object({
  trace_id: z.string(),
  route: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  latency_ms: z.number().nullable(),
  http_status: z.number().nullable(),
  app_error_code: z.string().nullable(),
  degradation_flag: z.boolean(),
  event_count: z.number(),
  user_hash: z.string().nullable(),
  client_event_id: z.string().nullable(),
});

export type TraceHeader = z.infer<typeof TraceHeaderSchema>;

// =============================================================
// Trace Event 信封（每请求 N 条）
// =============================================================

export const TraceEventSchema = z.object({
  trace_id: z.string(),
  event_id: z.string(),
  seq: z.number().int(),
  ts: z.string(),
  event_type: TraceEventTypeSchema,
  layer: FailureLayerSchema,
  status: z.enum(["ok", "error", "degraded", "skipped"]),
  duration_ms: z.number().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  payload: z.record(z.unknown()),
});

export type TraceEvent = z.infer<typeof TraceEventSchema>;

// =============================================================
// Payload 类型定义（按事件类型）
// =============================================================

/** request.received payload */
export interface RequestReceivedPayload {
  input_summary: string;
  client_event_id?: string;
  session_id?: string;
  method: string;
  content_length?: number;
}

/** llm.attempt payload */
export interface LlmAttemptPayload {
  attempt_purpose: "primary" | "repair" | "fallback_provider" | "mock_shortcircuit";
  provider: string;
  model_name: string;
  tier: "fast" | "main";
  prompt_key: string;
  prompt_version: string;
  token_usage: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  latency_ms: number;
  raw_output: string;
  raw_output_truncated: boolean;
  raw_output_sha256?: string;
  llm_error_code?: string;
  temperature?: number;
}

/** validation.result payload */
export interface ValidationResultPayload {
  validator: string;
  outcome: "pass" | "fail" | "needs_review";
  zod_validation_result?: {
    success: boolean;
    issues?: string[];
  };
  repair_attempts: number;
  quality_gate_scores?: Record<string, number>;
  quality_warning?: string;
  band_leakage_flag?: boolean;
  judge_confidence?: string;
}

/** fallback.triggered payload */
export interface FallbackTriggeredPayload {
  trigger_error_code: string;
  chain_snapshot: Array<{
    step: string;
    from: string;
    to: string;
    status: "used" | "skipped" | "unavailable";
  }>;
  degradation_flag: boolean;
  to_kind: "provider" | "repair" | "fallback_judge" | "rule_based_analysis" | "null_report_summary";
}

/** response.sent payload */
export interface ResponseSentPayload {
  http_status: number;
  app_error_code: string | null;
  output_summary: string;
  fallback_used_flag: boolean;
  idempotent_replay?: boolean;
}

/** routing.decided payload */
export interface RoutingDecidedPayload {
  intent_decision: string;
  ui_action_type: string;
  persistence_required: boolean;
  disambiguation_needed?: boolean;
  reject_reason?: string;
}

/** state.read payload */
export interface StateReadPayload {
  entity: string;
  keys: Record<string, string>;
  snapshot_summary: string;
  state_not_found?: boolean;
  due_queue?: Array<{ itemId: string; nextReviewAt: string }>;
  total_due?: number;
}

/** retrieval.executed payload */
export interface RetrievalExecutedPayload {
  query_raw: string;
  query_normalized: string;
  knowledge_object_ids: string[];
  knowledge_injected_count: number;
  knowledge_miss_flag: boolean;
  conflict_detected?: boolean;
  conflict_resolution?: string;
  injected_context_snippet?: string;
}

/** rule.applied payload */
export interface RuleAppliedPayload {
  rule_key: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  llm_call_count?: number;
}

/** state.write payload */
export interface StateWritePayload {
  entity: string;
  keys: Record<string, string>;
  event_id?: string;
  client_event_id?: string;
  idempotency_outcome: "inserted" | "duplicate_ignored";
  state_before: Record<string, unknown> | null;
  state_after: Record<string, unknown> | null;
  canonical_state_hash?: string;
  next_review_at_before?: string | null;
  next_review_at_after?: string | null;
  evidence_status_before?: string;
  evidence_status_after?: string;
  observation_persisted_flag?: boolean;
}

/** report.aggregated payload */
export interface ReportAggregatedPayload {
  period: string;
  aggregate_checksum: string;
  insufficient_data_flag: boolean;
  baseline_availability: boolean;
  summary_generated: boolean | null;
  section_render_flags: Record<string, boolean>;
  aggregate_values?: Record<string, number>;
}

// =============================================================
// 完整 Trace（header + events）
// =============================================================

export interface FullTrace {
  header: TraceHeader;
  events: TraceEvent[];
}

// =============================================================
// Event Type → Layer 映射（冻结）
// =============================================================

export const EVENT_TYPE_TO_LAYER: Record<TraceEventType, FailureLayer> = {
  "request.received": "INPUT",
  "routing.decided": "ROUTING",
  "state.read": "STATE_READ",
  "retrieval.executed": "RETRIEVAL",
  "llm.attempt": "MODEL",
  "validation.result": "OUTPUT_VALIDATION",
  "fallback.triggered": "FALLBACK",
  "rule.applied": "BUSINESS_RULE",
  "state.write": "STATE_WRITE",
  "report.aggregated": "REPORT_AGGREGATION",
  "response.sent": "UI_PRESENTATION",
};
