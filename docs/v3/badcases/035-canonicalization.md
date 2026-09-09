# Bad Case 035 — Lexical Canonicalization & Retrieval Miss

| | |
|---|---|
| **Case** | ELS-EVAL-035 |
| **Base Commit** | `b0ff1bf095e04e1b1d2ddc1ead502b9cb54f1f1f` |
| **Branch** | `fix/eval-035-canonicalization` |
| **Worktree** | `D:\Codex\IELTS-badcase-035` |
| **日期** | 2026-09-09 |
| **Frozen Gold** | `ELS_EVALUATION_V1_1`（未修改） |

---

## 1. Problem

### 真实现象
```
well-being → item-yi9ukg
wellbeing  → item-2ld3db
deduplicated = false
retrieval.executed knowledge_miss_flag = true
response generationMeta 不存在 knowledge_miss 字段
```

用户输入 "well-being" 和 "wellbeing"（同一个词的不同书写变体），系统创建了**两个独立的 LearningItem**，产生两份长期学习状态。

---

## 2. Frozen Gold

> Gold 文件 `docs/ELS_EVALUATION_V1_1.md` 在 base commit 中不存在（后于该 commit 添加）。
> 基于用户提供的 Case 035 事实进行分析。

Gold 要求的核心：**同一个用户学习概念不应该因为表面书写变体形成两份长期学习状态**。

---

## 3. Before

### 旧架构
```
用户输入 "well-being"
  → normalizeTerm("well-being") = "well-being"  （只做 lowercase + trim + collapse whitespace）
  → stableItemId("well-being") = item-yi9ukg
  → createOrGetItem → 新建 item

用户输入 "wellbeing"
  → normalizeTerm("wellbeing") = "wellbeing"
  → stableItemId("wellbeing") = item-2ld3db
  → createOrGetItem → 新建另一个 item
```

**根因**：`normalizeTerm` 不处理连字符，导致连字符变体被视为不同的 lexical identity。

### Trace Evidence
- `retrieval.executed.knowledge_miss_flag = true`：当搜索 "wellbeing" 时，已存在的 "well-being" item 未被找到
- M2 Trace 已能记录此现象

---

## 4. Root Cause — 两个问题分离

### Problem A: Lexical Identity / Canonicalization（真正的 Product Bug）

`normalizeTerm` 同时承担了三个职责：
1. **display form**（用户看到的书写形式）
2. **canonical identity**（去重和 itemId 生成）
3. **retrieval query**（用户输入的查找键）

三者混为一个字段，导致连字符变体无法被识别为同一概念。

**这是 Product Bug**：用户学习 "well-being" 后再输入 "wellbeing"，系统认为是新词，学习状态不连续。

### Problem B: Retrieval Miss Observability（非 Product Bug，已由 M2 Trace 满足）

- M2 Phase 2 已实现 `retrieval.executed` 事件，记录：
  - `query_raw` / `query_normalized` / `knowledge_object_ids` / `knowledge_miss_flag`
- 旧 `GenerationMeta` 没有 `knowledge_miss` 字段，但这是**旧 API 设计**，不是 observability gap
- **决策**：不在 `GenerationMeta` 添加冗余 `knowledge_miss` 字段。M2 Trace 已满足 observability 需求。

---

## 5. Option Comparison

### Option A: Strip all hyphens in normalizeTerm

```
normalizeTerm("well-being") → "wellbeing"
```

- **Pro**：最简单
- **Con**：改变 display form（"well-being" 显示为 "wellbeing"）
- **Con**：多连字符短语 "state-of-the-art" → "stateoftheart"（错误）
- **Con**：collision 风险：co-op/coop、re-cover/recover 被错误合并
- **Reject**：破坏 display form，过于激进

### Option B: Hyphen-insensitive canonical key, preserve display form（采纳）

```
canonicalForm (display)  = "well-being"   ← 保留原始书写
normalizedTerm (query)   = "well-being"   ← 用户输入形式
canonicalKey (identity)  = "wellbeing"    ← 用于去重和 itemId
```

