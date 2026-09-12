# PRODUCT-LOOP-04C — Speaking→Vocab Evidence Quality Eval

> **版本说明（04C-FINAL）**：本文档含两阶段。
> - **Phase 1（BLOCKED / fallback sanity）**：真实凭据缺失期记录；其 `EVIDENCE_QUALITY_NOT_RELIABLE` 结论已更正为 **UNVERIFIED**（当时真实模型未运行，非质量判定）。
> - **Phase 2（REAL LLM QUALITY EVAL，2026-09-12）**：deepseek/deepseek-chat 三轮完整真实评估。
> - **最终结论（Phase 2）**：`PRODUCT_DECISION = EVIDENCE_QUALITY_GOOD_ENOUGH_FOR_STATE_MAPPING_DESIGN`（A）；`EVIDENCE_SAFETY_DECISION = SAFE_FOR_STATE_MAPPING_DESIGN`。**仍禁止任何长期状态写回。**

**AGENT**: 豆包c
**TASK_ID**: PRODUCT-LOOP-04C
**TYPE**: MODEL_QUALITY_EVALUATION（READ_ONLY_EVAL）
**MODE**: 只读评估；不修改产品代码
**CANONICAL_BASE**: `95f65aadf546e1454a0e2a9b8f7b9a7a6213857a`（repo/arch-consolidate）
**AUDIT_BRANCH**: `audit/product-loop-04c-evidence-quality`
**DATE**: 2026-09-12

---

## 0. 结论摘要（TL;DR）

- **目标**：验证 04B 实现的真实证据管线（真实 Speaking analyzer + 04B schema + 真实 validator）在 04A frozen Gold（53 cases / 57 item 级标签）上能否可靠判 CORRECT / ISSUE / UNCERTAIN / NOT_USED，重点 FALSE_CORRECT。
- **结果**：**真实 LLM 质量评估被环境阻塞** —— 本机无任何 LLM 凭据（无 `.env.local`、无 `BAILIAN_API_KEY` / `DEEPSEEK_API_KEY`、无可用本地模型服务）。按任务 §6"不能用 mock 证明质量"、§7"不得伪造/泄漏 key"，**本轮无法产出真实质量指标**。
- **已交付（全部真实执行）**：
  1. **eval harness**（`tests/eval/product-loop-04c/evidence-quality.eval.test.ts` + `vitest.eval.config.ts`）：驱动**真实 `analyzeSpeakingWithLlm`（单次 LLM 结构化调用，含 04B schema）→ 真实 `validateTargetExpressionEvidence`**，对 57 个 item 级标签逐条跑完整管线，输出 per-case + metrics。换 provider 即可复跑，无需改代码。
  2. **run-1（SANITY ONLY，mock）**：57 次调用全走真实管线 → mock 不符合 SpeakingAnalysis schema → 规则引擎降级 → **57/57 保守 UNCERTAIN，FALSE_CORRECT=0**。验证：管线机制端到端成立（每 frozen target 恰好 1 条 evidence、无崩溃、无越界 itemId 进入 final）。
  3. **run-2（BLOCKED 尝试，bailian 无 key）**：57 次调用 → `[env] bailian.BAILIAN_API_KEY: Required` → 同样安全降级为全 UNCERTAIN。验证：**无凭据时 analyzer 保守降级，不会产生虚假 CORRECT**（安全性属性，非质量属性）。
- **04A baseline 对照**：`CORRECT precision 0.8077 / FALSE_CORRECT 5` **保持为唯一已证实的质量基线**；04C 的 Before/After 对比**待真实模型运行后补充**（PENDING，不得用 mock 数字冒充）。
- **产品决策**：`EVIDENCE_QUALITY_NOT_RELIABLE`（= **NOT_YET_VERIFIED**：无真实模型数据，按 04B 门禁不得进入 04D 状态映射设计）。
- **证据安全决策**：`SAFE_FOR_EVIDENCE_ONLY`（保持现状：evidence 仅观察记录，不写任何长期 Learner State）。
- **阻塞项（明确）**：`REAL_LLM_CREDENTIALS_REQUIRED` —— 需在 canonical 配置 `BAILIAN_API_KEY/BASE_URL/MODELS` 或 `DEEPSEEK_API_KEY/...`（`.env.local`，勿提交），或提供可达的本地模型端点；之后按 §12 跑 3 轮即可获得全部质量指标。
- **冻结确认**：`LONG_TERM_STATE_WRITEBACK = NO`；applicationLevel/recallLevel/status/nextReviewAt/currentIntervalDays/consecutiveCorrect 全部未动；无新 DB schema；无产品 runtime diff；M3 PAUSED。

