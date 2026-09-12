# PRODUCT-LOOP-04E — Application Evidence History & applicationLevel 实现

状态：IMPLEMENTED（独立 worktree 内，未 merge canonical）
任务卡：PRODUCT-LOOP-04E（IMPLEMENT，PARENT=PRODUCT-LOOP-04，SPEAKING_TO_VOCAB_V1_1）
实现依据：`docs/product/PRODUCT-LOOP-04D-STATE-MAPPING-DESIGN.md`（04D，冻结语义）
本机日期：2026-09-12

---

## 1. 目标与边界

04E 第一次实现「Validated Speaking Evidence → Persistent Evidence History → 确定性派生 → applicationLevel 0/1/2」。

系统现在能区分：
- 「这个表达我见过/记得」（recall/recognition 状态）
- 「这个表达我在真实口语里多次正确使用」（application evidence）

**严格边界（冻结）**：
- 只允许 Speaking Evidence 影响 `applicationLevel`。
- 禁止修改：`recallLevel`、`status`、`nextReviewAt`、`currentIntervalDays`、`consecutiveCorrect`、review schedule。
- `applicationLevel = 2` 不等于 `MASTERED`；status 语义不变。
- Planner 不读取 applicationLevel；target-selection 逻辑未改（applicationLevel 0 → 练习机会 +1；≥2 → −1；不永久排除）。
- Report V1 不重做 UI。
- 无自动降级（ISSUE 只记录）、无 time decay（V1 明确为 heuristic）。

---

## 2. Evidence History（SSOT）

### 2.1 领域类型

`lib/learning/application-evidence.ts`：

- `ApplicationLevel = 0 | 1 | 2`
  - 0 = NO_STABLE_APPLICATION_EVIDENCE
  - 1 = EMERGING_APPLICATION
  - 2 = STABLE_APPLICATION
- `ApplicationEvidenceRecord` 至少包含：
  - `evidenceId`、`userId`、`itemId`、`sessionId`
  - `questionId`（nullable）、`part`（P1/P2/P3）、`topic`
  - `assessment`: CORRECT | ISSUE | UNCERTAIN | NOT_USED
  - `quote`（nullable）、`reason`
  - `validatorNotes: string[]`、`upgradeCandidate: boolean`
  - `recoveredViaRetry: boolean`
  - `recordedAt`（ISO UTC）
  - `pipelineVersion`（>= "04B-validator-1" 才参与晋级）
  - `provider` / `model`（nullable provenance）

### 2.2 SSOT 模型

- **Evidence History 是 application ability 的事实源**。
- `applicationLevel` 是 **materialized derived state / cache**，每次 evidence upsert 后由 `deriveApplicationLevel()` 重算并写回 UserItemState.applicationLevel。
- 禁止 `applicationLevel += 1` 式实现；必须走纯函数派生。

### 2.3 唯一性 / 幂等

- 唯一键：`(userId, itemId, sessionId)`。
- 同 session 同 item 最多一条 final evidence；重复 analyze / 页面刷新 / retry 不能重复累计成多个独立能力证据。
- retry 语义：first=ISSUE、second=CORRECT 时 upsert 覆盖为 CORRECT，`recoveredViaRetry=true`，仍只算 1 个 session evidence。
- 不同 session 的 evidence 各自独立成条。

---

## 3. deriveApplicationLevel — 纯函数派生规则

`deriveApplicationLevel(evidenceHistory: ApplicationEvidenceRecord[]): ApplicationLevel`

性质：deterministic / idempotent / order-insensitive / recomputable。

1. 过滤：`assessment === "CORRECT" && upgradeCandidate === true && pipelineVersion >= "04B-validator-1"`。
2. 按 session 去重（每 session 取一条；冲突时按 ASSESSMENT_PRIORITY + recordedAt 决胜）。
3. 计数：
   - C = 去重后 CORRECT session 数
   - D = distinct 日历日（recordedAt 的 UTC 日期，`slice(0,10)`）
   - K = distinct context 数 = max(distinct questionId, distinct topic)（04D 较大口径，确定性、无 LLM）
4. 规则：
   - C < 2 → 0（单条 CORRECT 不晋级；孤立假阳性无法晋级）
   - C == 2 → 1（同一天允许 L1）
   - C >= 3 且 D >= 2 且 K >= 2 → 2
   - 其他 C >= 3 → 1

