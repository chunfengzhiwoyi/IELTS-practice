# M3-P3 — Special Tool Coverage（Evaluation Infrastructure）

**TASK_ID**: M3-P3
**TYPE**: EVALUATION_INFRASTRUCTURE
**日期**: 2026-09-10
**产品 Checkpoint**: `55806ba815579bbc4d1aabc80d3ba9be8f5b25c2`（BC-026 / BC-033 已集成）
**Eval System 基点**: `f0ac513` → M3-02 `760afde` → M3-P3 `f1a4996`（本轮 Eval commit）
**最终 Run**: `m3-20260910-081624`
**Frozen Gold**: `ELS_EVALUATION_V1_1`（未修改）

---

## 0. 本轮目标

把因缺少专用执行工具而 BLOCKED 的三个 C 级 Case：

- `ELS-EVAL-013`（replay / state reconstruction）
- `ELS-EVAL-034`（E2E browser + STT failure）
- `ELS-EVAL-039`（trace/context acceptance）

从"只有 placeholder / requirement"推进为**真正可执行的 Evaluation capability**。

**本轮不是 Product Fix**：产品代码零修改（`git diff 55806ba -- app components lib supabase` = 空）。

---

## 1. Gold-First 内部分析（每个 Case 先读 Frozen Gold 全文再施工）

| CASE_ID | GOLD_CONTRACT | WHY_CURRENTLY_BLOCKED | REQUIRED_SPECIAL_CAPABILITY | PRODUCT_DEPENDENCY | RUNNER_DEPENDENCY | MINIMUM_EXECUTION_DESIGN |
|---|---|---|---|---|---|---|
| ELS-EVAL-013 | S1 / LEARNING_STATE_MEMORY / CURRENT=FAIL。precondition=空用户+脚本序列 S（3 词学习、复习若干轮、1 次重复 clientEventId）；pass=①replay(events)==user_item_states 逐字段 ②events 无重复 client_event_id ③updated_at 单调；must_not=事件与状态分叉/重复事件进流 | 无离线重放器：runner 无法从事件流重算状态并与快照比对 | replay_job（离线重放器） | MemoryLearningRepository 已有 `_getAllEvents/_getAllStates/getUserEventsInRange`；learn/review submit 路由有 M1 幂等分支 | harness 时钟（`vi fake timers toFake:["Date"]`）可全局冻结 → 重放确定性锚点 | 冻结时钟跑真实序列 S → 事件流 → 纯函数重放器（调用产品 computeInitialReviewAt/NextAt 以事件 createdAt 为锚）+ 镜像层级字段规则 → 逐字段比对快照 |
| ELS-EVAL-034 | S3 / FALLBACK_FAILURE / CURRENT=PASS。行1 无 Key→503 CONFIG_ERROR；行2 上游5xx→502；错误结构化；前端文字输入回退路径可达；错误日志含 trace_id 与 audio_metadata 摘要 | 无 E2E browser + 无 STT 管线；route-handler 测试不等于 E2E | E2E browser journey + STT failure 注入 | transcribe 路由（503/502/结构化/ui_fallback_offered）+ answer-input 文字/语音分段（文字默认） | Playwright（已装 @playwright/test）+ next build/start | 行1/行2 直接驱动真实路由断言错误码+ trace；前端回退路径用 Playwright 最小真实旅程（假麦克风）验证可达 |
| ELS-EVAL-039 | S2 / CROSS_MODULE_STATE / CURRENT=FAIL。[FIX-08] 分层：M1 Gate（行1-3：evidenceStatus SINGLE→REPEATED_PATTERN、服务端持久化读回、abilityContext 注入≤150字）当前判定；M2 Target（行4-5：observation↔trace_id、source 回溯）不参与当前判定 | 无 trace/context acceptance 工具 | special trace/context acceptance tool | MemoryAbilityRepository（服务端）+ server-writer + memory-retriever（≤150字）+ analyze 路由（服务端构建 profile 并注入） | scripted LLM（观测注入的 prompt）+ 服务端 repo 直读 | 预置 2 个历史会话 → analyze 第 3 会话 → 断言升迁/读回/注入；M2 以 SKIPPED 证据行记录（不污染 M1） |

---

## 2. Architecture Principle

本轮只补 Evaluation capability：