---

## 1. Eval Setup（评估设置）

| 项 | 值 |
|---|---|
| 评估对象 | **真实** `analyzeSpeakingWithLlm`（`lib/llm/tasks/analyze-speaking.ts`，04B 扩展：EnhancedAnalysisSchema + `targetExpressionUsageEvidence` + EVIDENCE_RULES prompt）→ **真实** `validateTargetExpressionEvidence`（`lib/speaking/target-expression-evidence-validator.ts`） |
| 题目上下文 | `sp-p1-001`（固定题，所有 case 同一题；Gold 冻结时与题目无关） |
| frozen targets | 每 case 的 `targets`（多目标 case 传全部 targets；单目标 case 传 gold.itemId）；suggestedExpressions 由 seed catalog 解析 `{itemId, canonicalForm, meaning}` |
| Gold 语料 | `docs/product/evidence-cases/gold-cases.json`（04A 冻结，53 cases / **57 item 级标签**；未在见结果后修改任何 label） |
| 统计单位 | **item-level**（每 frozen target 一条，多目标 session 拆开计） |
| 产物 | `tests/eval/product-loop-04c/{run-1.json, run-2.json, aggregate.json}` + 本报告 |
| 禁止项 | 未直接调用 validator 代替完整管线；未手工伪造 LLM 输出；mock 仅作 sanity（§6） |

## 2. Gold Corpus（冻结语料）

- 来源：04A `gold-cases.json`（53 cases；A–P 全类别；57 item 级标签：CORRECT 21 / ISSUE 15 / UNCERTAIN 5 / NOT_USED 16）。
- 每条保留：caseId / itemId / answer / goldLabel / goldReason / category（harness `rows` 逐条携带）。
- **GOLD_DISPUTE：0**（无需要争议的 Gold）。

## 3. Model Configuration（模型配置）

| 项 | 值 |
|---|---|
| 产品正式配置 | `LLM_PRIMARY_PROVIDER ∈ {bailian, deepseek, mock}`（`provider-registry.ts`）；main tier 模型：bailian → `BAILIAN_MAIN_MODEL`（默认 qwen-plus）；deepseek → `DEEPSEEK_MAIN_MODEL`（默认 deepseek-v4-pro） |
| temperature | 0.3（`analyzeSpeakingWithLlm` 固定，未改） |
| prompt/schema 版本 | 04B 集成后 canonical 当前版本（`95f65aa`） |
| **本机可用凭据** | **无**（`LLM_PRIMARY_PROVIDER` 未设；无 `.env.local`；`BAILIAN_API_KEY`/`DEEPSEEK_API_KEY` 均未设置；OLLAMA 目录存在但服务不可达） |
| 实际执行的 provider | run-1: `mock`（SANITY ONLY）；run-2: `bailian`（BLOCKED 尝试，无 key） |
| 是否泄漏凭据 | 否（全程未读取/打印任何 key） |

## 4. Run Count（运行记录）

| Run | provider | 真实模型 | 57 次管线调用 | 结果 | 性质 |
|---|---|---|---|---|---|
| RUN_1 | mock | NO | 57（全部执行） | 57/57 UNCERTAIN（schema 校验失败 → 规则引擎降级） | **SANITY ONLY**（§6 不计入质量指标） |
| RUN_2 | bailian（无 key） | NO | 57（全部执行） | 57/57 UNCERTAIN（`BAILIAN_API_KEY: Required` → 降级） | **BLOCKED 尝试**（凭据缺失证据） |
| RUN_3 | — | — | — | 未执行（凭据缺失，跑也只会重复降级） | — |
| **QUALITY RUNS** | — | **0** | — | — | **STABILITY_NOT_VERIFIED**（§12） |

- **未挑最优 run**（§13）：无质量 run 可挑；两个 run 均已如实入库。
- **未伪造**（§6）：mock 结果明确标注 SANITY ONLY，未计入任何质量指标；无手工构造 LLM 输出。

