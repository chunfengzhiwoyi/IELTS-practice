# ELS Eval — EVAL-RUN-M3-02 Summary（独立评估：BC-026 / BC-033 修复验证）

> 独立 Eval Agent 运行。产品 checkpoint `55806ba` 的集成验证（typecheck/build/BC regression/smoke）来自 Builder/Integration 侧，
> **本报告只以独立 Eval 真实运行结果为准，未把 Integration Handoff 当作 Eval 判定**。
> Eval 运行：`m3-20260910-070726`；完整 39 Case Registry 全量执行（未只跑 026/033）。
> worktree：`D:\Codex\IELTS-eval-m3-run-02`（branch `eval/m3-run-02`）。

## 1. 隔离（§1）

| 项 | 值 |
|---|---|
| PRODUCT_CHECKPOINT_COMMIT | `55806ba815579bbc4d1aabc80d3ba9be8f5b25c2` |
| EVAL_SYSTEM_BASE | `f0ac513` |
| EVAL_SYSTEM_COMMIT（worktree 中 Eval System 快照） | `f0ac513`（经 `git checkout f0ac513 -- tests/eval docs/eval scripts/eval` 导入，与产品提交分离） |
| branch / worktree | `eval/m3-run-02` / `D:\Codex\IELTS-eval-m3-run-02` |
| 产品树 | `git diff 55806ba -- app components lib supabase` 为空（Eval 执行未产生产品代码修改） |

## 2. 全量运行结果（§2/§3）

| 指标 | 值 |
|---|---|
| TOTAL_GOLD_CASES | 39 |
| REGISTERED | 39/39 |
| AUTO_ADJUDICATED（PASS+FAIL） | 23 |
| PASS | **23** |
| FAIL | **0** |
| MANUAL_REVIEW | 10 |
| UNVERIFIED | 3 |
| BLOCKED | 3 |
| NOT_RUN | 0 |
| AUTO_ADJUDICATED_PASS_RATE（= PASS/(PASS+FAIL)） | **100%**（23/23） |

> 命名纪律：输出为 `AUTO_ADJUDICATED_PASS_RATE`，**不**称为「39 Case Overall Pass Rate」（后者的分母是 39，本运行未把未执行 Case 计入任何通过率）。

状态分布：PASS=001,002,003,004,005,007,008,009,011,014,015,021,024,**026**,027,028,029,031,032,**033**,036,037,038；
MANUAL_REVIEW=006,010,016,017,018,019,020,022,023,030；UNVERIFIED=012,025,035；BLOCKED=013,034,039。

## 3. Case 026（§4）

| 行 | 结果 | 实测 |
|---|---|---|
| r-conflict-detected | **PASS** | conflictDetected=true, resolutionTracked=true（`conflict_resolution=dual_source_with_conflict_note`） |
| r-no-contradiction | **PASS** | 双源并陈差异提示存在（`[冲突提示] …不可同时遵循，已并陈且不自动取舍`），非静默并列 |
| r-fixture-hit | **PASS** | fx-register-conflict-a/b 均被检索命中（provenance=fake-fixture，Gold 许可） |

- 无 Frozen Gold 禁止的伪优先级：产品冲突处理"不自动取舍"，未建立硬优先级。
- Frozen Gold 断言决定 PASS（非 trace 诊断决定）；trace 仅作 evidence。

## 4. Case 033（§5）

| 行 | 结果 | 实测 |
|---|---|---|
| r-error-code | **PASS** | API `error.kind=MODEL_SCHEMA_MISMATCH`（structured=true）；LLM 层 llm.attempt ×2 亦为 MODEL_SCHEMA_MISMATCH |
| r-readable | **PASS** | message 可读（"无法为「galvanize」生成词卡: Schema 校验失败: …"），无静默部分结果 |
| r-no-switch | **PASS** | fallback.triggered=0（无 provider 切换），repairAttempts=1 |

- 期望语义达成：LLM layer / API / response.sent 三层均为 MODEL_SCHEMA_MISMATCH。
- Safety patch（e1464c8）回归证据（不属于 Gold 核心通过条件，未因安全测试通过而自动判 PASS）：未知 LlmError(MODEL_ERROR) 的 raw message 由公共安全文案「模型服务暂时不可用，请稍后重试」替代，不外泄给 API；MODEL_SCHEMA_MISMATCH 等已分类错误保留可读 message。

## 5. 组合回归（§6）

同一产品 checkpoint 中 026 检索路径与 033 schema 判定可共存，trace 事件链：
`request.received → retrieval.executed → llm.attempt → validation.result → llm.attempt → validation.result → response.sent`（retrieval.executed 含 conflict_detected/conflict_resolution 字段）。

## 6. 既有 PASS 回归（§7）

| Case | M3-02 状态 | 关键断言 |
|---|---|---|
| 008 | PASS | punctuation 确定性短路（8/8） |
| 009 | PASS | — |
| 011 | PASS | — |
| 032 | PASS | — |
| 037 | PASS | duplicate replay 不二次推进（5/5） |
| 038 | PASS | Server Repository SSOT（4/4） |

**NEW_REGRESSIONS = 0**（无 PASS→FAIL）。

