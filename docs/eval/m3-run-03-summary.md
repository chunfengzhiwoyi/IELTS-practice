# EVAL-RUN-M3-03 Summary — Independent Evaluation

**TASK_ID**: EVAL-RUN-M3-03（INDEPENDENT_EVALUATION）
**日期**: 2026-09-10
**Product Checkpoint**: `f117d85fe2916ecd8dca568aa1d75c536d3c4d4b`（55806ba + BC-034 audio_metadata observability，source `138839d`）
**Eval System**: base `f0ac513` → M3-02 `760afde` → M3-P3 `f1a4996` / `d3e4edf`
**Frozen Gold**: `ELS_EVALUATION_V1_1`（未修改）
**Final Run**: `m3-20260910-085726`（44 tests PASS，Duration 23.2s）

---

## 1. Isolation

- branch: `eval/m3-run-03`；worktree: `D:\Codex\IELTS-eval-m3-run-03`
- 产品代码来自 `f117d85`；Eval System 导入自 Eval-only commit `d3e4edf`
- `PRODUCT_CHECKPOINT_COMMIT = f117d85…`；`EVAL_SYSTEM_BASE = f0ac513`；`EVAL_SYSTEM_COMMIT = d3e4edf`（本轮 runner 调整未再生成新 Eval commit，034 adapter 断言扩展属 Eval-side）

## 2. Full 39-Case Run（真实执行，不继承旧状态）

| 指标 | 值 |
|---|---|
| TOTAL_GOLD_CASES | 39 |
| REGISTERED | 39 |
| AUTO_ADJUDICATED（PASS + FAIL） | 26 |
| PASS | 26 |
| FAIL | 0 |
| MANUAL_REVIEW | 10 |
| UNVERIFIED | 3（012 / 025 / 035） |
| BLOCKED | 0 |
| NOT_RUN | 0 |
| AUTO_ADJUDICATED_PASS_RATE（= PASS/(PASS+FAIL)） | 26/26 = 100% |

## 3. Case 034 — Primary Target：UNVERIFIED → **PASS**

BC-034（f117d85）补齐了 M3-P3 留下的唯一 uncovered（错误日志缺 audio_metadata）。本轮 8/8 行全 PASS、零 uncovered：

| Row | 断言 | Actual |
|---|---|---|
| r1-no-key-503 | 无 Key → 503 CONFIG_ERROR | `{status:503, kind:"CONFIG_ERROR"}` |
| r2-upstream-5xx-502 | 上游 5xx → 502 MODEL_ERROR + ui_fallback | `{status:502, kind:"MODEL_ERROR", ui_fallback_offered:true}` |
| r2-structured-error | 结构化、不冒充口语分析错误 | `{structured:true, noAnalysisFields:true}` |
| r3-e2e-text-fallback | **真实浏览器**回退路径可达 | `{textareaReachable:true, voiceRecorderVisible:true, fallbackAfterError:true}` |
| r4-error-log-audio-metadata-503 | 错误日志 trace_id + 5 字段 audio_metadata + request.received 元数据 | 全 true（content_type/size_bytes/has_filename/extension/empty_audio_flag） |
| r4b-error-log-audio-metadata-502 | 同上（502 路径） | 全 true |
| r5-required-trace-fields | trace_id / audio_metadata / llm_error_code / http_status / ui_fallback_offered | 全 true |
| r6-privacy-no-leak | 无 audio bytes / base64 / 完整 filename / Authorization / API Key | 全 true |

**Must-not 复核**：无 500 未分类（503/502 明确分类）✓；已录音频有回退（E2E 实测）✓；STT failure 未冒充 speaking analysis failure（noAnalysisFields）✓。

**034 Privacy Regression（§5）**：trace 与错误日志仅含摘要字段（content_type/size_bytes/has_filename/extension/empty_audio_flag）；序列化全文实测无 audio bytes、无 base64、无完整 filename（`recording.webm` 不存在）、无 Authorization、无 API Key（`eval-test-key` 不存在）✓。**修复有效**（非仅"存在 audio_metadata 但泄漏"）。

## 4. BC-026 / BC-033 — Regression 3/3 → **VERIFIED_CLOSED**