## 5. Metrics（指标）

### 5.1 质量指标（真实模型）—— **NOT_AVAILABLE（BLOCKED）**

| metric | value |
|---|---|
| CORRECT precision / recall | **N/A**（真实 LLM 未运行） |
| ISSUE precision / recall | **N/A** |
| NOT_USED accuracy | **N/A** |
| UNCERTAIN rate / overall accuracy | **N/A** |
| grounding violations / validator downgrades | **N/A**（真实输出） |
| FALSE_CORRECT / FALSE_ISSUE | **N/A**（真实输出） |
| missing evidence / duplicate conflict | **N/A**（真实输出） |

> 按 §6：这些指标**必须由真实模型产生**，不能由 mock 或手工数据填充。当前如实标记 N/A。

### 5.2 Sanity / 阻塞 run 指标（仅供机制验证，**不计入质量**）

| metric | RUN_1 (mock) | RUN_2 (bailian no-key) |
|---|---|---|
| totalLabels | 57 | 57 |
| UNCERTAIN rate | 1.0 | 1.0 |
| FALSE_CORRECT | 0 | 0 |
| FALSE_ISSUE | 0 | 0 |
| grounding violations（final） | 0 | 0 |
| validator downgrades | 57（全部经 fallback 保守化） | 57 |
| missing evidence | 0（fallback 为每 target 补齐 1 条 UNCERTAIN） | 0 |
| 崩溃 / 异常 | 0 | 0 |

### 5.3 混淆矩阵（真实质量）—— PENDING

真实模型运行后按 §14 填 4×4 混淆矩阵；当前无数据。

## 6. Before/After vs 04A（对照）

| 指标 | 04A baseline（rule-only） | 04C new pipeline（真实模型） | 变化 |
|---|---|---|---|
| CORRECT precision | 0.8077（21/26） | **N/A（未验证）** | PENDING |
| FALSE_CORRECT | 5（语义误用 ×4 + 定义式回声 ×1） | **N/A** | PENDING |
| grounding violations | 0 | 0（fallback 路径确认） | 机制侧持平 |
| 语义误用（E20–E23） | 4 个 FALSE_CORRECT | **N/A（待 LLM 语义层验证）** | PENDING |
| 定义式回声（G31） | 1 个 FALSE_CORRECT | **N/A** | PENDING |
| 代价（UNCERTAIN rate） | 5.3% | **N/A** | PENDING |

**结论：04A 基线仍是当前唯一已证实质量证据；04C 的"是否改善"无法在本环境回答。**（§30 四项核心问题：FALSE_CORRECT 是否下降 / 语义误用是否改善 / meta echo 是否改善 / 是否以 UNCERTAIN 为代价 —— 全部 PENDING，待真实凭据。）

## 7. FALSE_CORRECT / Semantic Misuse / Meta Echo / Grounding / Stability

- **FALSE_CORRECT 逐条表**：真实模型运行后按 §16 分类（SEMANTIC_MISUSE / META_ECHO / PROMPT_ECHO / PARTIAL / SELF_CORRECTION / MULTI_TARGET / OTHER）填表。当前 N/A。
- **Semantic Misuse Gate（§17）**：E20–E23 旧规则 4 个 FALSE_CORRECT → 新管线 LLM 语义层是否拦截：**待验证**（04B prompt 已含"语义角色错误 → ISSUE"规则，但规则是否生效需真实模型确认）。
- **Meta Echo Gate（§18）**：G31 旧规则误判 CORRECT → 04B prompt 已含"定义式/元语言回声不得 CORRECT"规则：**待验证**。
- **Prompt Echo（§19）**：短回声由 validator 结构守卫覆盖（04B 已实现，`short_answer_exact_canonical_echo`）；定义式/元语言回声依赖 LLM 语义层：**待验证**。
- **Natural Variation（§20）**：take it/took it/taking things for granted 等合法变形：validator 采用规范化子串 grounding（不要求 canonical 逐字），机制上不误杀；LLM 层变体识别：**待验证**。
- **Grounding Gate（§21）**：**FINAL_GROUNDING_VIOLATION = 0**（两个 run 均确认：fallback 路径下 final CORRECT/ISSUE 为 0，天然无未 grounding 的 CORRECT；真实模型路径的 grounding 行为待验证）。若真实 run 出现 final CORRECT 但 quote ∉ answer → P0。
- **Unknown Item / Missing / Duplicate（§22–24）**：validator 白名单 drop、missing→UNCERTAIN、duplicate 冲突→UNCERTAIN 均由 04B 单测覆盖；真实 LLM 的 hallucinate 发生率：**待验证**。
- **Self-Correction（§25）/ Multi-Target（§26）/ NOT_USED Safety（§27）**：规则与 04A 设计一致（最终 span 为准、per-item 独立、NOT_USED=允许）；真实模型行为：**待验证**。
- **Stability（§28）**：**STABILITY_NOT_VERIFIED**（无 3 轮真实 run）。

