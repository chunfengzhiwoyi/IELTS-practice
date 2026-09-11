# ELS-EVAL-039 — Special Tool Result（trace/context acceptance）

**Run**: `m3-20260910-081624`（39/39 registered，44 tests PASS）
**Result**: **PASS**（M1 Gate 全过；M2 Target 按 [FIX-08] 分层以 SKIPPED 证据行记录，不污染 M1 判定）
**Tool**: adapter 内建 acceptance（`tests/eval/cases/els-eval-039.eval.ts`，Eval-only，无独立新 observability 系统）
**Product 依赖**: MemoryAbilityRepository（DATA_PROVIDER=memory，服务端）+ server-writer（fluency/lexicalResource/grammaticalRange 三维度，sourceId=sessionId）+ computeEvidenceStatus（SINGLE→REPEATED_PATTERN 升迁）+ analyze 路由（写前读服务端 observations 构建 profile 注入 abilityContext）+ memory-retriever（≤150 字）

## 1. Frozen Gold 契约（ELS_EVALUATION_V1_1）

- **语义**: S2 / CROSS_MODULE_STATE / CURRENT=FAIL / FUTURE_TARGET；[FIX-08] 分层
- **M1 Gate（当前判定依据）**:
  - observation 服务端持久化并可读回（非 localStorage）
  - SINGLE_OBSERVATION → REPEATED_PATTERN 升迁
  - abilityContext 注入基于服务端读取（≤150 字）
- **M2 Observability Gate（[M2_TARGET]，不参与当前判定）**: observation 写入 ↔ trace_id 关联、可回溯源分析会话

## 2. 执行设计

预置 2 个历史会话（session 1：fluency SINGLE observation；session 2：lexical 提升维度池）→ analyze 第 3 会话（scripted LLM）→ 断言 M1 Gate 四行 → M2 两行作为 SKIPPED 证据。

**注入时机适配**（产品实际行为，非 Gold 修改）：analyze 路由在**写 observation 之前**读取服务端 observations 构建 profile（totalSessions 读取时须 ≥2 才注入）→ fixture 预置 2 个历史会话使读取时条件满足。

## 3. 实测证据（run m3-20260910-081624）

| Row | 断言 | Actual |
|---|---|---|
| r1-evidence-status | SINGLE → REPEATED_PATTERN 升迁 | `{before:"SINGLE_OBSERVATION", after:"REPEATED_PATTERN"}` |
| r2-server-readback | 服务端读回（API，非客户端缓存） | `{status:200, count:5, hasRepeatedPattern:true}` |
| r3-ability-context-injected | 服务端构建注入、正确维度、≤150 字、结构合法 | `{injected:true, weakestDimension:"fluency", contentCharsLte:true, promptHasTotalSessions2:true}`（内容 80 字 ≤ 150；prompt 实测含「基于过去 2 次练习」「最薄弱维度：流利度与连贯性」） |
| m2-write-trace-link（SKIPPED） | observation↔trace_id 直接关联 | "observation 无 trace_id 字段（id/sourceId=sessionId）；当前仅可经 sourceId 间接关联" |
| m2-traceback-source-session（SKIPPED） | 回溯源分析会话 | "部分可回溯：analyze trace 的 trace.start 含 session_id=spk-…，observation.sourceId 同 session_id → 经 session_id 关联" |
| r4-no-local-cache-drift | 无本地缓存漂移面 | `{driftSurface:false}` |

## 4. 判定

- **M1 Gate 全 PASS** → 当前 Frozen 判定 = **PASS**（BLOCKED → PASS 迁移，真实执行，非人为变绿）。
- **M2 Target 未落地**（observation 无 traceId 字段）→ 以 SKIPPED 证据行记录，按 [FIX-08] 不污染 M1 判定；文档明确 M2 里程碑缺口（后续 M 里程碑的登记项，非本轮 FAIL）。
- 无 Bad Case 登记（无 FAIL）。