| | Regression 1 | Regression 2 | Regression 3（本轮） | 生命周期 |
|---|---|---|---|---|
| ELS-EVAL-026 | PASS（070726） | PASS（081624） | PASS（085726，3/3 行） | **VERIFIED_CLOSED** |
| ELS-EVAL-033 | PASS（070726） | PASS（081624） | PASS（085726，3/3 行） | **VERIFIED_CLOSED** |

- 026 本轮真实执行：conflict detection ✓、conflict_resolution=dual_source_with_conflict_note ✓、无伪优先级 ✓
- 033 本轮真实验证：MODEL_SCHEMA_MISMATCH 在 LLM layer / API / response.sent 三层一致 ✓、fallback.triggered=0 ✓、unknown MODEL_ERROR raw message 不泄漏 ✓
- 生命周期条件（连续 ≥3 轮独立 run 无漂移）满足 → 由 FIXED_PENDING_REGRESSION 升级 VERIFIED_CLOSED。**original FAIL / fix commit / integration checkpoint / 三轮 regression 全部保留，未覆盖失败历史。**

## 5. 防回归（既有稳定 Case）

| Case | 状态 | 说明 |
|---|---|---|
| ELS-EVAL-008 | PASS | punctuation 确定性短路，无漂移 |
| ELS-EVAL-013 | PASS | replay harness 保持 |
| ELS-EVAL-037 | PASS | duplicate replay 不二次推进 |
| ELS-EVAL-038 | PASS | Server Repository SSOT |
| ELS-EVAL-039 | PASS | M1 Gate 保持（M2 Target SKIPPED 证据行不变） |
| ELS-EVAL-009 / 011 / 032 | PASS | 无漂移 |

**NEW_REGRESSIONS = 0**（无此前 PASS → FAIL）。

## 6. Non-PASS Cases（能力未变，不强行变绿）

- MANUAL_REVIEW × 10（006/010/016/017/018/019/020/022/023/030）：B 级 packet 就绪，本轮不人工终审，保持 MANUAL_REVIEW。
- UNVERIFIED × 3（012/025/035）：能力未变化，保持原状态；035 不因 canonical bug 已修复而强行判 PASS（严格按 Frozen Gold）。
- BLOCKED = 0、NOT_RUN = 0。

## 7. Bad Case Registry

- **026 / 033**：`FIXED_PENDING_REGRESSION → VERIFIED_CLOSED`（regression_runs=[070726, 081624, 085726]）。
- **034**：非 Product FAIL → **未建 Bad Case**（不伪造 FAIL lifecycle）；在 historical_evolution_evidence 记录 `CAPABILITY_VERIFIED`（M3-P1 BLOCKED → M3-P3 UNVERIFIED → M3-03 PASS）。
- 008/035/037/038 历史演化证据保留并追加 M3_03 里程碑。

## 8. Product / Eval Separation

- `git diff f117d85 -- app components lib supabase` = **空** → **PRODUCT_CODE_MODIFIED = NO**。
- 本轮 Runner patch：`els-eval-034.eval.ts` 断言扩展（r4/r4b/r5/r6：audio_metadata 错误日志、Required Trace Fields、privacy regression）。**RUNNER_PATCH_REASON**：BC-034 在产品侧补齐 trace contract（`RequestReceivedPayload.audio_metadata` + 错误日志 audio_metadata），Eval adapter 据此按 Frozen Gold 行 3 补全断言；**Frozen Gold 语义未改变**（断言全部来自 spec，无放宽/降级）。

## 9. Verification

| 项 | 结果 |
|---|---|
| tsc --noEmit | PASS |
| Eval Runner 全量 39 Case suite | PASS（44/44 tests；registry 完整性 + 10-Case 回归） |
| special-tool tests（013/034/039） | 013 PASS / 034 PASS / 039 PASS |
| Playwright E2E（034） | 真实运行（fake mic + 503 alert + 文字回退 + 日志/隐私断言） |
| next build | 成功（.next/BUILD_ID 存在） |
| Registry schema validation | PASS（15-field，生命周期合法） |

历史 run 保留：m3-20260909-143153（M3-P1）、m3-20260910-070726（M3-02）、m3-20260910-081624（M3-P3）。本轮 run `m3-20260910-085726` 新增，未覆盖任何旧 run。
