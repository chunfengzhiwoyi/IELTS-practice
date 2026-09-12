# PRODUCT-LOOP-04-FINAL-E2E — Speaking→Vocabulary 应用能力闭环最终端到端验收

- **AGENT**: 豆包c
- **TASK_ID**: PRODUCT-LOOP-04-FINAL-E2E
- **CANONICAL_BASE**: `494eb6937fb82f4a5d30310477c1287d3420b8a5`（`repo/arch-consolidate`，worktree clean）
- **WORKTREE**: `D:\Codex\_worktrees\IELTS-practice\PRODUCT-LOOP-04-FINAL-E2E`
- **BRANCH**: `audit/product-loop-04-final-e2e`
- **M3**: PAUSED（未创建任何 M3 RUN_ID，未推进 019/020/023/025/030/035 lifecycle）

---

## 1. Scope

验证 PRODUCT-LOOP-04 整条产品链路是否真实成立：

```
用户学过表达 → Speaking session（frozen suggestedExpressions）
  → 真实 LLM analyze → strict validator → validated CORRECT（grounded）
  → Evidence History 持久化 → applicationLevel 派生写回
  → target-selection 行为变化（Level 2 优先级下降但不排除）
  → Planner 不读取 applicationLevel（独立）
```

本轮**未**新增功能 / 调整阈值 / 优化 prompt / 重构 repository / 修改 Planner。
**PRODUCT_CODE_MODIFIED: NO**（仅新增 3 个测试文件 + 1 个 eval config + 1 份本报告）。

## 2. Test Architecture（三层）

| Layer | 文件 | 模式 | 覆盖 |
|---|---|---|---|
| A — Real User Path | `tests/eval/product-loop-04-final-e2e-real.test.ts` | 真实 deepseek/deepseek-chat，走真实 API routes | session 创建→冻结 target→真实 analyze→validator→持久化→写回 |
| B — Deterministic State | `tests/unit/product-loop-04-final-e2e.test.ts` | memory + mock，生产 derive/写回函数 | 0→1→2 故事、负例、假阳性安全、重算、不变量 |
| C — Downstream | 同上（Layer B 文件内） | 生产 selectTargetExpressions / planToday | target-selection counterfactual、Planner 独立性 |

复用既有冻结资产：04E 单测 T19–T31（derive/writeback/rebuild）、04B validator/语义契约/状态完整性测试、02C/02D、02-E2E、Planner 回归。

## 3. Real LLM Path（Layer A）

- **Provider / Model**: `deepseek` / `deepseek-chat`（产品正式配置；temperature 0.3 由 analyzer 固定）
- **真实调用数**: **5 次**（E04–E07 首析 ×1；E08 首析+重复 ×2；E09 两独立 session ×2）
- **证据**: 日志 `actual_provider=deepseek`、`fallback_used=false`、`model=deepseek-chat`；`model_call status=ok`
- **延迟**: ~7.1s / ~8.2s / ~8.5s（真实 LLM 往返；部分调用出现一次 `MODEL_SCHEMA_MISMATCH` repair，repair 后 schema 通过，未触发 fallback）
- **REAL_LLM_CALL_EXECUTED: YES**（不是 mock，不是 fallback-only——CORRECT evidence 只有真实模型能产出，mock fallback 恒为保守 UNCERTAIN）

关键断言（E04–E07）全部 PASS：
- 真实回答 `I think many people take their health for granted until something goes wrong...` → `assessment=CORRECT`、`upgradeCandidate=true`、quote grounded
- Evidence History 落库 1 条（幂等键 userId/itemId/sessionId），pipelineVersion=`04B-validator-1`
- `applicationLevel` 仍 **0**；recallLevel/status/nextReviewAt/currentIntervalDays/consecutiveCorrect 全部不变

## 4. Level 0 → 1 → 2 完整产品故事

产品表达式：**take something for granted**（seed-003，PHRASE，topicTags=`daily`/`ielts-part1`）

| Step | Session | Context | Day | Evidence 来源 | applicationLevel |
|---|---|---|---|---|---|
| Initial | — | — | — | 无 qualifying CORRECT | 0 |
| S1 | spk-s1（sp-p1-001 Daily Routine） | q=sp-p1-001 | D1 | **REAL LLM** CORRECT | **0**（单条不晋级） |
| S2 | spk-s2（sp-p1-001） | q=sp-p1-001 | D2 | **REAL LLM** CORRECT | **1**（EMERGING_APPLICATION） |
| S3 | spk-s3（sp-p3-003 Work-Life Balance） | q=sp-p3-003 | D3 | **CONTROLLED_EVIDENCE_FIXTURE** CORRECT | **2**（STABLE_APPLICATION） |

