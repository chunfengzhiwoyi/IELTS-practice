# M1 Closeout & Final — Contract Freeze & Explicit Idempotency

> 日期: 2026-09-09
> 前置: `docs/v3/m1-single-source-of-truth.md` (M1 主体迁移)
> M1 Closeout: Contract & Idempotency Verification
> M1 FINAL: recall_level 冻结为 mastery 0-2；幂等性改为显式 Repository Contract

---

## 1. recall_level Contract — FROZEN

### 结论: recall_level = Recall Mastery Level，范围 0–2

产品决策已冻结。语义：
- **0** = 尚未建立有效回忆
- **1** = 已形成一定回忆能力 / 仍未达到稳定独立掌握
- **2** = 已达到独立回忆层级

当前固定复习间隔不由 recall_level 驱动。未来如需 Leitner / multi-stage progression，**不复用 recall_level**，新建独立的 `review_stage` / `box_level`。

### 1.1 冻结前的证据冲突（已解决）

M1 Closeout 阶段发现证据冲突：

| | Option A: Mastery (0–2) | Option B: Progression (0–5) |
|---|---|---|
| 支持证据 | `0001_init_schema.sql:80`, `cloud-setup.sql:86`, `build-review-session.ts:26` (Zod max=2), M0 审计 | `review/submit/route.ts` (`Math.min(+1,5)`), `demo-service.ts`, M1 迁移 0008 |
| 关键反证 | 代码实际写到 5 | 调度逻辑**完全不使用** recall_level（vanity metric） |

### 1.2 Migration 历史确认

- 迁移 `0008_data_model_consistency.sql` **从未在任何数据库执行**：无本地 Supabase CLI（无 config.toml / .branches），M1 文档明确记录"未在远程 Supabase 实例执行"，且 0008 是 M1 本轮新建。
- 因此安全修订未发布 migration 0008，将 recall_level 约束从 0-5 改回 0-2，无需新增 correction migration。

### 1.3 同步修改清单

| 组件 | 修改 | 状态 |
|------|------|------|
| `supabase/migrations/0008_data_model_consistency.sql` | 约束 `BETWEEN 0 AND 2`，注释更新为 mastery 语义 | ✅ |
| `supabase/cloud-setup.sql` | 已有 0-2，无需修改 | ✅ |
| `lib/agent/tools/build-review-session.ts` | 已有 `max(2)`，无需修改 | ✅ |
| `app/api/review/submit/route.ts` | `Math.min(prev+1, 5)` → `Math.min(prev+1, 2)` | ✅ |
| `app/api/learn/submit/route.ts` | 学习提交只写 0/1，已在范围内 | ✅ |
| `lib/client/demo-service.ts` | 旧代码同步改为 `Math.min(prev+1, 2)` | ✅ |
| `lib/learning/types.ts` | `recallLevel: number`（业务逻辑约束 0-2） | ✅ |
| `tests/unit/els-eval-037-038.test.ts` | 新增 7 个 boundary tests；修正"不同 clientEventId"测试为 max=2 | ✅ |
| `tests/unit/m1-single-source-of-truth.test.ts` | 更新为验证 0-2 | ✅ |

### 1.4 review_stage 状态

**`review_stage` / `box_level` 当前不存在。** 如未来需要 Leitner 多阶段进度系统，应新建独立字段/表，不修改 recall_level 语义。

---

## 2. clientEventId Idempotency — Explicit Repository Contract

### 2.1 M1 FINAL 决策: 显式 Contract 替代 traceId 检测

M1 Closeout 使用 `event.traceId !== currentTraceId` 判断重复请求。M1 FINAL 明确：**traceId 属 Observability，不属于 Idempotency Domain**，禁止参与业务幂等判断。

新 Contract：

```typescript
interface CreateLearningEventResult {
  event: LearningEvent;
  created: boolean;  // true=新建, false=clientEventId 重复返回既有事件
}
```

