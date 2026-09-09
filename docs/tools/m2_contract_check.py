"""M2 Contract 充分性校验：39 Case 的 required_trace_fields 是否全部落在 Contract 字段集内。"""
import json
import re

BASE = r"D:\Codex\IELTS-practice\docs"
d = json.load(open(BASE + r"\ELS_EVALUATION_V1_1.json", encoding="utf-8"))
doc = open(BASE + r"\v3\m2-observability-contract.md", encoding="utf-8").read().lower()

CONTRACT = set("""trace_id request_id user_hash route started_at ended_at latency_ms http_status
app_error_code degradation_flag event_count suspect_layers event_id parent_event_id seq ts
event_type layer duration_ms status error payload input_summary client_event_id session_id
is_retry_hint intent_decision ui_action_type disambiguation_needed reject_reason
persistence_required entity keys snapshot_summary due_queue state_not_found total_due
query_raw query_normalized knowledge_object_ids knowledge_injected_count knowledge_miss_flag
conflict_detected conflict_resolution injected_context_snippet attempt_purpose provider
model_name tier prompt_key prompt_version temperature token_usage raw_output model_version
llm_error_code validator outcome zod_validation_result repair_attempts quality_gate_scores
quality_warning band_leakage_flag final_response_redacted judge_confidence trigger_error_code
chain_snapshot to_kind rule_key inputs outputs llm_call_count idempotency_outcome
state_before state_after next_review_at_before next_review_at_after replay_checksum
evidence_status_before evidence_status_after observation_persisted_flag source_id dimension
evaluation_result output_summary fallback_used_flag ui_fallback_offered period
aggregate_checksum section_render_flags insufficient_data_flag baseline_availability
summary_generated aggregate_values user_answer accepted_answers answer_keywords used_hint
correctness_judged schedule_quality recall_level_delta consecutive_correct already_learned_flag
canonical_form audio_metadata analysis_path part main_issue evidence_items ielts_analysis
ability_context_injected generation_meta prioritized_suggestions recommendations
review_stats speaking_observations ui_copy_strings ui_render_path compare_section_data
local_snapshot refresh_stability server_state_checksum clock_snapshot first_answer
second_answer report_aggregate_checksum user_id item_id""".split())

# 别名归位（与 v3/m2-observability-contract.md §1.7 别名归位表一致）
ALIAS = {
    "client_event_id_集合": "client_event_id",
    "due_队列": "due_queue",
    "event_全集": "event_count",
    "event.correctness": "correctness_judged",
    "fallback_chain": "chain_snapshot",
    "first/second_answer": "user_answer",
    "item_id/canonical_form": "canonical_form",
    "next_review_at_序列": "next_review_at_after",
    "next_review_at_集合": "next_review_at_after",
    "next_review_at_集合（读前快照）": "due_queue",
    "prompt_key/version": "prompt_key",
    "report_聚合值": "aggregate_values",
    "response_body": "output_summary",
    "retrieval_query": "query_raw",
    "retrieval_query(normalized)": "query_normalized",
    "state_快照": "snapshot_summary",
    "state_after_终态": "state_after",
    "state_before/after_全量": "state_before",
    "tasks": "due_queue",
    "tasks_顺序": "due_queue",
}


def field_variants(f):
    f = f.strip()
    v = {f, f.replace(" ", "_"), f.replace(" ", "")}
    for base in (f, re.sub(r"[（(].*?[)）]", "", f).strip()):
        b2 = re.sub(r"[×=].*$", "", base).strip()
        v.add(base)
        v.add(base.replace(" ", "_"))
        v.add(b2)
        v.add(b2.replace(" ", "_"))
    return {x.lower() for x in v if x}


uncovered = {}
total = 0
for c in d["cases"]:
    for f in c["required_trace_fields"]:
        total += 1
        vs = field_variants(f)
        # 先查别名表（含别名表的变体形式）
        alias_hit = False
        for v in vs:
            for a_key, a_val in ALIAS.items():
                if v == a_key or v.replace("（", "(").split("(")[0] == a_key:
                    if a_val in CONTRACT:
                        alias_hit = True
        if not (alias_hit or any(v in CONTRACT for v in vs) or any(v in doc for v in vs)):
            uncovered.setdefault(f, []).append(c["case_id"])

print(f"总条目(含跨 Case 重复): {total}")
print(f"去重后未覆盖字段数: {len(uncovered)}")
for f, cids in sorted(uncovered.items()):
    print(f"  [{f}]  <- {','.join(cids)}")
print("RESULT:", "PASS" if not uncovered else "GAP_FOUND")