- **REAL_LLM_EVIDENCE_COUNT（故事路径）**: 2（S1、S2 真实模型生成）
- **CONTROLLED_TEST_EVIDENCE_COUNT（故事路径）**: 1（S3，按任务 §21/§41 明确标注；fixture 走真实 `buildApplicationEvidenceRecord` + 真实 repository + 真实 derive）
- **LEVEL_2_TIME_SETUP**: `CONTROLLED_EVIDENCE_FIXTURE`（预期，不算失败；原因见 §9 P2-1）

### 证据审计（为什么是 Level 2）

| # | sessionId | questionId | topic | recordedAt（day） | assessment |
|---|---|---|---|---|---|
| 1 | spk-s1 | sp-p1-001 | Daily Routine | 2026-09-01 | CORRECT |
| 2 | spk-s2 | sp-p1-001 | Daily Routine | 2026-09-02 | CORRECT |
| 3 | spk-s3 | sp-p3-003 | Work-Life Balance | 2026-09-05 | CORRECT |

C=3（≥3）· sessions=3 · days=3（≥2）· contexts=2（≥2）→ `deriveApplicationLevel` → **2**。
满足 04D 冻结规则 `>=3 CORRECT / >=3 sessions / >=2 days / >=2 contexts`（K = max(distinct questionId, distinct topic)）。

## 5. State Invariant Table

| FIELD | Before | After Level 1 | After Level 2 | Expected | 结果 |
|---|---|---|---|---|---|
| applicationLevel | 0 | 1 | 2 | 仅此项可变 | ✅ |
| recallLevel | 1 | 1 | 1 | 不变 | ✅ |
| status | RECALLED_WITH_HELP | 不变 | 不变 | 不变 | ✅ |
| nextReviewAt | 2026-10-01 | 不变 | 不变 | 不变 | ✅ |
| currentIntervalDays | 3 | 3 | 3 | 不变 | ✅ |
| consecutiveCorrect | 2 | 2 | 2 | 不变 | ✅ |
| recognitionLevel | 1 | 1 | 1 | 不变 | ✅ |

## 6. 关键安全不变量（E16–E19 / E46）

| Case | 内容 | 结果 |
|---|---|---|
| E08 | 同 session 重复 analyze → 仍 1 条 evidence、Level 0（幂等） | ✅ PASS（真实 LLM 路径亦验证） |
| E16 | 人为置 applicationLevel=0 → `recomputeAndWriteApplicationLevel` 恢复 **2**（Evidence History = SSOT） | ✅ PASS |
| E17 | Level 2 后新增 ISSUE → 仍 2（ISSUE 不降级，只记录） | ✅ PASS |
| E18 | NOT_USED → 完全 NO-OP（Level/recall/nextReviewAt 均不变） | ✅ PASS |
| E19 | UNCERTAIN → 完全 NO-OP | ✅ PASS |
| E46 | **单条（假阳性）CORRECT → 仍 Level 0**（最重要安全不变量） | ✅ PASS |
| E45-1 | 3 sessions / 3 CORRECT / 同日 / 跨语境 → Level 1（防 OR 误实现） | ✅ PASS |
| E45-2 | 3 sessions / 3 CORRECT / 跨日 / 同语境 → Level 1（防 OR 误实现） | ✅ PASS |

## 7. 下游行为（Layer C）

### target-selection 对 applicationLevel 的响应（E20）

同一候选（seed-003，RECALLED_WITH_HELP），仅 applicationLevel 0 vs 2：

| applicationLevel | score 贡献 | 结果 |
|---|---|---|
| 0 | +2(status) +1(appLevel==0) +1(PHRASE) = 4 | 入选，更高优先级 |
| 2 | +2(status) −1(appLevel>=2) +1(PHRASE) = 2 | 仍入选（不永久排除），优先级降低 |

**TARGET_SELECTION_APPLICATION_LEVEL_EFFECT: PASS** —— 派生状态确实改变后续 Speaking 出题行为。

### Planner 独立性（E21）

- `PlannerInput` **结构上不包含 applicationLevel**（代码层面确认；运行时断言 `Object.keys(base)` 不含该字段）
- 相同输入 → `planToday` 输出 deep-equal
- **PLANNER_APPLICATION_LEVEL_INDEPENDENCE: PASS**（预期行为，非缺陷；04D §40 / 04E 文档明示）

## 8. 回归汇总