## 8. Runtime Cost（成本）

| 项 | 值 |
|---|---|
| cases | 53 |
| LLM calls（管线内，已执行） | 57（RUN_1）+ 57（RUN_2）= 114（全部为 mock/无 key 快速失败或降级，**0 次真实模型调用**） |
| token usage / cost | **NOT_AVAILABLE**（无真实调用；不伪造） |

## 9. Findings（发现）

| 级别 | 发现 | 说明 |
|---|---|---|
| P1 | **REAL_LLM_EVAL_BLOCKED** | 环境无 LLM 凭据，真实质量评估无法执行；这是 **gate 阻塞项**（非产品缺陷）。解锁：配置 bailian 或 deepseek 凭据到 `.env.local`（勿提交），或提供可达本地模型；随后 3 轮即可产出全部指标 |
| P2 | **STABILITY_NOT_VERIFIED** | 无真实 3 轮 run；无法评估 per-item agreement / FALSE_CORRECT recurring |
| P2 | **BEFORE/AFTER PENDING** | 04A baseline 与 04C 真实结果对比未完成，不能宣布任何质量改善 |
| P3 | **HARNESS_VERIFIED**（正向） | 真实管线 harness 端到端可跑：57 标签完整执行、每 target 恰 1 条 evidence、无崩溃；换凭据即可复跑（`EVAL_RUN=1..3` + `LLM_PRIMARY_PROVIDER=bailian|deepseek`） |
| P3 | **FALLBACK_SAFE**（正向） | 无凭据/mock schema 失败时 analyzer 保守降级全 UNCERTAIN，FALSE_CORRECT=0 —— 安全性属性成立（但**不是**质量属性） |

**P0：0**（未观察到未 grounded / unknown target 成为 final CORRECT —— fallback 与 validator 门禁均有效；真实模型路径待验）。

## 10. Product Decision & Next Phase

### 10.1 Decision Gate

**PRODUCT_DECISION = `EVIDENCE_QUALITY_NOT_RELIABLE`**（= NOT_YET_VERIFIED）

理由：本任务唯一合格的质量指标来源（真实 LLM pipeline）因环境凭据缺失**未执行**。按 04B 门禁（"只有 04C 用真实 pipeline + gold corpus 跑出可接受 precision 后才允许状态映射设计"），在无真实数据前**不得**：
- 进入 04D 状态映射设计（A 不可选）；
- 宣布任何质量改善（B 的"大体成立但有误判类别"无数据支撑）；
- 唯一诚实选项是 C：当前不能作为长期 learner state 输入。

C 的语义保持现状安全态：**Vocab→Speaking one-way + evidence observational only**（与 04B 交付态一致，不退化）。

**EVIDENCE_SAFETY_DECISION = `SAFE_FOR_EVIDENCE_ONLY`**

### 10.2 Next Phase（解锁路径）

1. **04C-FINAL（前置）**：在 canonical 配置真实凭据（bailian 或 deepseek，`.env.local`，勿提交），用本 harness 跑 **RUN_1/2/3**（`EVAL_RUN=1..3`），产出：CORRECT precision/recall、ISSUE precision/recall、NOT_USED accuracy、UNCERTAIN rate、FALSE_CORRECT 逐条（按 §16 分类）、stability、混淆矩阵、before/after 04A。
2. 依真实结果 Gate：precision ≥ 阈值（Control Plane 定，建议 ≥0.90 且 FALSE_CORRECT 中无语义误用/回声残留）→ 04D 状态映射设计；否则 04C-FIX / 04B.1 targeted prompt/validator 修复。
3. 在 04C-FINAL 通过前：**禁止任何长期状态写回**。

