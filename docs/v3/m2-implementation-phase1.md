# M2 Implementation Phase 1 — LLM Trace Core

| | |
|---|---|
| **Spec** | `M2_IMPLEMENTATION_PHASE1` |
| **前置** | `M1_CODE_STATUS: PASS` / `M1_PRODUCTION_VERIFICATION: UNVERIFIED`；`M2_OBSERVABILITY_CONTRACT_V2_2: FROZEN` |
| **日期** | 2026-09-09 |
| **范围** | Trace Context / Trace Header / Trace Event emitter / 最小 Trace Persistence / 按 trace_id 查询 / 5 种核心事件 / 6 个核心 AI endpoints 接入 |
| **禁止** | 完整 M2 实现、大规模 UI、修改 Evaluation Gold、RAG/Memory/Multi-Agent、新学习模块 |

---

## 1. Architecture Decision

### 1.1 Persistence 选型：Memory (in-process append-only)

**选择 Memory，理由：**

1. **求职项目最轻量方案**：不引入外部依赖，demo 模式可工作
2. **复用现有基础设施**：与 `MemoryLearningRepository` 同模式（in-memory Map + append-only）
3. **满足核心需求**：按 trace_id 查询 + append-only event + 不引入大型 observability platform
4. **接口可替换**：`traceStore` 封装在 `lib/observability/trace-store.ts`，未来切换 Supabase 只需改实现，调用方不变
5. **生产 Supabase migration 已设计**（见 §6），但未在远程实例执行，不声称 production verified

**限制（诚实声明）：**
- 进程重启后 trace 丢失（demo 可接受）
- 不支持跨进程查询
- 无 TTL 清理（demo 量级内存可承受）

### 1.2 Event Model：Trace Header + append-only Trace Events（Contract 方案 C）

与 M2 Contract V2.1 §2 一致：每请求 1 条 header + N 条 event，event 按 per-trace seq 排序。

### 1.3 trace_id 严格隔离

- `trace_id` = observability only，不参与任何业务逻辑（AC-6 Regression Guard）
- 业务幂等 = `client_event_id` + `CreateLearningEventResult.created`（M1 Final 已冻结）
- Trace 模块不被业务代码 import 做决策

---

## 2. 实现文件清单

| 文件 | 职责 |
|------|------|
| `lib/observability/trace-contract.ts` | Zod/TS Contract：13 层 FailureLayer enum、5 种 EventType、TraceHeader/TraceEvent schema、payload 类型 |
| `lib/observability/trace-store.ts` | Memory append-only store：getOrCreateHeader / appendEvent（自动分配 seq）/ getTrace / listTraceIds / reset |
| `lib/observability/trace-context.ts` | TraceContext 类：emitRequestReceived / emitLlmAttempt / emitValidationResult / emitFallbackTriggered / emitResponseSent / finalize；全局开关 setTraceEnabled；truncateRawOutput |
| `lib/observability/trace-api-helper.ts` | API 路由 helper：startTrace / endTraceSuccess / endTraceError / appErrorToTrace |
| `lib/llm/structured-output.ts` | callLlmStructured 埋点：llm.attempt（primary/repair/fallback_provider）、validation.result（Zod pass/fail + repair_attempts）、fallback.triggered（provider 切换） |
| `lib/llm/tasks/analyze-speaking.ts` | Speaking 质量门补 emitter：validation.result（四门 quality_gate_scores）、fallback.triggered（质量门失败→rule_based_analysis） |
| `app/api/agent/message/route.ts` | request.received / response.sent（含 mock 短路 + LLM fallback 路径） |
| `app/api/learn/card/route.ts` | request.received / response.sent（含 LLM 生成失败 502 路径） |
| `app/api/learn/submit/route.ts` | request.received / response.sent（含幂等重放路径） |
| `app/api/review/submit/route.ts` | request.received / response.sent（含幂等重放路径） |
| `app/api/speaking/analyze/route.ts` | request.received / response.sent |
| `app/api/report/route.ts` | request.received / response.sent |
| `app/api/debug/traces/[traceId]/route.ts` | GET 查询接口：返回 header + events（按 seq 排序） |
| `tests/unit/m2-trace-phase1.test.ts` | 18 个测试：Contract、Store、Context、Regression Guard、4 个 Trace Capability Fixture（ELS-EVAL 等价场景，非 Eval Case 执行） |

---

## 3. AI Capability Map — LLM 调用点 Trace 覆盖

