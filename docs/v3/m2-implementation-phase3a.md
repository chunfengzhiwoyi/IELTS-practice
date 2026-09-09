# M2 Implementation Phase 3A — Minimal Debug Console

| | |
|---|---|
| **Spec** | `M2_IMPLEMENTATION_PHASE3A` |
| **前置** | `M1_CODE_STATUS: PASS`；`M2_OBSERVABILITY_CONTRACT_V2_2: FROZEN`；`M2_PHASE1_CODE_STATUS: PASS`；`M2_PHASE2_CODE_STATUS: PASS` |
| **日期** | 2026-09-09 |
| **范围** | 最小可用 Debug Console：trace_id 查询 → Trace Summary / Event Timeline / Failure Layer Diagnosis / Relevant Correlations（最小版）；5 个 Trace Capability Fixture；人工验收流程 |
| **禁止（遵守）** | 修改学习产品业务规则；修 Case 008 / Case 035；RAG / Memory / Agent Upgrade；做漂亮 Dashboard；APM / 实时监控；大规模 UI polish |

---

## 1. 目标

输入 `trace_id`，AI PM 在 **2 分钟内**知道问题最可能在哪一层（M2 Contract §0 Goal / §4）。

实现边界（与 Contract §6.3 对齐）：Debug Console **minimal implementation**（AC-7 的按 trace_id 查询 + 五区信息架构的最小可用版）。

**不声称**：`M2_STATUS=PASS`（Supabase persistence / AC final gate 尚未完成，见 §8）。

---

## 2. 路由与数据源

| 项 | 值 |
|---|---|
| **DEBUG_ROUTE** | `GET /debug/traces`（页面，内部，不在学习用户导航） |
| **主查询** | `GET /api/debug/traces/[traceId]`（**现有 Phase 1 端点，未复制 Trace Store**，console 客户端直接调用） |
| **列表/关联** | `GET /api/debug/traces?client_event_id=&user_hash=&prompt_version=&limit=`（Phase 3A 新增，只读查询 Memory Trace Store） |
| **fixtures** | `GET /api/debug/traces/fixtures`（幂等注入 5 场景 fixture） |

页面为 Server Component（服务端渲染时幂等注入 fixtures，与 API 同进程共享 Memory Trace Store）+ 客户端交互组件（`components/debug/trace-console.tsx`）。

---

## 3. 页面信息架构（§4.2 最小可用版）

### A. Trace Summary
`route / http_status / app_error_code / latency_ms / degradation_flag / started_at / event_count` + `client_event_id / user_hash`（10 秒速览）。

### B. Event Timeline
每事件一行：`seq / event_type / layer / status / duration_ms / 关键 payload 摘要`；行点击展开完整**脱敏** payload（存储侧已按 §3 截断/脱敏策略，UI 不再额外处理）。
状态明显区分：`ok`（绿）/ `degraded`（琥珀）/ `error`（红）/ `skipped`（灰）。

**Special Diagnostic Visibility**（§6 要求，时间线内联展示）：
- `rule.applied` → rule_key + llm_call_count
- `state.write` → idempotency_outcome + client_event_id
- `retrieval.executed` → query_raw / query_normalized / ids 数 / miss_flag
- `llm.attempt` → attempt_purpose / provider / model_name / prompt_key / prompt_version / error_code
- `validation.result` → validator / outcome / repair_attempts / quality_gate_scores / band_leakage_flag
- `fallback.triggered` → trigger_error_code / to_kind / chain_snapshot

### C. Failure Layer Diagnosis
12 项瀑布检查逐项显示（✅ 通过 / ❌ 命中 / ⚠️ 证据缺失 / – 不适用），输出：
```
PRIMARY_SUSPECT_LAYER
EVIDENCE（字段级证据 + 事件 seq 锚点）
```

### D. Relevant Correlations（最小版）
- 同 `client_event_id` 的关联 trace（Case 037 双请求对比）
- 同 `user_hash` 的近期 trace
- `prompt_version` 分布（store 内全部 trace：total / ok / degraded / error）

---

## 4. DIAGNOSIS_LOGIC（§4.4 最小确定性实现）

实现文件：`lib/debug/console/diagnosis.ts`（纯函数，无 LLM，服务端/客户端共用）。

**判层主键 = 事件顺序**（契约 §4.2 步骤 2「扫瀑布找第一个异常事件」）：12 项检查全部评估后，
Primary Suspect Layer = 命中检查中**证据事件 seq 最小**的层；同 seq 多检查命中按 checkId 小者优先（与 §4.4 表序一致）。
无命中 → `UNKNOWN`。