## 11. Boundary Confirmations（边界确认）

| 项 | 值 |
|---|---|
| PRODUCT_CODE_MODIFIED | **NO**（未改 prompt / schema / validator / speaking route / repo / learning state） |
| LONG_TERM_STATE_WRITEBACK | **NO** |
| applicationLevel / recallLevel / status / nextReviewAt / currentIntervalDays / consecutiveCorrect | 全部未变 |
| NEW_DATABASE_SCHEMA / MIGRATION | NO |
| NEW_M3_EVAL_RUN | NO；M3 **PAUSED**；019/020/023/025/030/035 均未推进 |
| 04C_FINDING（运行时缺陷顺手修） | 无（未发现需要顺手修的产品缺陷；仅记录） |

## 12. Reproducibility（可复现性）

- timestamp / provider / model / config / canonical commit / gold version：见 `tests/eval/product-loop-04c/run-*.json` meta（含 `95f65aa`、gold v04A、provider、realLlmConfigured 标记）。
- harness 复跑：`$env:LLM_PRIMARY_PROVIDER=<bailian|deepseek>`（配好 key）；`$env:EVAL_RUN=1|2|3`；`npx vitest run --config tests/eval/vitest.eval.config.ts tests/eval/product-loop-04c/evidence-quality.eval.test.ts`。
- 模型供应商无法完全 deterministic：真实 run 将显式声明（§12 要求），并以 3 轮 stability 衡量。

---

---

# Phase 2 — REAL LLM QUALITY EVAL（2026-09-12，PRODUCT-LOOP-04C-FINAL）

> Phase 1（BLOCKED / fallback sanity）见上文；本 Phase 记录真实模型三轮完整评估。历史事实不被覆盖。
> 上一轮 `EVIDENCE_QUALITY_NOT_RELIABLE` 应更正为 **UNVERIFIED（Phase 1）**；Phase 2 给出首个真实质量结果。

## P2.0 Eval Setup（真实）

| 项 | 值 |
|---|---|
| 真实模型 | **deepseek / deepseek-chat**（产品 `.env.local` 正式配置：`LLM_PRIMARY_PROVIDER=deepseek`，main model=deepseek-chat） |
| temperature | 0.3（analyzer 固定，未改） |
| pipeline | 真实 `analyzeSpeakingWithLlm`（同一 LLM 调用，04B schema）→ 真实 `validateTargetExpressionEvidence` |
| prompt/schema | 04B 集成后 canonical `95f65aa` 版本（含 EVIDENCE_RULES 语义规则） |
| Gold | 04A 冻结 53 cases / 57 item 级标签（未因结果修改任何 label） |
| 轮次 | RUN_1 / RUN_2 / RUN_3（每轮 53 个 LLM 调用，57 个 item 级判定；不挑最优） |
| 探针 | §7 probe 先行通过：`actual_provider=deepseek, model=deepseek-chat, fallback_used=false, latency 9041ms` |
| 产物 | `tests/eval/product-loop-04c/real-run-{1,2,3}.json` + `real-run-aggregate.json`；旧 `run-1.json`(SANITY_ONLY) / `run-2.json`(BLOCKED_ONLY) 保留不混入 |

## P2.1 Metrics（三视角：逐轮 / Macro / Worst-run）

| metric | RUN_1 | RUN_2 | RUN_3 | **Macro avg** | **Worst-run** |
|---|---|---|---|---|---|
| CORRECT precision | **1.0** | **1.0** | **0.9375** | **0.9792** | 0.9375 |
| CORRECT recall | 0.7143 | 0.7619 | 0.7143 | 0.7302 | 0.7143 |
| ISSUE precision | 0.7333 | 0.75 | 0.7647 | 0.7493 | 0.7333 |
| ISSUE recall | 0.7333 | 0.8 | 0.8667 | 0.8 | 0.7333 |
| NOT_USED accuracy | 1.0 | 1.0 | 0.9375 | 0.9792 | 0.9375 |
| UNCERTAIN rate | 0.1930 | 0.1579 | 0.1579 | 0.1696 | 0.1930 |
| overall accuracy | 0.7368 | 0.7719 | 0.7544 | 0.7544 | 0.7368 |
| **FALSE_CORRECT** | **0** | **0** | **1** | **0.33** | **MAX=1** |
| FALSE_ISSUE | 4 | 4 | 4 | 4 | 4 |
| grounding violations | 0 | 0 | 0 | **0** | 0 |
| validator downgrades | 8 | 6 | 6 | 6.7 | 8 |
| missing evidence | 0 | 0 | 0 | 0 | 0 |
| duplicate conflict | 2 | 1 | 1 | 1.3 | 2 |

