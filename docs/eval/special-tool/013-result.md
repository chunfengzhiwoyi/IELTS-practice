# ELS-EVAL-013 — Special Tool Result（replay harness）

**Run**: `m3-20260910-081624`（39/39 registered，44 tests PASS）
**Result**: **PASS**
**Tool**: `tests/eval/tools/replay-harness.ts`（Eval-only）
**Product 依赖**: MemoryLearningRepository（`_getAllEvents/_getAllStates/getUserEventsInRange`）+ learn/review submit 幂等分支（`created=false` → 既有 event + `x-idempotent-replay:true`，不推进状态）

## 1. Frozen Gold 契约（ELS_EVALUATION_V1_1）

- **语义**: S1 / LEARNING_STATE_MEMORY / CURRENT=FAIL / FUTURE_TARGET
- **precondition**: 空用户 + 脚本序列 S（3 词 learn × 若干提交；复习若干轮；1 次重复 clientEventId）
- **pass_criteria**:
  1. `replay(events) == user_item_states` 逐字段比较
  2. events 无重复 client_event_id
  3. 快照 updated_at 单调（不倒退）
- **must_not**: 事件与状态分叉 / 重复事件进流 / 重放 ≠ 快照

## 2. 执行设计

冻结时钟（fake timers `toFake:["Date"]`，M3-P1 已验证）→ 执行脚本序列 S（learn 3 词 × 提交、review 4 轮、1 次重复 clientEventId）→ 从 Repository 取真实事件流与状态快照 → 重放器以事件 createdAt 为锚调用**产品纯函数**（`computeInitialReviewAt` / `computeReviewNextAt` / `initialIntervalDays`）→ 层级字段（status/recognition/recall/consecutive/interval）镜像路由内联确定性规则 → 逐字段比对快照。

**与产品差异处理**: learn/review 路由的状态转换无独立纯函数可复用（judgeLearnAnswer / mapResultToStatusAndFeedback + computeIntervalDays 内联于路由），重放器逐行核对实现后镜像。Gold 明确允许"产品行为正确但 Runner 无重放工具 → 解决 Runner"（本轮即此情形：**EVAL_TOOL_MISSING 已消除，非 PRODUCT_FAIL**）。

## 3. 实测证据（run m3-20260910-081624）

| Row | 断言 | Actual |
|---|---|---|
| r1-replay-eq-snapshot | replay(events) 逐字段 == snapshot | `{matches:true, diffCount:0}`（10 字段/3 item 全一致） |
| r2-no-dup-client-event-id | 无重复 clientEventId | `{unique:true, count:7}`（learn×3 + review×4，全唯一） |
| r3-updated-at-monotonic | updated_at 单调 | `{monotonic:true}` |
| r4-dup-no-advance | 重复 clientEventId 幂等 | `{eventCountW1:2, dupStatus:200, recallLevelAfterDup:2}`（重复不新增事件、不推进 recall） |

## 4. 判定

- 产品状态机：learn 24/8/2/2/4h（INDEPENDENT/HINTED/FAIL/SKIPPED/EXPOSED）、review 72/24/4/2h、intervalDays=小时/24、recall cap 2、consecutiveCorrect 正确+1 否则 0 —— 与重放结果一致。
- 幂等重放分支在 M1 已存在（`created=false`），本轮解决的是 **Runner 复现能力**：BLOCKED → **PASS**。
- 无 Bad Case 登记（无 FAIL）。