| 套件 | 结果 |
|---|---|
| 04-FINAL-E2E Layer B/C（确定性，新增） | 13/13 PASS |
| 04-FINAL-E2E Layer A（真实 LLM，新增） | 5/5 PASS |
| 04E focused（derivation/persistence/writeback） | PASS |
| 04B focused（safety/semantic-contract/state-integrity/validator/wiring） | PASS |
| 02C / 02D / 02-E2E | PASS（02D 含 Band leakage fallback 安全——fallback 下不产生 qualifying CORRECT） |
| Planner（planner-v1 / 03A-regression） | PASS |
| badcase-026 retrieval-conflict | PASS |
| 04C deterministic harness（mock，`EVAL_PREFIX=regress`，**未触碰冻结 real-run 产物**） | PASS（LLM 不可用→fallback→全部保守，无 FALSE_CORRECT / 无晋级） |
| **Full unit** | **631/632 PASS（1 项既存失败，见 §10）** |
| typecheck（tsc --noEmit） | PASS |
| **Web build（next build）** | PASS |

**04C 159 次真实调用未重跑**（已冻结于 canonical `tests/eval/product-loop-04c/real-run-*.json`，任务 §50 明示禁止）。

## 9. Known Boundaries（如实披露）

### P2-1（重要产品发现）— 跨语境 Level 2 在生产出题路径下结构性不可达

- 题库仅 12 题；扫描全部 PHRASE/CHUNK seed：8 个可在题库找到自然匹配，但 **0 个有 ≥2 个不同匹配 tag**。
- seed-003 的 `daily` 仅命中 sp-p1-001（Daily Routine）；`ielts-part1` 与任何题目文本无子串重叠 → 任何表达的真实自然匹配语境都只有 1 个。
- 结论：**当前题库/匹配轴下，`applicationLevel=2`（STABLE_APPLICATION）状态机正确，但生产路径无法自然达到**。State mapping 逻辑本身无缺陷（负例/重算/审计全部 PASS），缺口在「覆盖轴」：需要扩展题库（≥2 个可匹配语境）或细化 topicTags。建议作为后续 targeted fix（题库扩展或匹配轴增强），**不阻塞本闭环的正确性验收**。

### P2-2 — REMOTE_SUPABASE_DEPLOYMENT_VERIFIED: NO

Supabase repository 语义（mapping parity）在实现层验证过；**远程部署 + 真实 insert/upsert/select/RLS 属于下一阶段 production persistence verification**，按任务 §38 不阻塞 COMPLETE。

### P2-3 — 04C 金标遗留

M45（seed-016）GOLD_DISPUTE 已由 04D 裁定 `FUTURE_GOLD_V2_RECOMMEND_CORRECT`，历史 04C metrics 保持冻结不改写。

### 既有测试债（非本任务引入）

- `tests/unit/llm-safety.test.ts` 在 494eb69 即失败：`components/account/ModelSettingsPanel.tsx`（`"use client"`，commit 71a00cf，早于全部 Loop-04 工作）imports `@/lib/llm/catalog`，违反该测试「client 组件不得 import @/lib/llm」的断言。本任务未触碰该组件（PRODUCT_CODE_MODIFIED=NO），如实计入 **CURRENT_REPRODUCIBLE_TEST_DEBT**。

## 10. Failure Classification

| 级别 | 数量 | 说明 |
|---|---|---|
| P0 | 0 | 无状态污染 / 无错误晋级 / 无安全边界失效 |
| P1 | 0 | 核心 E2E 链完整 |
| P2 | 3 | 题库跨语境覆盖（P2-1）、REMOTE_SUPABASE 未部署验证（P2-2）、04C 金标 dispute（P2-3） |
| P3 | 1 | llm-safety 既存测试债（非本任务引入） |

## 11. Product Decision

**PRODUCT_LOOP_04_COMPLETE**

- 核心用户故事（学→建议→真实使用→validated evidence→History→派生→downstream 行为）**成立**
- State safety（不变量 / 负例 / 假阳性 / 重算）**全部通过**
- Downstream（target-selection 响应 / Planner 独立）**验证通过**
- 真实 LLM 路径（deepseek）**验证通过**，REAL_LLM_CALL_EXECUTED=YES

**Completion ≠ production complete**：远程 Supabase 部署验证、跨设备验证、IELTS 学习功效科学证明仍属下一阶段，未在本报告宣称。

## 12. Suggested Next Phase

1. **题库/匹配轴扩展**（P2-1 的直接对应）：使跨语境 Level 2 在生产路径可自然达到（新增 ≥2 个可匹配语境，或细化 topicTags 匹配轴）。
2. **PRODUCTION PERSISTENCE VERIFICATION**：将 migration 0010 部署到远程 Supabase，完成真实 evidence write/read + RLS 隔离 + applicationLevel recompute。
3. （可选）处理 llm-safety 既有测试债（组件 import 治理或测试规则澄清）——需 Control Plane 单独裁决，本任务未动。

---
*本报告所有数字来自本任务实际执行：5 次真实 LLM 调用（deepseek-chat）、13+5 新增 E2E 断言、191 聚焦回归、632 全量单测、typecheck、next build。未重新运行 04C 159 次真实调用。*