- **FALSE_CORRECT_MAX_ACROSS_RUNS = 1**（唯一一条为 M45|seed-016，见 P2.4 —— **GOLD_DISPUTE，非危险类误判**）。
- 每轮 53 次真实 LLM 调用（每 case 一次），三轮共 **159 次真实调用**；avg latency ≈ **8.4s/call**；token/cost 未采集 → NOT_AVAILABLE。

## P2.2 Before / After vs 04A（核心对照）

| 指标 | 04A rule-only | 04C-FINAL real (avg) | 变化 |
|---|---|---|---|
| CORRECT precision | 0.8077 | **0.9792** | +17.2pp |
| CORRECT recall | 1.0 | 0.7302 | −27.0pp（precision-first 代价） |
| **FALSE_CORRECT** | **5** | **0.33（max 1，且为 GOLD_DISPUTE）** | **↓ 显著** |
| SEMANTIC_MISUSE（E20–E23） | 4 个 FALSE_CORRECT | **0**（ISSUE×3 或 UNCERTAIN） | **↓ 修复** |
| META_ECHO（G31） | 1 个 FALSE_CORRECT | **0**（UNCERTAIN×3） | **↓ 修复** |
| PROMPT_ECHO（G28–G30） | — | **0**（UNCERTAIN×3，含结构守卫/fallback） | 保持安全 |
| UNCERTAIN rate | 5.3% | 17.0% | +11.7pp（保守化） |
| grounding violations | 0 | 0 | 持平 |

四项核心问题回答：
1. **FALSE_CORRECT 是否下降？** 是：5 → avg 0.33（max 1）。
2. **semantic misuse 是否改善？** 是：E20–E23 三轮零 FALSE_CORRECT（04B prompt 语义 fit 规则生效）。
3. **meta echo 是否改善？** 是：G31 三轮 UNCERTAIN（04B 元语言回声规则生效）。
4. **是否以大量 UNCERTAIN 为代价？** 部分：UNCERTAIN 5.3%→17.0%、CORRECT recall 1.0→0.73，但**非退化**（见 P2.3）。

## P2.3 Conservative Tradeoff / Degenerate Check（§21–22）

- **OVER_CONSERVATIVE_PIPELINE = NO**：
  - UNCERTAIN 仅覆盖 17% 标签（83% 得到决定性判定），未瘫痪；
  - CORRECT recall 73%（未坍塌）；
  - 保守化来源主要是**合理 UNCERTAIN**（回声/自纠冲突/枚举降级），而非"全部 UNCERTAIN 假装零 FP"。
- FALSE_ISSUE（gold CORRECT → 判 ISSUE，每轮 4 条）是 recall 侧主要代价：
  - 复现：D17（3/3 ISSUE）、M44|seed-003（3/3 ISSUE）、D18（2/3）、M45|seed-003（2/3）、C16、P52（各 1/3）。
  - 根因（P2 finding）：模型对"代词 it 指代不明 + 与固定题目语境不匹配"从严判 ISSUE；部分为 **eval 固定题伪影**（gold answers 独立于题目创作，与 sp-p1-001 语境错配时模型扣分）。生产中间有 question-matching 保证题与表达自然适配，此伪影会减轻。

## P2.4 FALSE_CORRECT 唯一案例（逐条，§16）