## 7. 非 PASS Case（§8/§9/§10）

- 010/022/012/025/035 等 MANUAL/UNVERIFIED 保持原状态语义（能力未变化，不强行变绿）。
- 7 个 B 级 packet 仍存在并可生成（docs/eval/manual-review/），本轮未人工终审 → 继续 MANUAL_REVIEW（Eval Agent 不冒充 human reviewer）。
- C 级 013/034/039：special-tool 未实现 → 保持 BLOCKED（不伪造执行）。

## 8. Bad Case Registry 更新（§11）

- `BC-M3-001`（026）：TRIAGED → **FIXED_PENDING_REGRESSION**（原始 FAIL 证据、run m3-20260909-142124、fix 48e16c2、integration checkpoint 55806ba、本轮回归 run m3-20260910-070726 全部保留）。
- `BC-M3-002`（033）：TRIAGED → **FIXED_PENDING_REGRESSION**（fix f5e4891 + e1464c8，同上保留）。
- **未写 VERIFIED_CLOSED**：Frozen 生命周期要求连续多 run 回归稳定后方可；单次修复后 Eval PASS 只到 FIXED_PENDING_REGRESSION。

## 9. 验证（§14）

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 error |
| 完整 M3 Eval suite（vitest） | 44/44 全过（含 39 Case registry integrity + 10 Case 回归断言） |
| 39 Case registry integrity | 39/39 注册、无重复 |
| 历史 10 Case 回归 checks | 全过（008/009/011/032/037/038 PASS、010/022 MR、012/035 UNVERIFIED，与 M3-P1 一致） |
| Bad Case Registry schema | JSON 有效，15-field + lifecycle 完整 |

## 10. 结论

026 与 033 均由 FAIL 转 PASS，其余 37 Case 状态零漂移（含 008/037/038 重点回归），NEW_REGRESSION=0；
AUTO_ADJUDICATED_PASS_RATE=100%（23/23，未执行 Case 不计入分母）。

---

## AGENT_HANDOFF

```
TASK_ID:                   EVAL-RUN-M3-02
STATUS:                    COMPLETE（独立 Eval 全量执行；026/033 已转 PASS；无产品代码修改；未开始产品修复）
PRODUCT_CHECKPOINT_COMMIT: 55806ba815579bbc4d1aabc80d3ba9be8f5b25c2
EVAL_SYSTEM_BASE:          f0ac513
EVAL_SYSTEM_COMMIT:        f0ac513（worktree 导入快照，与产品提交分离）
RUN_ID:                    m3-20260910-070726
TOTAL_GOLD_CASES:          39
REGISTERED:                39
AUTO_ADJUDICATED:          23
PASS:                      23
FAIL:                      0
MANUAL_REVIEW:             10
UNVERIFIED:                3
BLOCKED:                   3
NOT_RUN:                   0
AUTO_ADJUDICATED_PASS_RATE: 100% (23/23；分母=已执行 PASS+FAIL，非 39)
CASE_026:                  PASS（r-conflict-detected / r-no-contradiction / r-fixture-hit 全过）
CASE_033:                  PASS（r-error-code / r-readable / r-no-switch 全过）
CASE_008:                  PASS（8/8，punctuation 短路无漂移）
CASE_037:                  PASS（5/5，duplicate replay 不二次推进）
CASE_038:                  PASS（4/4，Server Repository SSOT）
FIXED_SINCE_M3_P1:         026, 033
NEW_REGRESSIONS:           0
CURRENT_PRODUCT_BAD_CASES: 0（BC-M3-001/BC-M3-002 已转 FIXED_PENDING_REGRESSION，未 VERIFIED_CLOSED）
BAD_CASE_026_LIFECYCLE:    FIXED_PENDING_REGRESSION（fix=48e16c2，regression=m3-20260910-070726；待多 run 稳定）
BAD_CASE_033_LIFECYCLE:    FIXED_PENDING_REGRESSION（fix=f5e4891+e1464c8，regression=m3-20260910-070726；待多 run 稳定）
RUNNER_PATCHES:            无（Eval System 与 55806ba 产品接口直接兼容，零 runner 修改；Frozen Gold 语义未变）
PRODUCT_CODE_MODIFIED:     NO（git diff 55806ba -- app components lib supabase 为空）
TYPECHECK:                 PASS（0 error）
EVAL_SUITE:                PASS（44/44）
REGISTRY_VALIDATION:       PASS（39/39，无重复；bad-case-registry.json schema 有效）
NEXT_RECOMMENDATION:
  1. 下一轮独立 Eval 运行（EVAL-RUN-M3-03）复核 026/033 连续稳定性（≥2 轮无漂移 → 可升 VERIFIED_CLOSED），
     并重点盯 022/024/025（retrieval 家族）与 021/031/032（fallback 家族）与 026/033 修复的互扰。
  2. C 级 3 个 special-tool（replay_job / E2E+STT / trace 回溯验收）落地后替换 placeholder，
     解锁 013/034/039 的 BLOCKED。
  3. 7 个 B 级 manual packet 人工终审（decision field 待填）。
禁止开始产品修复。禁止开始下一阶段开发。
```