ISSUE：记录 evidence，不降级。NOT_USED / UNCERTAIN：NO_OP，不改变 level。

---

## 4. Repository 双实现

### 4.1 Memory（reference）

`lib/learning/repositories/memory-application-evidence-repository.ts`
- Map 存储，key = `userId::itemId::sessionId`。
- `upsertApplicationEvidence`（幂等覆盖）、`getApplicationEvidence`、`listApplicationEvidence`（按 recordedAt 排序）。

### 4.2 Supabase（durable）

`lib/learning/repositories/supabase-application-evidence-repository.ts`
- 导出 `mapApplicationEvidenceRowToDomain` / `mapApplicationEvidenceToRow`（供 mapping parity 测试）。
- upsert 使用 `onConflict("user_id,item_id,session_id")`。

### 4.3 Factory

`lib/repository-factory.ts` 新增 `getApplicationEvidenceRepository()`：
- DATA_PROVIDER=supabase → Supabase 实现；否则 Memory。
- 加入 `_resetRepositories()` 重置集合。

### 4.4 Migration（0010）

`supabase/migrations/0010_application_evidence.sql`
- **命名依据**：active migrations 为 0001–0008；`docs/deferred/supabase/0009_p6_instrumentation.sql` 已占用 0009 且必须保持 deferred → 04E 用 0010。
- 表 `application_evidence`：
  - id uuid PK、user_id（FK users）、item_id、session_id
  - question_id nullable、part CHECK(P1/P2/P3)、topic
  - assessment CHECK(CORRECT/ISSUE/UNCERTAIN/NOT_USED)、quote nullable、reason
  - validator_notes text[]、upgrade_candidate bool、recovered_via_retry bool
  - recorded_at timestamptz、pipeline_version（默认 '04B-validator-1'）、provider nullable、model nullable
  - UNIQUE(user_id, item_id, session_id)、INDEX(user_id, item_id)
- RLS：跟随现有 user_id 模式（select/insert/update own policies）。

**授权**：Control Plane 已在状态文件中明确授权 04E 的 focused Supabase migration，且仅限 Application Evidence History 持久化。

---

## 5. Speaking Analyze 落库钩子

`app/api/speaking/analyze/route.ts`（state.write speaking_session 之后、ability observations 之前）：

- `recordApplicationEvidenceFromAnalysis({ userId, session: updatedSession, analysis, isSecondAnswer, learningRepo, evidenceRepo })`
- 只接收 **validated** evidence（validator 固化后），拒绝 raw LLM output。
- server-authority 过滤：evidence.itemId 必须属于 session frozen `suggestedExpressions`；客户端伪造 itemId 被丢弃。
- 每 target：upsert evidence（幂等）→ 重算 applicationLevel → 写回 UserItemState.applicationLevel。
- try/catch：evidence 写失败不阻断主 Speaking 流程（与 ability/evaluation 写失败同策略）。
- trace：`state.write` entity=`application_evidence`、`idempotency_outcome="inserted"`（沿用现有 trace contract 字面量 union）、`application_evidence_persisted_flag`（trace-contract 新增 optional 字段，先例为 observation_persisted_flag）。

---

## 6. State Invariants（测试保证）

- T24–T29：多次 CORRECT 后，仅 applicationLevel 变化；recallLevel / status / nextReviewAt / currentIntervalDays / consecutiveCorrect / review schedule 全部不变。
- T30–T31：applicationLevel cache 被手动写错后，`recomputeApplicationLevelFromEvidence` 可从 history 恢复正确值；空 history → 0。

---

## 7. Rebuildability

- `recomputeApplicationLevelFromEvidence(evidenceRepo, userId, itemId)`：纯读取 + 派生，不写状态。
- `recomputeAndWriteApplicationLevel(learningRepo, evidenceRepo, userId, itemId)`：重算并写回缓存字段；用户无该词 UserItemState 时不创建状态（无 evidence 历史 → 默认 0）。

---

## 8. 测试