| 字段 | 值 |
|---|---|
| caseId | **M45**（category M：两目标一正确一错） |
| 目标表达 | seed-016 `pros and cons` |
| user answer | `I take my family for granted every day, and there is pros and cons to that.` |
| gold | ISSUE（gold reason：pros and cons 搭配语法错误：单数 is 配复数） |
| 预测/校验后 | CORRECT（quote=`there is pros and cons to that`，upgradeCandidate=true，无 validator notes） |
| 模型 reason | 学生确实使用了 pros and cons，语义（利弊）成立、核心搭配正确；仅主谓一致（is 应为 are）是表达外语法问题，不影响该表达判定 |
| 为何失败 | **GOLD_DISPUTE**：模型理由与 04A 契约 §9D（"用户可有其他错误，但目标表达本身仍然正确"）一致；gold 把 is/are 一致性视为表达内错误。此误判**不属危险类**（非语义误用/回声/幻觉 quote），对长期状态污染风险极低 |
| 分类 | OTHER（金标争议） |
| 复现性 | 仅 RUN_3（1/3 轮次）→ **不构成 recurring FALSE_CORRECT** |

> GOLD_DISPUTE 记录（§8）：M45|seed-016 gold 偏严。原 label 保留于统计；建议 Control Plane 仲裁后可将该 case 修正为 CORRECT（届时 FALSE_CORRECT=0/0/0）。

## P2.5 Critical Case Gates（§14–18）

- **Semantic Misuse（E20–E23）**：E20 ISSUE×3 ✓ / E21 ISSUE,ISSUE,UNCERTAIN ✓ / E22 ISSUE×3 ✓ / E23 ISSUE×3 ✓ → **旧规则 4 个 FALSE_CORRECT 全部消除**。
- **Meta Echo（G31）**：UNCERTAIN×3 ✓ → 消除。
- **Prompt Echo（G28–G30）**：UNCERTAIN×3 ✓（G28 短回声结构守卫；G30/G31 部分经 fallback 保守化，结果同样安全）。
- **Self-Correction（I35–I37 / J38–J39 / K40–K41）**：
  - I35/I36（先错后对）CORRECT×3 ✓；I37（改到错）ISSUE×3 ✓；J38（错→对）CORRECT×3 ✓。
  - J39/K41（先对后错，gold ISSUE）：保守（UNCERTAIN/ISSUE），**无 FALSE_CORRECT** ✓。
  - K40（两次都对，gold CORRECT）：UNCERTAIN,CORRECT,UNCERTAIN —— recall 侧保守（duplicate/conflict 或 LLM 自纠不确定），安全但召回损失。
- **Multi-Target（L42/L43/M44/M45）**：
  - L42/L43（一正确一未用）三轮完全正确且稳定，**无串台** ✓。
  - M44（一正确一 ISSUE）：seed-003（gold CORRECT）3/3 判 ISSUE（FALSE_ISSUE 复现，见 P2.3）；seed-015（bare in mind）3/3 ISSUE ✓。**同句另一目标错误会牵连该目标判 ISSUE**（保守侧，P2 finding）。
  - M45：两目标均不稳定（seed-003: UNCERTAIN/ISSUE/ISSUE；seed-016: UNCERTAIN/ISSUE/CORRECT）→ **HIGH_RISK_UNSTABLE_CASE（多目标+含语法错误句）**。

## P2.6 Grounding / Gates / Stability（§19–20）

- **FINAL_GROUNDING_VIOLATIONS = 0（三轮）**：所有最终 CORRECT/ISSUE 的 quote 均 grounding 到用户 answer；validator 门禁有效。无 P0。
- **Unknown Item**：0（无越界 itemId 进入 final）。
- **Missing Evidence**：0（validator 为每 frozen target 补齐；fallback 补 UNCERTAIN）。
- **Duplicate Conflict**：2/1/1（J39、K40、K41 —— LLM 对同一 item 输出两条冲突 evidence → validator 正确合并为 UNCERTAIN）。
- **Stability**：
  - per-item 3/3 标签一致：**45/57 = 78.9%**；不稳定 12 项（多为 UNCERTAIN↔ISSUE/CORRECT 翻转）。
  - CORRECT stability：gold-CORRECT 中 3/3 判 CORRECT = **14/21 = 66.7%**。
  - **FALSE_CORRECT recurrence**：仅 M45（1/3 轮）→ 不构成 recurring；无 high-risk unstable FALSE_CORRECT 模式。

## P2.7 Findings（Phase 2 增量）