- ✅ 三工具均为 Eval-only（`tests/eval/tools/`），不触碰产品代码
- ✅ deterministic where possible：013 重放完全确定性；034 API 行确定性；E2E 用固定 fixture（假麦克风/无外部 Key）
- ✅ reproducible / isolated / resettable：每次 run 全新 reset（repo/时钟/trace），独立端口
- ✅ evidence-producing：全部行级断言携带 trace/状态/浏览器观察证据
- ✅ 未改 Frozen Gold；未改产品业务逻辑；未把 Integration test 冒充 Frozen Eval
- ✅ 未做大型通用测试平台——只实现 Gold 要求的最小能力

---

## 3. 工具实现

### 3.1 `tests/eval/tools/replay-harness.ts`（ELS-EVAL-013）

- **重放器**：`replayUserItemStates(events)` 按 itemId 分组、createdAt 升序折叠。
  - `nextReviewAt` / `currentIntervalDays` 直接调用**产品纯函数**（`computeInitialReviewAt` / `computeReviewNextAt` / `initialIntervalDays`），以事件 `createdAt` 为时钟锚点——不复制业务逻辑。
  - 层级字段（status/recognition/recall/consecutive/application）镜像 learn/review submit 路由内联的确定性更新规则（路由无独立纯函数可复用，逐行核对实现）。
- **比对器**：`compareReplayToSnapshot` 逐字段（10 字段）比较，输出 diff 清单。
- **执行证据**：r1 replay==snapshot（0 diff）；r2 7 个 clientEventId 全唯一；r3 updated_at 逐 item 严格递增；r4 重复 clientEventId 不产生新事件（w1 events=2）、不推进状态（recall=2 保持）。

### 3.2 `tests/eval/tools/speaking-e2e.ts`（ELS-EVAL-034）

- **API 行**：直接驱动 `POST /api/speaking/transcribe`（真实路由 + 内存 provider）：
  - 行1：删除 OPENAI/DEEPSEEK Key → `503 CONFIG_ERROR`（trace llm.attempt error code + response.sent ui_fallback_offered=true）
  - 行2：`WHISPER_BASE_URL` 指向本地 5xx mock server（node http）→ `502 MODEL_ERROR`，错误结构化且无 analysis 字段（不冒充口语分析错误）
- **E2E 浏览器旅程**：`next start`（独立空闲端口 + 无 STT Key 环境）→ Playwright chromium（fake media stream）→
  - 打开 /speaking → 选择 Part 1 → 会话创建 → 文字模式 textarea 可达并输入 ✓
  - 切语音 → 开始录音（假麦克风）→ 结束 → 提交 → transcribe 503 → alert（"未配置 STT API Key（OPENAI_API_KEY 或 DEEPSEEK_API_KEY）"）✓
  - 切回文字 → textarea 仍可达（回退不阻塞流程）✓
- **trace 字段缺口（诚实记录）**：Gold pass_criteria 行3"错误日志含 trace_id 与 audio_metadata 摘要"——产品错误路径日志仅含 trace_id/status/body，**无 audio_metadata** → `uncoveredAssertion` → 034 = UNVERIFIED（不降级断言、不伪 PASS）。

### 3.3 `tests/eval/cases/els-eval-039.eval.ts`（ELS-EVAL-039 acceptance，adapter 内建）

- **M1 Gate（当前判定）**：
  - r1：预置 fluency SINGLE observation + 预置第 2 会话（lexical）→ analyze 第 3 会话 → fluency `SINGLE_OBSERVATION → REPEATED_PATTERN` ✓
  - r2：服务端读回（GET /api/ability/observations，非客户端 localStorage）5 条，含 REPEATED_PATTERN ✓
  - r3：abilityContext 由服务端 observation 构建注入（prompt 实测含"最薄弱维度：流利度与连贯性"+"基于过去 2 次练习"）；内容 80 字 ≤ 150 ✓
  - r4：无本地缓存漂移面 ✓
- **M2 Target（[FIX-08]：当前不参与判定）**——SKIPPED 证据行：
  - `m2-write-trace-link`：observation **无 trace_id 字段**（仅 sourceId=session_id 可间接关联）→ M2 里程碑缺口
  - `m2-traceback-source-session`：trace（request.received 含 session_id）↔ observation.sourceId 一致 → 部分可回溯
