# PRODUCT-LOOP-04AB-INTEGRATION

> 将 04A（Speaking→Vocabulary evidence audit，docs-only）与 04B（validated evidence pipeline，product）正式集成进入 canonical。
> 本任务只做集成/验证/状态收敛；不新增 evidence 质量优化、writeback、Supabase migration、新 LLM call、04C Eval。

## 1. 版本核对

| 项 | 值 |
|---|---|
| CANONICAL_HEAD_BEFORE | `0b7d7736fcee43d953a18c9e69ab9cbe1fc026cc` |
| 04A_SOURCE_COMMIT | `7761aa55275e70fe3e0aa037c0c964091c51edbb`（docs-only：audit doc + gold corpus） |
| 04B_SOURCE_COMMIT | `10bddd124a8d9514e55b5d427f650c4db8748d0f`（product implementation，base=0b7d773） |
| 04A_INTEGRATED_COMMIT | `2b7ac2c`（cherry-pick，0 conflict） |
| 04B_INTEGRATED_COMMIT | `a39e8f0`（cherry-pick，0 conflict） |

04A scope 核验：仅 `docs/product/PRODUCT-LOOP-04A-SPEAKING-VOCAB-EVIDENCE-AUDIT.md` + `docs/product/evidence-cases/gold-cases.json`，无产品代码 → PASS。
04B scope 核验：speaking types / validator / analyze task / session+analyze route / supabase repo toDomain / exports + 04B 测试 + docs + state；无 applicationLevel writeback、无 recallLevel/review schedule mutation、无 Supabase migration、无第二个 LLM call、无 planner 变更 → PASS。

## 2. Cherry-Pick 结果

- `git cherry-pick 7761aa5` → `2b7ac2c`：0 conflict（docs-only）。
- `git cherry-pick 10bddd1` → `a39e8f0`：0 conflict（04A 为 docs-only，04B 产品代码与 canonical 无冲突面）。
- 未 merge 任何 branch；未使用 ours/theirs 覆盖。

## 3. 集成后冻结产品语义（逐项确认）

| 语义 | 状态 |
|---|---|
| A. Vocabulary → Speaking suggestion 仍工作 | ✅（02C 回归 PASS） |
| B. session 创建时 frozen suggestedExpressions snapshot（itemId/canonicalForm/meaning） | ✅ |
| C. analyze 阶段使用 session frozen targets，不重新 select | ✅（T04 覆盖） |
| D. Speaking analyzer 仍只有 1 次 LLM runtime call | ✅（SECOND_LLM_CALL=NO） |
| E. LLM structured output 可返回 TargetExpressionUsageEvidence | ✅（EnhancedAnalysisSchema 可选子对象） |
| F. 确定性 validator 负责 whitelist/enum/grounding/missing/duplicate/unknown/contract conflict | ✅ |
| G. validated labels = CORRECT/ISSUE/UNCERTAIN/NOT_USED | ✅ |
| H. LONG_TERM_STATE_WRITEBACK=NO | ✅（见 §4） |

## 4. State Integrity Gate

Speaking analyze 产生 CORRECT evidence 后（T25–T28 + 集成回归确认）：
`applicationLevel` / `recallLevel` / `status` / `nextReviewAt` / `currentIntervalDays` / `consecutiveCorrect` / review schedule 全部不变。
集成 diff 全文检索：无 `applicationLevel +=`、`recallLevel +=`、`status = MASTERED`、因 Speaking evidence 修改 nextReviewAt 等路径 → **PASS**。

## 5. Wiring / Validator / Semantic Prompt / Quality Gates

- Wiring：session creation → frozen snapshot；analyze route → session lookup；analyze-speaking → frozen targets。客户端注入非 session itemId 无法进入 validated evidence（T05）。
- Validator：CORRECT+grounded→CORRECT；CORRECT+hallucinated→UNCERTAIN；ISSUE+grounded→ISSUE；NOT_USED+null→NOT_USED；NOT_USED+quote→safe downgrade；unknown→dropped；missing→UNCERTAIN；duplicate conflict→UNCERTAIN（T06–T14）。
- Semantic prompt：semantic misuse / definitional meta echo → 不得 CORRECT；natural inflection → 可 CORRECT；self-correction → 以最终明确 intent；ambiguous → UNCERTAIN；OPTIONAL 语义（NOT_USED ≠ 失败）。
- 02D band redline 兼容：BAND_SCORE_LEAK → force safe fallback；safe fallback 时全部 frozen targets → UNCERTAIN（无正向 CORRECT 存活）。
- LLM failure safe：malformed / unavailable / schema fail 均不能生成 CORRECT；Speaking core feedback 走现有 fallback（T21–T24）。
- Zero target safe：suggestedExpressions=[] → analysis 正常，validated evidence=[]（T03）。

## 6. Persistence Reality

- MEMORY repository：frozen snapshot + validated evidence 完整持久化。
- Supabase repository：`toDomain(... suggestedExpressions: (row.suggested_expressions as ...) ?? [])` 兼容读回（无列 → 恒 []）。
- **SUPABASE_EVIDENCE_PERSISTENCE = NOT_IMPLEMENTED**（已知边界，非本任务 blocker；无新 DB schema / migration）。
- **EVIDENCE_DURABILITY = PARTIAL**；不得写成 cross-device complete。
- **APPLICATION_LEVEL_SEMANTICS = SEMANTICS_PARTIAL**（04A 确认；dead/incomplete operational field；状态文件继续标 APPLICATION_LEVEL_WRITEBACK=DISABLED）。

## 7. 验证记录

| 项 | 结果 |
|---|---|
| 04B focused tests（T01–T29 + gold 回归） | **48/48 PASS** |
| 02A + 02C + 02D + badcase-019 + badcase-030 | **87/87 PASS**（与 04B 合并跑 135/135） |
| PRODUCT-LOOP-02 E2E（16） | **16/16 PASS**（CONTINUOUS_LEARNING_SYSTEM 未破坏） |
| Planner 回归（03A + v1 + today-api + today-plan-view） | **43/43 PASS**（合并 59/59） |
| Speaking completion（02A 路径，T29） | PASS（COMPLETED + 幂等） |
| full unit | **562 PASS / 2 FAIL** |
| typecheck | **PASS** |
| next build | **PASS** |
| worktree | clean |

full unit 2 个失败分类：
1. `llm-safety.test.ts` ModelSettingsPanel static check → **PRE_EXISTING_TEST_DEBT**（04B 未触碰任何 'use client' 文件；04B branch 上同样失败）。
2. `env.test.ts` Supabase 占位 URL 检测 → **ENVIRONMENT_DEPENDENT**（canonical 根存在 `.env.local` 真实 Supabase URL → isPlaceholderSupabase()=false；04B worktree 无该文件时 PASS）。非产品回归。

**CURRENT_REPRODUCIBLE_TEST_DEBT = 2**（llm-safety static + env.test environment-dependent）。

## 8. Remaining Boundary / Next Gate

- EVIDENCE_QUALITY = **NOT_YET_PROVEN**：unit 只验证 wiring/schema/validator/fallback；真实 CORRECT precision 需 04C 用真实模型跑 gold corpus。
- 任何长期状态写回（含 applicationLevel）仍 DISABLED。
- **NEXT_GATE = PRODUCT-LOOP-04C-EVIDENCE-QUALITY-EVAL**。
- M3 = **PAUSED**（020/023/025/035 UNVERIFIED；019/030 FIXED_PENDING_REGRESSION 1/3）。