| # | Layer | 证据谓词（最小确定性解释） |
|---|---|---|
| 1 | INPUT | request.received status=error 或 input_summary 空/缺失 |
| 2 | ROUTING | reject_reason 存在 / disambiguation_needed=true / status=error（intent ≠ 期望不可得，代理见下） |
| 3 | STATE_READ | state_not_found=true / status=error |
| 4 | RETRIEVAL | knowledge_miss_flag=true / conflict_detected=true / status=error |
| 5 | PROMPT | trace 内 ≥2 次同 (prompt_key, prompt_version) 的 llm.attempt 全部 error |
| 6 | MODEL | llm.attempt status=error（语义错无法机械判定，见下） |
| 7 | OUTPUT_VALIDATION | validation.result outcome=fail 或 needs_review |
| 8 | BUSINESS_RULE | rule.applied status=error |
| 9 | STATE_WRITE | state.write status=error（**duplicate_ignored 不算异常**——幂等重放正确行为，Case 037） |
| 10 | REPORT_AGGREGATION | report.aggregated status=error |
| 11 | FALLBACK | fallback.triggered status=error（正常触发的降级链不算异常） |
| 12 | UI_PRESENTATION | response.sent status=error 或 http_status≥400（含埋点缺口提示） |

**文档化的最小代理**（超出契约字面）：
- 检查 2/3 的「与期望不符」无法从单条 trace 获得期望值 → 用机器可观测代理（reject/disambiguation、not_found）；
- 检查 5 的「系统性 fail」跨 trace 聚合在 Console D 区呈现，判层内实现为 trace 内聚合；
- 检查 6 的「语义错」需人工看 raw → 最小实现取 status=error；
- 检查 8/10/11 的 outputs-vs-inputs 不符 / checksum 重算 / 链误切需外部规格或重放工具 → 只取 status=error；
- 端点矩阵（§1.3）用于区分「结构性缺席（不适用）」与「期望节点缺席（⚠️ 埋点缺口）」；未知路由保守视为期望。

**禁止 LLM 猜 Root Cause**：输出仅为证据收敛，无模型调用。

---

## 5. Fixtures（5 场景，真实行为）

| Fixture | trace_id | 展示内容 |
|---|---|---|
| A. Normal request | `trc_m2a_normal` | review/submit 正常链路（LLM→validation→rule→state.write→response） |
| B. Fallback request | `trc_m2b_fallback` | primary MODEL_TIMEOUT → fallback provider 成功（degradation 传播到 header/response） |
| C. Idempotent replay | `trc_m2c_replay_1` / `trc_m2c_replay_2` | 同 client_event_id 两次提交：inserted → duplicate_ignored（经 MemoryLearningRepository 真实幂等判定） |
| D. Empty-answer short-circuit | `trc_m2d_empty` | llm_call_count=0，rule.applied(empty_answer_short_circuit) 正向解释（**Case 008 当前真实行为**） |
| E. Retrieval miss trace | `trc_m2e_retrieval_miss` | knowledge_miss_flag=true、ids=[]，LLM 未被阻塞（**Case 035 当前真实行为**） |

**诚实性声明**：D/E 记录的是产品当前真实行为（空答案确实短路、未知词确实 miss）；
**不得**因 Case 008 / 035 当前 FAIL 而伪造「正确 Trace」——Console 的工作是展示真实发生了什么。
fixtures 经 `TraceContext` emitter 生成（与产品代码同一埋点路径），`ensureDebugFixtures()` 幂等（重复调用不重复写入）。

---

## 6. 实现文件清单

### 新建
- `lib/debug/console/diagnosis.ts` — §4.4 判层纯函数（12 检查 + 事件顺序主键 + 端点矩阵）
- `lib/debug/console/fixtures.ts` — 5 场景 fixture 幂等注入
- `app/debug/traces/page.tsx` — Console 页面（Server Component，服务端注入 fixtures）
- `components/debug/trace-console.tsx` — 客户端交互（A/B/C/D 四区 + payload 展开 + fixture 快捷加载）
- `app/api/debug/traces/route.ts` — 列表/关联查询（client_event_id / user_hash / prompt_version / limit）
- `app/api/debug/traces/fixtures/route.ts` — fixture 注入端点
- `tests/unit/m2-console-diagnosis.test.ts` — 13 测试（判层结构 + 五场景 + 边界）
- `tests/unit/m2-console-fixtures.test.ts` — 10 测试（五场景真实行为 + 幂等 + Regression Guard no-op + 判层联动）
- `tests/unit/m2-console-api.test.ts` — 7 测试（三个 API 端点直接调用）
- `docs/v3/m2-implementation-phase3a.md` — 本文档