- **注入时机说明**：analyze 路由在写入前读取服务端 observations 构建 profile（totalSessions 读取时须 ≥2）→ 测试预置 2 个历史会话使注入条件在读取时满足。此为产品实际行为适配，未改变 Gold 语义。

---

## 4. 执行结果（run `m3-20260910-081624`）

| 指标 | 值 |
|---|---|
| TOTAL_GOLD_CASES | 39 |
| REGISTERED | 39 |
| AUTO_ADJUDICATED（PASS+FAIL） | 25 |
| PASS | 25 |
| FAIL | 0 |
| MANUAL_REVIEW | 10 |
| UNVERIFIED | 4（012 / 025 / 034 / 035） |
| BLOCKED | 0 |
| NOT_RUN | 0 |
| AUTO_ADJUDICATED_PASS_RATE（PASS/(PASS+FAIL)） | 25/25 = 100% |

**C 级解锁情况（BLOCKED → 真实状态）**：

| Case | M3-P1（P3 前） | M3-P3 最终 | 说明 |
|---|---|---|---|
| ELS-EVAL-013 | BLOCKED | **PASS** | replay==snapshot 逐字段一致（0 diff）；事件无重复；updated_at 单调；重复提交幂等 |
| ELS-EVAL-034 | BLOCKED | **UNVERIFIED** | 503/502/结构化/E2E 回退路径全部 PASS；唯一 uncovered=错误日志缺 audio_metadata（产品 trace 字段缺口） |
| ELS-EVAL-039 | BLOCKED | **PASS** | M1 Gate 三行全过；M2 Target 按 [FIX-08] 记录为 SKIPPED 证据（不污染 M1） |

**回归（重点确认）**：

- ELS-EVAL-026：PASS（BC-026 Regression 2/3，仍 FIXED_PENDING_REGRESSION）
- ELS-EVAL-033：PASS（BC-033 Regression 2/3，仍 FIXED_PENDING_REGRESSION）
- ELS-EVAL-008 / 037 / 038：PASS 保持，无漂移
- 其余 MANUAL/UNVERIFIED Case 状态未强制变绿（010/022/012/025/035 等按真实能力保持原状态）

---

## 5. Bad Case Registry

- 013 / 034 / 039 本轮真实执行后均 **无 FAIL** → **未新建 Bad Case**（§10 只要求 FAIL 才登记）。
- BC-M3-001（026）/ BC-M3-002（033）：`regression_runs=[m3-20260910-070726, m3-20260910-081624]`，状态保持 `FIXED_PENDING_REGRESSION`（Regression 2/3，不提前 VERIFIED_CLOSED）。
- 034 的 audio_metadata 错误日志缺口：登记为 **文档化 trace 字段缺口**（m3-special-tools.md / 034-result.md），非 FAIL、非 Bad Case（failure_criteria"错误未分类或用户无回退路径"未命中）。

---

## 6. Product / Eval Separation

- `git diff 55806ba -- app components lib supabase` = **空**（产品树零修改）。
- 允许修改范围（仅 Eval/文档）：`tests/eval/**`、`scripts/eval/**`、`docs/eval/**`、`tests/eval/vitest.config.ts`。
- Runner 兼容 patch：`vitest.config.ts` testTimeout 240s（C 级 E2E 需要）、`registry.ts` adapter_kind 增 `special_tool`、case 定义 missing_capability 清空（工具已实现）。**Frozen Gold 语义未改变**（行级断言全部来自 spec，未放宽）。

---

## 7. Verification

| 项 | 结果 |
|---|---|
| `tsc --noEmit` | PASS |
| Eval Runner 全量 39 Case suite | PASS（44 tests，含 registry 完整性 + 10-Case 回归断言） |
| 三个 special-tool adapter | 013 PASS / 034 UNVERIFIED / 039 PASS（真实执行） |
| Playwright E2E | 已真实运行（fake mic + 503 alert + 文字回退） |
| Bad Case Registry schema | 15-field 结构保持，生命周周期字段未越界 |

**历史 run 保留（未覆盖）**：m3-20260909-143153（M3-P1）、m3-20260910-070726（M3-02）、m3-20260910-080432 / 081319（M3-P3 中间）均保留于 `docs/eval/runs/`。