| LLM 调用点 | 统一管线 | llm.attempt | validation.result | fallback.triggered |
|-----------|---------|-------------|-------------------|-------------------|
| `/api/agent/message` (ChatResponse) | callLlmStructured | ✅ primary | ✅ Zod | ✅ provider 切换 |
| `/api/learn/card` (word card) | callLlmStructured | ✅ primary | ✅ Zod | ✅ provider 切换 |
| `/api/learn/submit` (judge) | callLlmStructured | ✅ primary/repair | ✅ Zod + repair_attempts | ✅ fallbackJudge（业务层） |
| `/api/review/submit` (judge) | callLlmStructured | ✅ primary/repair | ✅ Zod + repair_attempts | ✅ fallbackJudge（业务层） |
| `/api/speaking/analyze` | callLlmStructured | ✅ primary/repair | ✅ Zod + 四门质量门 | ✅ rule_based_analysis |
| `/api/report` (summary) | callLlmStructured | ✅ primary | ✅ Zod | ✅ null summary（非阻塞） |

### llm.attempt 记录字段

`attempt_purpose` / `provider` / `model_name` / `tier` / `prompt_key` / `prompt_version` / `token_usage` / `latency_ms` / `raw_output`（head256+tail256+sha256，异常全量）/ `llm_error_code` / `temperature`

**不记录 API Key**（Contract §3.1 NEVER）。

### validation.result 记录字段

`validator` / `outcome`(pass/fail/needs_review) / `zod_validation_result` / `repair_attempts` / `quality_gate_scores`（口语四门：schemaCheck / evidenceConsistencyCheck / actionabilityCheck / ieltsAlignmentCheck）

### fallback.triggered 区分

`to_kind` 枚举：`provider` / `repair` / `fallback_judge` / `rule_based_analysis` / `null_report_summary`

---

## 4. 真实 Trace 示例（脱敏）

> **声明**：以下示例来自 Trace Capability Fixture（使用 mock provider 模拟 LLM 行为），用于验证 Trace 系统能否记录完整事件链。**不是 ELS-EVAL Case 执行**。Eval Case 由 Eval Runner 负责，使用真实 API 调用和 Golden Data。

### 4.1 正常 Trace（Fixture 等价 ELS-EVAL-020 场景：/api/review/submit 成功）

```json
{
  "header": {
    "trace_id": "trc_els_020",
    "route": "/api/review/submit",
    "started_at": "2026-09-09T05:40:04.000Z",
    "ended_at": "2026-09-09T05:40:04.050Z",
    "latency_ms": 50,
    "http_status": 200,
    "app_error_code": null,
    "degradation_flag": false,
    "event_count": 4,
    "user_hash": null,
    "client_event_id": "ce-020"
  },
  "events": [
    {
      "seq": 1,
      "event_type": "request.received",
      "layer": "INPUT",
      "status": "ok",
      "payload": { "input_summary": "review submit", "client_event_id": "ce-020", "method": "POST" }
    },
    {
      "seq": 2,
      "event_type": "llm.attempt",
      "layer": "MODEL",
      "status": "ok",
      "duration_ms": 30,
      "payload": {
        "attempt_purpose": "primary",
        "provider": "mock",
        "model_name": "mock-model",
        "tier": "fast",
        "prompt_key": "JudgeResult",
        "prompt_version": "v1",
        "token_usage": {},
        "latency_ms": 30,
        "raw_output": "{\"correct\":true,\"confidence\":\"high\"}",
        "raw_output_truncated": false,
        "raw_output_sha256": "a1b2c3d4e5f6..."
      }
    },
    {
      "seq": 3,
      "event_type": "validation.result",
      "layer": "OUTPUT_VALIDATION",
      "status": "ok",
      "payload": {
        "validator": "zod:JudgeResult",
        "outcome": "pass",
        "zod_validation_result": { "success": true },
        "repair_attempts": 0
      }
    },
    {
      "seq": 4,
      "event_type": "response.sent",
      "layer": "UI_PRESENTATION",
      "status": "ok",
      "payload": {
        "http_status": 200,
        "app_error_code": null,
        "output_summary": "correct=true",
        "fallback_used_flag": false
      }
    }
  ]
}
```

**十问回答能力验证：**
- Q4（Prompt/Model）：llm.attempt → provider=mock, model=mock-model, prompt_key=JudgeResult, prompt_version=v1
- Q5（模型返回）：llm.attempt.raw_output
- Q6（Validation）：validation.result → pass, repair_attempts=0
- Q7（Fallback）：无 fallback 事件 → 未降级
- Q9（用户最终收到）：response.sent → http_status=200, output_summary

### 4.2 Fallback Trace（Fixture 等价 ELS-EVAL-031 场景：primary timeout → fallback provider）