### 修改
- 无（未改 Phase 1/2 的 trace 核心、未改业务代码）

---

## 7. Verification

| 检查项 | 结果 |
|--------|------|
| `tsc --noEmit` | **PASS** |
| `next build` | **PASS** |
| M2 Phase 3A console 测试 | **30/30 PASS**（diagnosis 13 + fixtures 10 + api 7） |
| M2 Phase 1 测试 | **PASS（无回归）** |
| M2 Phase 2 测试 | **PASS（无回归）** |
| M1 ELS-EVAL-037/038 + M1 single-source-of-truth | **PASS（无回归）** |
| 全量 unit suite | **204 passed / 2 failed**（2 预存在失败：env.test.ts、llm-safety.test.ts，与基线一致，**无新增失败**） |
| Regression Guard（AC-6） | **PASS**（Trace Disabled 时 console fixtures 全部 no-op） |

---

## 8. 人工验收流程（2 分钟判层）

**流程**（操作者可独立执行）：
1. 打开 `GET /debug/traces`；
2. 输入或点击任一 fixture（或真实请求的 `x-trace-id`）；
3. 按 §4.3 路径：A 区 10s 速览 → B 区自上而下找第一个异常事件（30s）→ C 区 12 项检查确认/推翻（60s）→ D 区交叉验证（20s）；
4. 回答十问子集并记录实际走查时间。

**验收问题集**（给定 trace_id 后操作者能回答）：
- 用户输入边界发生了什么？（request.received）
- 是否调用 LLM？用哪个 prompt/model？（llm.attempt）
- validation 是否通过？（validation.result）
- 是否 fallback？（fallback.triggered）
- 什么 rule 被执行？（rule.applied）
- 什么 state 被写？（state.write，含 idempotency_outcome）
- primary suspect layer 是什么？（C 区 PRIMARY_SUSPECT_LAYER）

**状态**：`MANUAL_ACCEPTANCE_PENDING` — 尚未有人实际计时走查（无人实际计时时不得伪造秒数）。
完成一次真实走查并记录时间后，将本行更新为 `MANUAL_ACCEPTANCE_PASS（<耗时>，<操作者>，<trace_id 样本>）`。

---

## 9. 状态

```
M2_PHASE3A_CODE_STATUS: PASS
M2_PHASE3A_VERIFICATION_STATUS: PASS (Memory runtime)
MANUAL_ACCEPTANCE_STATUS: MANUAL_ACCEPTANCE_PENDING
```

**PASS 条件满足：**
- ✅ 独立 worktree：`feature/m2-debug-console` @ `D:\Codex\IELTS-m2-debug-console`，base b0ff1bf
- ✅ /debug/traces 页面存在，不在学习用户导航
- ✅ A. Trace Summary（七字段 + 关联键）
- ✅ B. Event Timeline（seq/layer/status/duration + 脱敏 payload 展开 + ok/degraded/error 区分）
- ✅ C. Failure Layer Diagnosis（12 项瀑布 + PRIMARY_SUSPECT_LAYER + EVIDENCE + UNKNOWN 兜底，无 LLM）
- ✅ D. Relevant Correlations（client_event_id / user_hash / prompt_version 最小版）
- ✅ Special Diagnostic Visibility 六项内联展示（008/035/037 可查）
- ✅ 5 场景 fixtures（含幂等重放双 trace、空答案短路、检索 miss 真实行为）
- ✅ 调用现有 GET /api/debug/traces/[traceId]，未复制 Trace Store
- ✅ typecheck / build / full unit / M1 / M2 Phase1 / Phase2 无新增失败
- ✅ 未修改学习产品业务规则；未修 Case 008/035；未做 RAG/Memory/Agent 升级；未做视觉美化

**不声称：**
- ❌ `M2_STATUS=PASS`（Supabase persistence / AC final gate 尚未完成）
- ❌ 人工 2 分钟验收已实际计时（MANUAL_ACCEPTANCE_PENDING）
- ❌ 生产级可观测性（Memory Store 演示级，重启丢失）