- **Pro**：display form 保留，canonical identity 稳定，三者分离
- **Pro**：seed 词库无连字符词（已审计 22 个 seed item），不破坏现有 seed
- **Pro**：itemId 基于 canonicalKey，well-being/wellbeing 生成同一 ID
- **Pro**：最小改动，不引入新框架
- **Con**：已知 collision 风险（co-op/coop），但对 IELTS 词汇场景可接受
- **Adopt**

### Option C: Explicit alias / variant mapping

```
aliases = { "well-being": "wellbeing", "wellbeing": "wellbeing" }
```

- **Pro**：无 collision 风险
- **Con**：不 scale，需要手动维护每个变体
- **Con**：无法处理未来用户输入的新变体
- **Reject**：不可扩展

### Option D (considered): Hyphen → space for canonical key

```
canonicalKey("well-being") = "well being"
```

- **Con**："well being" ≠ "wellbeing"，不解决问题
- **Reject**

---

## 6. Decision

**采纳 Option B：hyphen-insensitive canonical key，保留 display form。**

### 三者分离原则

| 概念 | 字段 | 示例 | 用途 |
|------|------|------|------|
| Display Form | `canonicalForm` | "well-being" | 用户看到的书写形式 |
| Retrieval Query | `normalizedTerm` | "well-being" | 用户输入的标准化形式 |
| Canonical Identity | `canonicalKey` | "wellbeing" | 去重、itemId 生成、Repository 查找 |

### 实现位置

| 文件 | 修改 |
|------|------|
| `lib/learning/item-id.ts` | 新增 `canonicalKey()` 函数；`stableItemId()` 改用 canonicalKey |
| `lib/learning/types.ts` | `LearningItem` 新增 `canonicalKey: string` 字段 |
| `lib/learning/seed-catalog.ts` | `findSeedItem()` 改用 canonicalKey 比较；`seedToLearningItem()` 填充 canonicalKey |
| `lib/learning/repositories/memory-learning-repository.ts` | `normalizedIndex` → `canonicalIndex`；`findItemByNormalizedTerm()` / `createOrGetItem()` 改用 canonicalKey |
| `lib/learning/repositories/supabase-learning-repository.ts` | `toItem()` 映射 canonical_key；`findItemByNormalizedTerm()` 查 canonical_key 列；`createOrGetItem()` onConflict 改用 canonical_key |
| `lib/llm/tasks/generate-word-card.ts` | `stableItemId()` 改用 `finalCanonical` |
| `lib/client/demo-service.ts` | 创建 LearningItem 时填充 canonicalKey（复用 `canonicalKey()`，不内联） |
| `lib/learning/index.ts` | 导出 `canonicalKey` / `stableItemId` / `isSeedItemId` |

**一致性清扫（提交内）：** 三处早期内联的 `replace(/-/g, "")` 统一改为复用
`canonicalKey()`（demo-service / Memory repo `findItemByNormalizedTerm` / Supabase repo
`toItem` 与查询），确保所有 canonical identity 计算走同一函数（Supabase 旧行 fallback
也会先 normalize 再 strip hyphen）；清理 7 个文件的 UTF-8 BOM（编辑器副作用）；
回退 package-lock.json 的无关 npm 元数据变动（保持最小变更面）。

---

## 7. Why & Trade-off

### 为什么选 Server Repository 层的 canonicalKey？

- itemId 是 Repository 的 identity，必须在 Repository 层统一
- 前端不感知 canonicalKey 的计算，只通过 API 使用
- 与 M1 Single Source of Truth 一致：核心业务状态由服务端管理

### 为什么不完全删除连字符？

- display form 是用户体验的一部分，"well-being" 比 "wellbeing" 更易读
- 多连字符短语（如 "state-of-the-art"）删除连字符后无法识别
- 保留连字符在 normalizedTerm 中，未来可用于更智能的检索

### Collision Risk（已知 trade-off）

| 碰撞对 | 当前行为 | 影响 |
|--------|---------|------|
| co-op / coop | 合并 | IELTS 词汇中极少同时出现 |
| re-cover / recover | 合并 | 同上 |
| state-of-the-art / stateoftheart | 合并 | 多连字符短语的已知限制 |

**缓解**：当前方案仅对 IELTS 词汇学习场景优化。如果未来需要更精确的 lexical disambiguation，可引入 Option C（alias mapping）作为补充层，而不是替换 canonicalKey。

### Retrieval Miss Decision