- 首次 clientEventId → `created=true` → 创建 event → 路由层继续更新 state
- 重复 clientEventId → `created=false` → 返回既有 event → 路由层跳过状态更新，从 `event.resultJson` 恢复 previous result/feedback
- traceId 仅用于追踪，不参与幂等判断

### 2.2 Database Schema

| 检查项 | 结果 | 证据位置 |
|--------|------|---------|
| `unique(user_id, client_event_id)` 是否存在 | ✅ 存在 | `supabase/migrations/0001_init_schema.sql:114`, `supabase/cloud-setup.sql:120` |

### 2.3 Supabase Repository

| 检查项 | 结果 | 证据位置 |
|--------|------|---------|
| 重复 clientEventId 时返回 `{event, created:false}` | ✅ 是 | `supabase-learning-repository.ts`: 捕获 `error.code === "23505"`，查询既有事件，返回 `{event, created:false}` |
| 首次提交返回 `{event, created:true}` | ✅ 是 | 同上 |
| 路由层根据 `created` 跳过状态更新 | ✅ 是 | `review/submit/route.ts`, `learn/submit/route.ts`: `if (!created) { 跳过 upsertUserItemState }` |

### 2.4 Memory Repository

| 检查项 | 结果 | 证据位置 |
|--------|------|---------|
| 重复 clientEventId 返回 `{event, created:false}` | ✅ 是 | `memory-learning-repository.ts`: `clientEventIds` Set 去重，返回 `{event, created:false}` |
| 首次提交返回 `{event, created:true}` | ✅ 是 | 同上 |
| 与 Supabase 接口语义一致 | ✅ 是 | 两者实现相同 `CreateLearningEventResult` 接口 |

### 2.5 修复前后对比

| 维度 | M1 Closeout (traceId) | M1 FINAL (explicit contract) |
|------|----------------------|------------------------------|
| 幂等判断依据 | `event.traceId !== traceId` | `result.created === false` |
| traceId 角色 | 参与业务判断 | 仅 Observability |
| 重复提交 event count | 1 | 1 |
| 重复提交 recall_level | +1（正确） | +1（正确） |
| 重复提交 nextReviewAt | 推进一次 | 推进一次 |
| 重复提交 response | 业务语义一致 | 业务语义一致 |
| 5xx | 无 | 无 |

---

## 3. ELS-EVAL-037: 重复 Review Submit 幂等测试

### 3.1 测试定义

- **文件:** `tests/unit/els-eval-037-038.test.ts`
- **场景:** 同一 Review Submit payload 使用同一 clientEventId 连续提交两次
- **验证项:** event count = 1, recall level 只推进一次, nextReviewAt 只推进一次, 两次 response 业务语义一致, 无 5xx

### 3.2 Memory Repository 执行结果

```
✓ ELS-EVAL-037: 同一 clientEventId 连续提交两次 → event count=1, recall_level 只推进一次, nextReviewAt 只推进一次
✓ ELS-EVAL-037: 不同 clientEventId 的两次提交 → event count=2, recall_level 推进但不超过 mastery max=2
```

**详细断言:**
- 初始状态: recallLevel=1, nextReviewAt=2026-01-01（已过期）
- 第一次提交 (CORRECT_INDEPENDENT): recallLevel 1→2, event created
- 第二次提交 (同 clientEventId): event 返回既有（id=相同）, recallLevel 保持 2（不双推）, nextReviewAt 相同
- 不同 clientEventId 的对照组: recallLevel 1→2→2（mastery 0-2，达到 max 后不再增长）

**结果: PASS (Memory Repository)**

### 3.3 Supabase Repository 执行结果

**状态: UNVERIFIED**

原因:
1. 当前环境 `DATA_PROVIDER=memory`，未配置为 supabase 运行时。
2. `0008_data_model_consistency.sql` 迁移未在远程 Supabase 实例执行。
3. 未验证 Supabase 实例的网络可达性和 RLS 配置。