```json
{
  "header": {
    "trace_id": "trc_els_031",
    "route": "/api/review/submit",
    "degradation_flag": true,
    "event_count": 5,
    "http_status": 200
  },
  "events": [
    { "seq": 1, "event_type": "request.received", "layer": "INPUT", "status": "ok" },
    {
      "seq": 2,
      "event_type": "llm.attempt",
      "layer": "MODEL",
      "status": "error",
      "error_code": "MODEL_TIMEOUT",
      "payload": { "attempt_purpose": "primary", "provider": "mock", "latency_ms": 5000, "llm_error_code": "MODEL_TIMEOUT" }
    },
    {
      "seq": 3,
      "event_type": "fallback.triggered",
      "layer": "FALLBACK",
      "status": "degraded",
      "error_code": "MODEL_TIMEOUT",
      "payload": {
        "trigger_error_code": "MODEL_TIMEOUT",
        "chain_snapshot": [
          { "step": "primary", "from": "mock", "to": "mock", "status": "used" },
          { "step": "fallback_provider", "from": "mock", "to": "bailian", "status": "used" }
        ],
        "degradation_flag": true,
        "to_kind": "provider"
      }
    },
    {
      "seq": 4,
      "event_type": "llm.attempt",
      "layer": "MODEL",
      "status": "ok",
      "payload": { "attempt_purpose": "primary", "provider": "bailian", "model_name": "bailian-model", "latency_ms": 100 }
    },
    { "seq": 5, "event_type": "response.sent", "layer": "UI_PRESENTATION", "status": "ok", "payload": { "fallback_used_flag": true } }
  ]
}
```

**关键诊断信息：** primary MODEL_TIMEOUT → fallback.triggered(to_kind=provider) → bailian 成功 → degradation_flag=true 传播到 header 和 response。

### 4.3 Validation/Error Trace（Fixture 等价 ELS-EVAL-032 场景：invalid JSON → repair）

```json
{
  "header": {
    "trace_id": "trc_els_032",
    "route": "/api/review/submit",
    "degradation_flag": false,
    "event_count": 6
  },
  "events": [
    { "seq": 1, "event_type": "request.received", "layer": "INPUT", "status": "ok" },
    {
      "seq": 2,
      "event_type": "llm.attempt",
      "layer": "MODEL",
      "status": "error",
      "error_code": "MODEL_INVALID_JSON",
      "payload": { "attempt_purpose": "primary", "raw_output": "this is not json", "llm_error_code": "MODEL_INVALID_JSON" }
    },
    {
      "seq": 3,
      "event_type": "validation.result",
      "layer": "OUTPUT_VALIDATION",
      "status": "error",
      "payload": { "validator": "zod:JudgeResult", "outcome": "fail", "repair_attempts": 0 }
    },
    {
      "seq": 4,
      "event_type": "llm.attempt",
      "layer": "MODEL",
      "status": "ok",
      "payload": { "attempt_purpose": "repair", "provider": "mock", "tier": "fast", "prompt_key": "JudgeResult:repair" }
    },
    {
      "seq": 5,
      "event_type": "validation.result",
      "layer": "OUTPUT_VALIDATION",
      "status": "ok",
      "payload": { "validator": "zod:JudgeResult", "outcome": "pass", "repair_attempts": 1 }
    },
    { "seq": 6, "event_type": "response.sent", "layer": "UI_PRESENTATION", "status": "ok" }
  ]
}
```

**关键诊断信息：** primary 输出非法 JSON → validation fail → repair attempt（fast tier, prompt_key=JudgeResult:repair）→ validation pass(repair_attempts=1) → 最终成功。meta.repairUsed=true。

---

## 5. Verification

### 5.1 测试结果

| 检查项 | 结果 |
|--------|------|
| `tsc --noEmit` | **PASS** |
| `next build` | **PASS** |
| `vitest run`（全量） | **156 passed / 2 failed**（2 预存在失败：env.test.ts, llm-safety.test.ts） |
| M2 Trace 测试 | **18/18 PASS** |
| M1 ELS-EVAL-037/038 | **PASS（无回归）** |
| M1 m1-single-source-of-truth | **PASS（无回归）** |

### 5.2 M2 测试覆盖

| 测试类 | 用例数 | 覆盖 |
|--------|--------|------|
| Trace Contract | 5 | 13 层 enum、Event→Layer 映射、Zod schema、truncateRawOutput |
| Trace Store | 3 | append-only 排序、查询不存在、event_count 自动更新 |
| Trace Context | 2 | 完整生命周期、fallback 设置 degradation_flag |
| Regression Guard (AC-6) | 2 | Enabled vs Disabled 正常路径结果一致、错误路径结果一致 |
| Trace Capability Fixture（ELS-EVAL 等价场景） | 4 | 020 正常 trace、031 fallback trace、032 invalid JSON/repair trace、036 fallbackJudge trace |
| AC-6 静态检查 | 1 | traceStore 无业务决策方法 |

