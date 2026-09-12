# PRODUCT-LOOP-04E-INTEGRATION — 集成记录

状态：COMPLETE（canonical 已集成）
任务卡：PRODUCT-LOOP-04E-INTEGRATE（SERIAL_PRODUCT_INTEGRATION）
集成日期：2026-09-12

---

## 1. Canonical 基线

- CANONICAL_HEAD_BEFORE: `0d9f0c4`（04D state sync 后；branch=repo/arch-consolidate，worktree clean）
- SOURCE_COMMIT: `5c6108631b634504636588dfb1c52b6090d99daf`（04E，branch feature/product-loop-04e-application-state）
- INTEGRATED_COMMIT: `a16772a`（cherry-pick，0 冲突）
- STATE_COMMIT: 本记录 commit（chore(product): integrate application evidence state writeback）

## 2. Source Scope 审查

13 files / +1842 / −4，全部在允许列表：

| 类别 | 文件 | 判定 |
|---|---|---|
| 核心实现 | lib/learning/application-evidence.ts | 允许 |
| Memory repo | lib/learning/repositories/memory-application-evidence-repository.ts | 允许 |
| Supabase repo | lib/learning/repositories/supabase-application-evidence-repository.ts | 允许 |
| Migration | supabase/migrations/0010_application_evidence.sql | 允许（004E 授权） |
| 集成点 | lib/repository-factory.ts / app/api/speaking/analyze/route.ts | 允许 |
| Trace | lib/observability/trace-contract.ts（+1 optional flag） | 允许 |
| 测试 | tests/unit/product-loop-04e-{derivation,persistence,writeback}.test.ts | 允许 |
| 文档 | docs/product/PRODUCT-LOOP-04E-APPLICATION-STATE-IMPLEMENTATION.md | 允许 |
| Type-only | tests/eval/product-loop-04c/{evidence-quality.eval,probe-real-llm}.test.ts | 允许（pre-existing tsc 基线） |

未包含：Planner 行为 / recall 调度 / status 语义 / Goal persistence / UI 重设计 / M3 lifecycle / 0009 激活。

## 3. Type-only Baseline Fix 审计

canonical 0d9f0c4 上 `npx tsc --noEmit` 本就 FAIL（04C 集成引入 3 处 eval 测试类型错误）。

04E 修复（3 处，全部非空断言 `!`）：
- evidence-quality.eval.test.ts:116 `cse.gold[0]!.itemId`
- evidence-quality.eval.test.ts:127 `question!`
- probe-real-llm.test.ts:28 `question!`

判定：**TEST_ONLY_TYPE_FIX: YES / RUNTIME_BEHAVIOR_CHANGED: NO**（编译期断言，零运行时变化）。

## 4. Trace Contract 审查

- 新增 `application_evidence_persisted_flag?: boolean`（optional，先例 `observation_persisted_flag`）。
- `state.write` entity=`application_evidence`、`idempotency_outcome="inserted"`（沿用现有字面量 union）。
- **TRACE_BACKWARD_COMPATIBLE: YES**（optional 字段不破坏旧 trace 解析）。

## 5. Evidence SSOT 审计

- Evidence History = application ability 唯一事实源；`applicationLevel` = materialized derived cache。
- `deriveApplicationLevel(history)` 纯函数：deterministic / idempotent / order-insensitive / recomputable。
- 无 `applicationLevel += 1` 式逻辑。
- `recomputeAndWriteApplicationLevel` 只改 applicationLevel 字段，其余字段原样保留；无状态词条不创建。

## 6. Level Semantics（冻结确认）

- Level 0: NO_STABLE_APPLICATION_EVIDENCE
- Level 1: ≥2 validated CORRECT across ≥2 distinct sessions（同 session 去重）
- Level 2: ≥3 CORRECT / ≥3 sessions / ≥2 calendar days / ≥2 contexts
- ONE_CORRECT_PROMOTES: NO（1 CORRECT → 0）
- SAME_SESSION_DEDUPE: YES（(userId,itemId,sessionId) 唯一 + upsert；retry 合并 recoveredViaRetry）
- Qualifying: validated CORRECT only（upgradeCandidate + pipelineVersion≥04B-validator-1）
- ISSUE: 记录不降级；NOT_USED/UNCERTAIN: NO_OP
- No demotion / no decay（V1）
- Historical users: 无 evidence → 0，不从 recall/status/review 反推
- REBUILDABLE: YES（recomputeApplicationLevelFromEvidence 恢复人为写错的 cache；测试 T30/T31）

## 7. State Integrity

Speaking evidence writeback 只允许改变 applicationLevel。测试 T24–T29 确认：recallLevel / status / nextReviewAt / currentIntervalDays / consecutiveCorrect / review schedule 全部不变。

## 8. Migration 0010 审查

- 只创建 `application_evidence` + UNIQUE(user_id,item_id,session_id) + index(user_id,item_id) + RLS。**MIGRATION_SCOPE: FOCUSED**
- 不依赖 deferred 0009（0009 保持 docs/deferred，未激活）。**DEPENDS_ON_0009: NO**
- 列覆盖 04D mapping：question_id/topic 足以派生 context（K=max(distinct questionId, distinct topic)），无需单独 context_key 列。
- user_id FK → public.users（0001 存在）✓；item_id/session_id 与现有 repo 类型兼容。
- **RLS_USER_ISOLATION: YES**（user_id = auth.uid()，select/insert/update own）。
- **UNIQUE_SESSION_ITEM: YES**（DB 级唯一约束 + application code upsert 双保险）。

## 9. Supabase Truth Label（重要区分）

- **SUPABASE_PERSISTENCE_IMPLEMENTED: YES**（migration 0010 + Supabase repository + mapping parity 测试）
- **REMOTE_SUPABASE_DEPLOYMENT_VERIFIED: NO**
- **REMOTE_SUPABASE_EVIDENCE_WRITE_READ: NOT_TESTED**

本任务未连接远程 Supabase、未部署 0010、未做真实写读验证。不得宣称 production persistence complete。

## 10. 验证结果（canonical 实测）

- 04E focused tests: **55/55 PASS**
- 回归（04B evidence + speaking completion + 02C + 02D + PRODUCT-LOOP-02 E2E + planner + today）: **183/183 PASS**
- full unit: **617 PASS / 2 FAIL**
  - llm-safety（1）：ModelSettingsPanel static debt —— pre-existing，全环境复现
  - env.test（1）：.env.local 真实 Supabase URL 环境差异 —— ENVIRONMENT_DEPENDENT（04E worktree 无该文件时通过）
- `npx tsc --noEmit`: **PASS**
- `npx next build`: **PASS**（41/41）

## 11. Secret Safety

- `.env.local` 未 tracked（git ls-files 无匹配）
- 04E commit 无 API key / Supabase secret / token / Authorization 模式

## 12. 状态

- CURRENT-PROJECT-STATE.md 更新（PRODUCT_LOOP_04E 段，含 REMOTE_SUPABASE_DEPLOYMENT_VERIFIED=NO 的诚实标注）
- NEXT_GATE: **PRODUCT-LOOP-04-FINAL-E2E**
- M3: PAUSED
- 本任务未新增产品功能
