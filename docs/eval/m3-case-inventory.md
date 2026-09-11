# ELS Eval — M3-P1 Case Inventory（39/39 全量清单）

> 依据：Frozen Gold ELS_EVALUATION_V1_1（docs/eval/spec/ELS_EVALUATION_V1_1.json）+ Runner Registry（tests/eval/runner/registry.ts）+ 运行 m3-20260909-142124（docs/eval/runs/）。
> 分级（automation_level）沿用 Frozen Contract，**未重新分类 Gold 语义**：A=AUTO（29）、B=MANUAL/SEMI-AUTO（7）、C=SPECIAL_TOOL（3）。
> 纪律：进入 Registry ≠ 已执行 ≠ PASS。execution_status 取值：PASS / FAIL / MANUAL_REVIEW / UNVERIFIED / BLOCKED / NOT_RUN。
> product_base=43364c3（M2-P3B）；eval_runner_base=7ff7fc1（EVAL-RUN-02）。

## 1. 清单

| CASE_ID | severity | category | automation_level | execution_status | missing_capability | required_trace_fields |
|---|---|---|---|---|---|---|
| ELS-EVAL-001 | S2 | INTENT_ROUTING | A | PASS | - | trace_id, user_id, intent_decision, ui_action_type, prompt_key/version, model_name, llm_raw_output, zod_validation_result, fallback_used_flag, http_status |
| ELS-EVAL-002 | S2 | INTENT_ROUTING | A | PASS | - | trace_id, intent_decision, ui_action_type, fallback_used_flag, persistence_required, http_status |
| ELS-EVAL-003 | S2 | NEW_WORD_LEARNING | A | PASS | - | trace_id, client_event_id（若生成）, canonical_form, knowledge_object_ids, prompt_version, model_name, llm_raw_output, zod_validation_result, state_before/after, event_count, http_status |
| ELS-EVAL-004 | S2 | NEW_WORD_LEARNING | A | PASS | - | trace_id, item_id/canonical_form, state_before/after, already_learned_flag, event_type, http_status |
| ELS-EVAL-005 | S2 | ANSWER_JUDGEMENT | A | PASS | - | trace_id, client_event_id, correctness_judged(api_result), event.correctness, schedule_quality, state_after, next_review_at_after, model_name, llm_raw_output, fallback_chain |
| ELS-EVAL-006 | S2 | ANSWER_JUDGEMENT | B | MANUAL_REVIEW | - | trace_id, correctness_judged, user_answer, accepted_answers, answer_keywords, model_name, confidence, llm_raw_output |
| ELS-EVAL-007 | S2 | ANSWER_JUDGEMENT | A | PASS | - | trace_id, used_hint, correctness_judged, event.correctness, schedule_quality, next_review_at_before/after, recall_level_delta, state_after |
| ELS-EVAL-008 | S3 | ANSWER_JUDGEMENT | A | PASS | - | trace_id, client_event_id, correctness_judged, llm_call_count=0, state_after |
| ELS-EVAL-009 | S2 | REVIEW_SCHEDULING | A | PASS | - | trace_id, user_id, next_review_at 集合（读前快照）, tasks 顺序, total_due, http_status |
| ELS-EVAL-010 | S2 | REVIEW_SCHEDULING | A | MANUAL_REVIEW | - | trace_id, next_review_at 集合, tasks, total_due |
| ELS-EVAL-011 | S2 | REVIEW_SCHEDULING | A | PASS | - | trace_id, client_event_id, correctness_judged, event.correctness, schedule_quality, state_before/after, next_review_at_before/after, recall_level_delta, consecutive_correct |
| ELS-EVAL-012 | S2 | REVIEW_SCHEDULING | A | UNVERIFIED | - | trace_id×3, client_event_id×3, next_review_at 序列, state_after 终态, event_count |
| ELS-EVAL-013 | S1 | LEARNING_STATE_MEMORY | C | BLOCKED | replay_job（离线重放器：从事件流重算状态并与 checksum 比对） | event 全集, state_before/after 全量, client_event_id 集合, replay_checksum |
| ELS-EVAL-014 | S2 | LEARNING_STATE_MEMORY | A | PASS | - | trace_id, state 快照, due 队列, report 聚合值, aggregate_checksum |
| ELS-EVAL-015 | S2 | SPEAKING_ANALYSIS | A | PASS | - | trace_id, session_id, part, answer, analysis_path(llm|rule), quality_gate_scores, main_issue, model_name |
| ELS-EVAL-016 | S2 | SPEAKING_ANALYSIS | B | MANUAL_REVIEW | - | trace_id, quality_gate_scores, quality_warning, prioritized_suggestions, analysis_path |
| ELS-EVAL-017 | S3 | SPEAKING_ANALYSIS | B | MANUAL_REVIEW | - | trace_id, ielts_analysis, main_issue, llm_raw_output |
| ELS-EVAL-018 | S2 | SPEAKING_ANALYSIS | B | MANUAL_REVIEW | - | trace_id, session_id, first/second_answer, ielts_analysis×2, ability_context_injected, evidence_status_before/after, evaluation_result |
| ELS-EVAL-019 | S1 | SPEAKING_ANALYSIS | B | MANUAL_REVIEW | - | trace_id, quality_gate_scores, evidence_items, analysis_path, llm_raw_output, quality_warning |
| ELS-EVAL-020 | S1 | SPEAKING_ANALYSIS | A | MANUAL_REVIEW | - | trace_id, quality_gate_scores, band_leakage_flag, analysis_path, final_response_redacted |
| ELS-EVAL-021 | S2 | SPEAKING_ANALYSIS | A | PASS | - | trace_id, llm_error_code, fallback_chain, degradation_flag, analysis_path, http_status |
| ELS-EVAL-022 | S2 | RETRIEVAL_KNOWLEDGE | A | MANUAL_REVIEW | - | trace_id, retrieval_query, knowledge_object_ids, knowledge_injected_count, prompt_version, generation_meta |
| ELS-EVAL-023 | S3 | RETRIEVAL_KNOWLEDGE | B | MANUAL_REVIEW | - | retrieval_query, knowledge_object_ids, knowledge_miss_flag, prompt_version, generation_meta |
| ELS-EVAL-024 | S3 | RETRIEVAL_KNOWLEDGE | A | PASS | - | trace_id, retrieval_query, knowledge_object_ids=[], http_status |
| ELS-EVAL-025 | S2 | RETRIEVAL_KNOWLEDGE | A | UNVERIFIED | - | retrieval_query, knowledge_object_ids, injected_context_snippet, generation_meta, llm_raw_output |
| ELS-EVAL-026 | S2 | RETRIEVAL_KNOWLEDGE | A | FAIL | - | retrieval_query, knowledge_object_ids, conflict_detected, conflict_resolution, generation_meta, llm_raw_output |
| ELS-EVAL-027 | S2 | LEARNING_REPORT | A | PASS | - | trace_id, period, aggregate_checksum, summary_generated, llm_raw_output, recommendations |
| ELS-EVAL-028 | S2 | LEARNING_REPORT | A | PASS | - | trace_id, aggregate_checksum, insufficient_data_flag, summary_generated=null, ui_render_path |
| ELS-EVAL-029 | S2 | LEARNING_REPORT | A | PASS | - | trace_id, period, speaking_observations, review_stats, section_render_flags |
| ELS-EVAL-030 | S1 | LEARNING_REPORT | B | MANUAL_REVIEW | - | trace_id, baseline_availability, compare_section_data, llm_raw_output, summary_generated, ui_copy_strings |
| ELS-EVAL-031 | S2 | FALLBACK_FAILURE | A | PASS | - | trace_id, llm_error_code, fallback_chain, degradation_flag, model_name×2, http_status, latency_ms |
| ELS-EVAL-032 | S3 | FALLBACK_FAILURE | A | PASS | - | trace_id, llm_raw_output(原始), repair_attempts, zod_validation_result, llm_error_code |
| ELS-EVAL-033 | S3 | FALLBACK_FAILURE | A | FAIL | - | trace_id, llm_raw_output, repair_attempts, zod_validation_result, llm_error_code, http_status |
| ELS-EVAL-034 | S3 | FALLBACK_FAILURE | C | BLOCKED | E2E browser（前端文字输入回退路径可达性）+ 真实 Whisper/STT 管线 | trace_id, audio_metadata, llm_error_code, http_status, ui_fallback_offered |
| ELS-EVAL-035 | S3 | FALLBACK_FAILURE | A | UNVERIFIED | - | trace_id, retrieval_query(normalized), knowledge_object_ids=[], canonical_form, knowledge_miss_flag |
| ELS-EVAL-036 | S2 | FALLBACK_FAILURE | A | PASS | - | trace_id, llm_error_code, fallback_chain, degradation_flag, correctness_judged, answer_keywords |
| ELS-EVAL-037 | S1 | CROSS_MODULE_STATE | A | PASS | - | trace_id×2, client_event_id, event_count, state_before/after, next_review_at_before/after, response_body×2 |
| ELS-EVAL-038 | S1 | CROSS_MODULE_STATE | A | PASS | - | trace_id, state_after, report_aggregate_checksum, local_snapshot, refresh_stability, server_state_checksum |
| ELS-EVAL-039 | S2 | CROSS_MODULE_STATE | C | BLOCKED | special trace/context acceptance tool（memory write ↔ trace_id 回溯验收） | trace_id, session_id, dimension, evidence_status_before/after, ability_context_injected, observation_persisted_flag, source_id |