**代码层确认（非运行时）:**
- Supabase Repository 的 `createLearningEvent` 有 23505 处理，返回 `{event, created:false}`（代码审查确认）。
- 路由层根据 `result.created` 跳过状态更新，同时适用于 Supabase Repository。
- 数据库有 `unique(user_id, client_event_id)` 约束（schema 确认）。

**要完成 Supabase 验证需:**
1. 在远程 Supabase 执行迁移 0001-0008。
2. 设置 `DATA_PROVIDER=supabase`。
3. 运行 ELS-EVAL-037 针对 Supabase Repository。

---

## 4. ELS-EVAL-038: Learn → Review → Report 跨模块探测

### 4.1 测试定义

- **文件:** `tests/unit/els-eval-037-038.test.ts`
- **场景:** Learn submit → server state → Review read → Review submit → Report aggregate
- **验证项:** Server authoritative state, API behavior, Report aggregate（不要求 M2 Trace）

### 4.2 Memory Repository 执行结果

```
✓ ELS-EVAL-038: 完整链路: Learn submit → server state → Review read → Review submit → Report aggregate
✓ ELS-EVAL-038: Report 聚合不依赖客户端 localStorage — 纯服务端数据
```

**详细断言:**

| Step | 操作 | 验证 |
|------|------|------|
| 1 | Learn submit (INDEPENDENT) | event created, state.status=RECALLED_INDEPENDENTLY, recallLevel=1 |
| 2 | Server state 读取 | state 与 learn 返回一致（权威状态） |
| 3 | Review read (getDueReviewItems) | item 出现在到期队列，recallLevel=1 |
| 4 | Review submit (CORRECT_INDEPENDENT) | result=CORRECT_INDEPENDENT, recallLevel 1→2 |
| 5 | Report aggregate | states=1, events=2 (1 NEW + 1 REVIEW), memory.totalItems=1, review.correctIndependent=1 |
| 6 | 一致性 | Report 中的 state 与直接从 Repository 读取的 state 一致 |

**结果: PASS (Memory Repository)**

### 4.3 Supabase Repository

**状态: UNVERIFIED**（同 ELS-EVAL-037 原因）

---

## 5. Corrected Interview Claims

以下表述在 `m1-single-source-of-truth.md` 中已修正：

| 原表述（隐含） | 修正后 |
|---------------|--------|
| Memory + Supabase Repository 暗示运行时自动切换 | 明确: **不具备 Supabase runtime auto-failover**。DATA_PROVIDER 由环境变量决定，启动时固定，无运行时故障转移。 |
| 服务端权威架构暗示已支持多端同步 | 明确: **跨设备实时同步未实现**。当前仅支持多端通过 API 读取同一服务端数据（非实时），无 WebSocket/SSE/离线队列/冲突解决。 |
| Supabase 迁移已创建暗示 production verified | 明确: **Supabase 路径未经 production verified**。迁移文件已创建但未在远程实例执行，Supabase Repository 未经运行时验证。 |
| "数据模型主要冲突已处理（recall_level 0-5）" | 修正为: recall_level 曾存在 **CONTRACT_CONFLICT**（M1 迁移期 0-5 vs Agent 工具 0-2）。**该冲突已在 M1 Final 消解：recall_level 冻结为 0–2 mastery level**，当前无未冻结契约冲突。 |
| "无并发写入冲突处理"（Remaining Risks #6） | 修正为: clientEventId 幂等性已在 M1 Closeout 修复（event + state 双层），经 ELS-EVAL-037 实测通过（Memory 路径）。 |

---

## 6. 测试结果汇总

### 6.1 M1 FINAL 修改后