| 级别 | 发现 |
|---|---|
| P0 | 0（无未 grounding / unknown target 成为 final CORRECT） |
| P1 | 0（无语义误用/回声 FALSE_CORRECT 复现；唯一 FALSE_CORRECT 为 GOLD_DISPUTE） |
| P2 | **FALSE_ISSUE 复现（D17/M44/D18/M45）**：模型对"代词 it 指代不明 + 题目语境不匹配"从严判 ISSUE；含固定题 eval 伪影 → recall 侧调优点（配题评估 / 提示澄清 it 指代容忍度） |
| P2 | **枚举漂移 "INCORRECT"**：模型偶发输出 `INCORRECT`（非 ISSUE）→ schema 修复/fallback 保守化（M45 r1、P52 r2、N47 r3）；安全但耗延迟+降 recall → 建议修复层把 INCORRECT 归一为 ISSUE（记录，不实施） |
| P2 | **M45 多目标+语法错句不稳定**：HIGH_RISK_UNSTABLE_CASE；多目标句子中一个目标带语法错误会牵动另一目标判定 |
| P3 | 保守化权衡成立：FALSE_CORRECT 大幅下降以 recall 损失为代价，非退化（见 P2.3） |

## P2.8 Product Decision（Phase 2 最终）

**PRODUCT_DECISION = `EVIDENCE_QUALITY_GOOD_ENOUGH_FOR_STATE_MAPPING_DESIGN`（A）**

依据（§25 优先级）：
1. **FALSE_CORRECT**：avg 0.33 / max 1，且唯一一条为 GOLD_DISPUTE（模型理由符合 §9D）→ 通过。
2. **repeated semantic misuse FP**：0（三轮）→ 通过。
3. **repeated meta echo FP**：0（三轮）→ 通过。
4. **grounding violations**：0（三轮）→ 通过。
5. **stability**：78.9% 标签一致；FALSE_CORRECT 不 recurring；不稳定项均为 recall 侧 → 可接受（设计阶段）。
6. **CORRECT precision**：0.9375–1.0 → 通过。
7. **CORRECT recall**：0.71–0.76（偏低但为 precision-first 设计代价）→ 记录，不阻塞设计。

**EVIDENCE_SAFETY_DECISION = `SAFE_FOR_STATE_MAPPING_DESIGN`**

> 含义（严格边界）：允许进入 **04D**，仅设计 evidence→长期状态映射；**不等于 writeback 已批准**。写回仍需 04D 映射规则 + Control Plane 批准 + 建议补充 matched-question 复测与 04C-FIX（P2 项）。

**NEXT**：`PRODUCT-LOOP-04D`（EVIDENCE→STATE MAPPING DESIGN，only design，no writeback）。

## P2.9 Boundary Confirmations（Phase 2）

| 项 | 值 |
|---|---|
| PRODUCT_CODE_MODIFIED | **NO**（prompt/schema/validator/route/repo 未改） |
| LONG_TERM_STATE_WRITEBACK | **NO** |
| applicationLevel / recallLevel / status / nextReviewAt / currentIntervalDays / consecutiveCorrect | 全部未变 |
| NEW_DATABASE_SCHEMA / MIGRATION | NO |
| NEW_M3_EVAL_RUN | NO；M3 **PAUSED**；019/020/023/025/030/035 未动 |
| 真实凭据 | 仅从 `.env.local` 进程内读取；未打印/未入 Git/未入 eval JSON/未入 docs |
| GOLD_DISPUTE | 1（M45\|seed-016，原 label 保留统计） |

## P2.10 Reproducibility / Cost

- 复跑：`$env:LLM_PRIMARY_PROVIDER=deepseek`（配 `.env.local`）；`$env:EVAL_RUN=1|2|3`；`$env:EVAL_PREFIX=real-run`；`npx vitest run --config tests/eval/vitest.eval.config.ts tests/eval/product-loop-04c/evidence-quality.eval.test.ts`。
- 真实调用：**159 次**（53×3）；avg latency ≈ **8.4s/call**；total ≈ 22.3 min（三轮）。
- tokens / approx cost：**NOT_AVAILABLE**（harness 未采集 usage；不估算伪数据）。
- 非确定性声明：deepseek-chat 非完全 deterministic；三轮结果已按 §12/§13 如实分列（不挑最优）。
---