- **不在 GenerationMeta 添加 knowledge_miss 字段**
- M2 Trace 的 `retrieval.executed.knowledge_miss_flag` 已满足 observability
- 添加 API 级字段会造成冗余，且 Gold 未明确要求

---

## 8. Implementation

### canonicalKey 函数

```typescript
export function canonicalKey(raw: string): string {
  return normalizeTerm(raw).replace(/-/g, "");
}
```

### itemId 生成

```typescript
// 旧：stableItemId(normalizeTerm("well-being")) → item-yi9ukg
// 新：stableItemId(canonicalKey("well-being")) → stableItemId("wellbeing")
```

### Repository 去重

```typescript
// Memory: canonicalIndex 替代 normalizedIndex
async createOrGetItem(item: LearningItem): Promise<LearningItem> {
  const existing = await this.findItemByNormalizedTerm(item.canonicalKey);
  if (existing) return existing;
  this.items.set(item.id, item);
  this.canonicalIndex.set(item.canonicalKey, item.id);
  return item;
}
```

### Supabase Migration（设计，未执行）

```sql
ALTER TABLE learning_items ADD COLUMN IF NOT EXISTS canonical_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_items_canonical_key ON learning_items(canonical_key);
-- Backfill: UPDATE learning_items SET canonical_key = REPLACE(LOWER(normalized_term), '-', '');
```

**状态：UNVERIFIED** — 未在任何 Supabase 实例执行。

---

## 9. Regression

### 新增测试：`tests/unit/badcase-035-canonicalization.test.ts`（15 tests）

| 测试类 | 用例 | 验证 |
|--------|------|------|
| canonicalKey 连字符不敏感 | 5 | well-being/wellbeing 相同 key、相同 itemId、大小写/空格不影响、display 保留、三者分离 |
| collision safety | 4 | 多词短语保留空格、co-op/coop 已知 trade-off、多连字符短语限制、数字连字符 synthetic case |
| findSeedItem | 1 | seed 无连字符词，canonicalKey === normalizedTerm |
| Memory Repository | 3 | well-being/wellbeing 创建同一 item、不同词不合并、seedToLearningItem 含 canonicalKey |
| learn/card 路由端到端（r4 对齐） | 2 | 两次 POST learn/card（well-being / wellbeing）返回同一 item.id（deduplicated=true，对齐 Eval r4 断言）；r1 保持——首次请求 retrieval.executed 仍记录 knowledge_miss_flag=true |

端到端测试通过 `__setProviderForTests("mock", …)` 注入 WordCard mock provider，直接调用
`POST /api/learn/card` 路由（与 Eval Runner 的调用方式一致），不依赖真实 LLM。
display form 语义验证：同一 canonical identity 只保留一份状态，`canonicalForm` 保留**首次创建**的书写形式（"well-being"）。

### 全量回归结果

| 检查项 | 结果 |
|--------|------|
| `tsc --noEmit` | **PASS** |
| `next build` | **PASS** |
| Bad Case 035 测试 | **15/15 PASS** |
| M1 ELS-EVAL-037/038 | **PASS** |
| M2 Phase 1 测试 | **18/18 PASS** |
| M2 Phase 2 测试 | **18/18 PASS** |
| 全量 unit | **190 passed / 1 failed**（1 预存在：llm-safety.test.ts；本 worktree 无 .env.local，env.test.ts 通过） |

---

## 10. Expected Eval Outcome

修复后预期行为：
- `well-being` 和 `wellbeing` 生成同一个 `itemId`
- `createOrGetItem` 返回同一个 item（deduplicated = true）
- `retrieval.executed.knowledge_miss_flag` 对于已存在的变体应为 false
- display form 保留用户首次输入的书写形式

**Builder 不写 ELS-EVAL-035 PASS。真正 PASS 由 Eval Runner 在合并后决定。**

---

## 11. Remaining Risks

1. **Supabase migration 未执行**：canonical_key 列和 backfill 需在远程实例执行
2. **多连字符短语**："state-of-the-art" → "stateoftheart" 是已知限制
3. **Collision**：co-op/coop 等极少数词可能被错误合并
4. **现有 Memory 数据**：进程重启后旧 item 消失，无迁移问题；Supabase 需 backfill