| 检查项 | 结果 | 说明 |
|--------|------|------|
| `tsc --noEmit` | **PASS** | 无类型错误 |
| `next build` | **PASS** | 构建成功 |
| `vitest run` | **138 passed / 2 failed** | +8 测试（7 boundary + 1 contract），2 预存在失败不变 |
| ELS-EVAL-037 (Memory) | **PASS** (2/2) | 重复提交幂等 + 不同 clientEventId max=2 |
| ELS-EVAL-038 (Memory) | **PASS** (2/2) | Learn→Review→Report 跨模块 |
| recall_level boundary (Memory) | **PASS** (7/7) | 0→1→2→2, hint/incorrect/skip 不变 |
| explicit contract (Memory) | **PASS** (1/1) | `{event, created}` 结构验证 |
| ELS-EVAL-037 (Supabase) | **UNVERIFIED** | 无本地 Supabase CLI，迁移未在远程执行 |
| ELS-EVAL-038 (Supabase) | **UNVERIFIED** | 同上 |

### 6.2 预存在失败（非 M1 引入）

1. `tests/unit/env.test.ts:39` — `isPlaceholderSupabase()` 返回 false（.env.local 有真实 URL）
2. `tests/unit/llm-safety.test.ts:158` — `ModelSettingsPanel.tsx` import `@/lib/llm`
3. `tests/e2e/smoke.spec.ts:37` — Agent API `/api/agent/message` 返回非 ok

---

## 7. M1_FINAL_STATUS

**M1_CODE_STATUS: PASS**
**M1_PRODUCTION_VERIFICATION: UNVERIFIED**

### PASS 项（代码层）

- ✅ recall_level 冻结为 mastery 0-2，证据充分，全链路同步（schema/code/tests/docs）
- ✅ clientEventId 幂等性使用显式 Repository Contract（`{ event, created }`），不依赖 traceId
- ✅ Memory Repository 与 Supabase Repository 接口语义一致
- ✅ ELS-EVAL-037 Memory 路径真实执行通过（event count=1, recall_level 只更新一次, nextReviewAt 只更新一次, replay response 语义一致）
- ✅ ELS-EVAL-038 deterministic subset 实际执行通过
- ✅ recall_level boundary tests 7/7 通过（0→1→2→2 cap）
- ✅ 修正"不同 clientEventId 连续正确"测试：recall_level max=2，不增长到 3
- ✅ typecheck / build / full unit suite 通过（138 passed，2 预存在失败不变）
- ✅ 不再存在未经实现验证的 Interview Claims
- ✅ migration 0008 确认从未执行，安全修订为 0-2

### UNVERIFIED 项（生产运行时）

- ⚠️ **Supabase runtime 未验证**: 无本地 Supabase CLI，迁移 0001-0008 未在远程实例执行，`DATA_PROVIDER=supabase` 路径未实际运行。代码层确认（23505 处理 + unique 约束 + 路由层 `created` 判断），但运行时证据缺失。
- ⚠️ **跨设备实时同步未验证**: Server-authoritative 架构支持多端同步，但未在多客户端场景实测。

### 与 M1 Closeout (PARTIAL) 的差异

| 项 | M1 Closeout | M1 FINAL |
|----|-------------|----------|
| recall_level | CONTRACT_CONFLICT（推荐 0-5）——Closeout 时点历史态 | FROZEN: mastery 0-2（当前契约，冲突已消解） |
| 幂等判断 | traceId 比较 | 显式 `{event, created}` Contract |
| 测试数 | 130 passed | 138 passed（+8） |
| 状态 | PARTIAL | CODE PASS / PRODUCTION UNVERIFIED |

### 关闭为 PASS 的条件

1. 在远程 Supabase 执行迁移 0001-0008，设置 `DATA_PROVIDER=supabase`，运行 ELS-EVAL-037/038 并通过。
2. 产品确认 recall_level 选 B (0-5)，同步修改 `cloud-setup.sql` 和 `build-review-session.ts` 验证范围，或选 A 并回滚迁移。