- `tests/unit/product-loop-04e-derivation.test.ts`（35）：T01–T12 + 04D 场景表 S01–S20 + K-max 口径场景。
- `tests/unit/product-loop-04e-persistence.test.ts`（8）：Memory 幂等 / 唯一 / 排序 / Supabase mapping parity + roundtrip / user isolation / no evidence→0。
- `tests/unit/product-loop-04e-writeback.test.ts`（12）：service 层 T19–T23 + T24–T31 + 3 个 route 级端到端（1 CORRECT→0；retry 合并 recoveredViaRetry；2 真实 session→1）。
- **合计 55/55 PASS**。

route 级测试配方：`AUTH_MODE=demo / DATA_PROVIDER=memory / LLM_PRIMARY_PROVIDER=mock / LLM_FALLBACK_ENABLED=false / DEMO_REVIEW_SEED_ENABLED=false`；用户 `demo-user-001`；`{part:"P1", topic:"daily"}` 自动选题稳定带出 seed-003（take something for granted）作为 suggestedExpressions；mock evidence 的 quote 必须是用户 answer 的**连续子串**（validator grounding 会将 `quote_not_grounded_to_answer` 降级为 UNCERTAIN）。

---

## 9. 回归与验证（本 worktree 实测）

- 04E 新增：55/55 PASS
- 回归（04B evidence + 02C + 02D + PRODUCT-LOOP-02 E2E + planner + today）：183/183 PASS
- full unit：618 PASS / 1 FAIL
  - 唯一失败：`tests/unit/llm-safety.test.ts` ModelSettingsPanel static check —— **pre-existing debt**（历史各轮一致）。
  - env.test 未失败（04E worktree 无根 .env.local；canonical 根存在 .env.local 时该测试为 ENVIRONMENT_DEPENDENT）。
- typecheck：PASS
- Web build：PASS

**pre-existing typecheck 修复说明**：canonical（0d9f0c4）上 `npx tsc --noEmit` 本已 FAIL —— 04C 集成时引入的 3 处 eval 测试类型错误（`tests/eval/product-loop-04c/evidence-quality.eval.test.ts` 2 处、`probe-real-llm.test.ts` 1 处，均为 `SpeakingQuestion | null` 非空断言）。04E 以**最小类型级修复（仅非空断言，零行为变化）**恢复 typecheck 基线，记录为 pre-existing 而非 04E 功能改动。

---

## 10. Status Semantics（本任务可宣布的上限）

- APPLICATION_EVIDENCE_HISTORY: IMPLEMENTED
- APPLICATION_LEVEL_DERIVATION: IMPLEMENTED
- APPLICATION_LEVEL_WRITEBACK: ENABLED_FROM_VALIDATED_HISTORY

**不得宣布**：VOCABULARY MASTERED / IELTS ability proven / Recall changed / Review schedule improved / Speaking→Vocabulary closed loop complete。

---

## 11. Known Limitations（heuristic 假设）

- applicationLevel 单调不降、无 decay —— `HEURISTIC_NOT_PEDAGOGICALLY_VALIDATED`。
- 2 次 CORRECT 晋级 L1、3 次（≥2 天、≥2 context）晋级 L2 的阈值本身未经教学法实证。
- target-selection 的 ±1 偏好是既有行为，未在本任务重写。
- Supabase evidence 持久化已实现（migration 0010），但未做跨设备/真实 Supabase 环境 E2E 验证（本任务在 memory provider 下验证）。
- Report UI 未展示 application summary（推迟到 04F / Final E2E）。

---

## 12. 产物清单（本 worktree）

- 新增：`lib/learning/application-evidence.ts`
- 新增：`lib/learning/repositories/memory-application-evidence-repository.ts`
- 新增：`lib/learning/repositories/supabase-application-evidence-repository.ts`
- 新增：`supabase/migrations/0010_application_evidence.sql`
- 修改：`lib/repository-factory.ts`（getApplicationEvidenceRepository）
- 修改：`app/api/speaking/analyze/route.ts`（04E 落库钩子）
- 修改：`lib/observability/trace-contract.ts`（application_evidence_persisted_flag optional）
- 新增：`tests/unit/product-loop-04e-{derivation,persistence,writeback}.test.ts`
- 类型级修复（pre-existing）：`tests/eval/product-loop-04c/evidence-quality.eval.test.ts`、`tests/eval/product-loop-04c/probe-real-llm.test.ts`