## 2. 汇总

| 维度 | 数量 |
|---|---|
| TOTAL_GOLD_CASES | 39 |
| REGISTERED（进入 Registry） | 39/39 |
| A=AUTO | 29 |
| B=MANUAL/SEMI-AUTO | 7（006, 016, 017, 018, 019, 023, 030） |
| C=SPECIAL_TOOL | 3（013, 034, 039） |

## 3. 执行纪律说明

- **进入 Registry ≠ 已执行 ≠ PASS**：全部 39 条均注册（registry.ts，含 missing_capability 标注），但只有 23 个 case 被真实执行（PASS+FAIL）。
- 未执行或被能力边界阻断的 case 如实标注为 BLOCKED / UNVERIFIED / MANUAL_REVIEW，**不允许**折算为 PASS。
- A 级全部实现 deterministic adapter（29 个，复用 runner harness / scripted providers / M2 trace 读取，未复制测试框架）。
- B 级建立标准 Manual Review Packet（7 个，docs/eval/manual-review/），确定性部分自动执行，人工判定字段留待复核。
- C 级仅建立 special-tool requirement + input/output contract + adapter placeholder（3 个，docs/eval/special-tool/），不伪造执行。

## 4. severity 标注口径

- severity 取自 Frozen Gold 原文（含 S1 定级理由括号说明），本清单仅保留主干（如 S1（[FIX-04] …） → S1），完整原文见 spec 文件。