### 5.3 Regression Guard 验证（AC-6）

关闭 Trace（`setTraceEnabled(false)`）后：
- `callLlmStructured` 正常路径：data / model / fallbackUsed / repairUsed 与 Enabled 完全一致
- `callLlmStructured` 错误路径：抛出的 error message 与 Enabled 完全一致
- Disabled 时 traceStore 中无新事件（no-op）

### 5.4 Trace Capability Fixture 验证（ELS-EVAL 等价场景）

| Case | 验证内容 | 结果 |
|------|---------|------|
| 020 等价 | 十问可回答：Prompt/Model 可追踪、raw_output 可查、validation pass/fail、fallback 有无、最终响应 | PASS |
| 031 等价 | primary timeout → fallback.triggered(to_kind=provider) → fallback provider 成功 → degradation_flag 传播 | PASS |
| 032 等价场景 | invalid JSON → validation fail → repair attempt → validation pass(repair_attempts=1) | PASS |
| 036 等价 | LLM 失败 → fallbackJudge(to_kind=fallback_judge) → degradation_flag | PASS |

---

## 6. Supabase Migration 设计（未执行）

```sql
-- supabase/migrations/0009_trace.sql（设计稿，未在远程执行）
CREATE TABLE IF NOT EXISTS trace_headers (
  trace_id TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  latency_ms INTEGER,
  http_status INTEGER,
  app_error_code TEXT,
  degradation_flag BOOLEAN DEFAULT false,
  event_count INTEGER DEFAULT 0,
  user_hash TEXT,
  client_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trace_events (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES trace_headers(trace_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  layer TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(trace_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_trace_events_trace_id ON trace_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_headers_route ON trace_headers(route);
CREATE INDEX IF NOT EXISTS idx_trace_headers_degradation ON trace_headers(degradation_flag) WHERE degradation_flag = true;
```

**状态：UNVERIFIED** — 未在任何 Supabase 实例执行。当前运行使用 Memory Trace Store。

---

## 7. Remaining Risks / Gaps（M2 Phase 1 未覆盖）

| 项 | 状态 | 说明 |
|----|------|------|
| state.read / state.write 事件 | NOT IMPLEMENTED | Phase 1 只覆盖 5 种核心事件，state 事件留待 Phase 2 |
| retrieval.executed 事件 | NOT IMPLEMENTED | learn/card 的知识检索未埋点 |
| routing.decided 事件 | NOT IMPLEMENTED | /api/agent/message 的意图路由未埋点 |
| rule.applied 事件 | NOT IMPLEMENTED | 确定性规则路径（调度/短路）未埋点 |
| report.aggregated 事件 | NOT IMPLEMENTED | 报告聚合未埋点 |
| Supabase Trace Store | UNVERIFIED | migration 已设计，未执行 |
| Debug Console UI | NOT IMPLEMENTED | 只有 API 查询端点，无 UI |
| prompt_version 真实版本化 | PARTIAL | 当前固定 "v1"，无版本化注册表 |
| token_usage 真实数据 | PARTIAL | mock provider 返回 usage，真实 provider 可能未填充 |
| Trace TTL / 清理 | NOT IMPLEMENTED | Memory store 无过期清理 |

---

## 8. 状态

```
M2_PHASE1_CODE_STATUS: PASS
M2_PHASE1_VERIFICATION_STATUS: PASS (Memory runtime)
M2_PHASE1_PRODUCTION_VERIFICATION: UNVERIFIED (Supabase migration 未执行)
```

**PASS 条件满足：**
- ✅ Contract First：Zod/TS 类型建立，13 层 enum 严格使用
- ✅ Trace Context / Header / Event emitter 实现
- ✅ 最小 Trace Persistence（Memory append-only）
- ✅ 按 trace_id 查询接口（GET /api/debug/traces/[traceId]）
- ✅ 5 种核心事件：request.received / llm.attempt / validation.result / fallback.triggered / response.sent
- ✅ callLlmStructured 统一管线埋点（primary/repair/fallback_provider）
- ✅ Speaking 四门质量门 validation.result + rule_based_analysis fallback
- ✅ 6 个核心 AI endpoints 接入 request/response boundary
- ✅ Regression Guard：Trace Enabled vs Disabled 业务结果完全一致
- ✅ 真实 trace 示例：正常 / fallback / validation-error 三种
- ✅ typecheck / build / full unit / ELS-EVAL-037/038 无回归
- ✅ trace_id 不参与业务逻辑（AC-6）
- ✅ 不记录 API Key

**不声称：**
- ❌ Supabase runtime verified（migration 未执行）
- ❌ 完整 M2（缺 state/retrieval/routing/rule/report 事件 + Debug Console UI）
- ❌ Production 级可观测性
