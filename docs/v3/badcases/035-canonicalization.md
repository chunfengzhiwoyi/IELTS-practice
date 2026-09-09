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

## 5. Option Comparison（Final 复核）

### Option A: 在 normalizeTerm 中删除所有连字符

```
normalizeTerm("well-being") → "wellbeing"
```

- **Con**：改变 display form（"well-being" 显示为 "wellbeing"）
- **Con**：多连字符短语 "state-of-the-art" → "stateoftheart"（错误）
- **Con（致命）**：collision —— re-cover/recover、co-op/coop 被错误合并。
  Closure Blocker A 要求 re-cover ≠ recover，Option A 无法满足。
- **Reject（Final）**

### Option B: 全局 hyphen-insensitive canonical key（上一轮采纳，本轮复核后替换）

```
canonicalKey("well-being") = "wellbeing"
canonicalKey("re-cover")   = "recover"   ← 错误合并
```

- **Pro**：display form 保留，实现简单
- **Con（致命）**：无条件删除连字符仍会把 re-cover/recover、co-op/coop
  合并为同一 identity。上一轮以「22 个 seed 无 collision」为由接受该风险，
  但产品允许用户输入任意 lexical item，风险关闭不成立。
- **Superseded（Final）**：被 Option C（注册表）替换

### Option C: Explicit lexical variant / alias registry（Final 采纳）

```
LEXICAL_VARIANTS = { "wellbeing": "well-being", "e-mail": "email", "co-operate": "cooperate" }
canonicalKey(raw) = LEXICAL_VARIANTS[normalizeTerm(raw)] ?? normalizeTerm(raw)
```

- **Pro**：零误合并（false positive = 0）：未登记输入一律保持原样
- **Pro**：确定性、可解释、可审计（冻结的小注册表）
- **Pro**：满足契约——well-being == wellbeing（登记），re-cover != recover（未登记）
- **Con**：需要手动登记新变体；未登记变体首次按独立词处理（fail-safe，
  false negative 有界：只会多产生一次「变体新词」状态，不会破坏既有状态）
- **Adopt（Final）**

### Option D (considered): Hyphen → space for canonical key

- **Con**："well being" ≠ "wellbeing"，不解决问题
- **Reject**

---

## 6. Decision（Final）

**最终方案 = Option C：词法变体注册表 + normalizeTerm 原样保留。**

```
canonicalKey(raw) = LEXICAL_VARIANTS[normalizeTerm(raw)] ?? normalizeTerm(raw)
```

同时满足 Closure Blocker A 的两条硬性契约：

| 契约 | 断言 | 满足方式 |
|------|------|---------|
| 1. well-being / wellbeing → 同一 lexical identity | `canonicalKey("well-being") === canonicalKey("wellbeing")` | 注册表把 "wellbeing" 解析为规范形 "well-being" |
| 2. re-cover / recover → 不同 lexical identity | `canonicalKey("re-cover") !== canonicalKey("recover")` | 未登记，保持原样，各自独立 |

### 三者分离原则（不变）

| 概念 | 字段 | 示例 | 用途 |
|------|------|------|------|
| Display Form | `canonicalForm` | "well-being" | 用户看到的书写形式 |
| Retrieval Query | `normalizedTerm` | "well-being" / "wellbeing" | 用户输入的标准化形式 |
| Canonical Identity | `canonicalKey` | "well-being"（变体经注册表解析） | 去重、itemId 生成、Repository 查找 |

### 实现位置

| 文件 | 修改 |
|------|------|
| `lib/learning/item-id.ts` | `LEXICAL_VARIANTS` 冻结注册表；`canonicalKey()` 改为注册表解析 |
| `lib/learning/types.ts` | `LearningItem` 新增 `canonicalKey: string` 字段（2de03f7） |
| `lib/learning/seed-catalog.ts` | `findSeedItem()` 用 canonicalKey 比较；`seedToLearningItem()` 填充 canonicalKey |
| `lib/learning/repositories/memory-learning-repository.ts` | `canonicalIndex` 替代 `normalizedIndex` |
| `lib/learning/repositories/supabase-learning-repository.ts` | 查询/写入 `canonical_key` 列（对应 0009） |
| `lib/llm/tasks/generate-word-card.ts` | `stableItemId()` 改用 finalCanonical |
| `lib/client/demo-service.ts` | 创建 LearningItem 时填充 canonicalKey |
| `lib/learning/index.ts` | 导出 canonicalKey / stableItemId / isSeedItemId |

---

## 7. Why & Trade-off（Final）

### 为什么选 Server Repository 层的 canonicalKey？

- itemId 是 Repository 的 identity，必须在 Repository 层统一
- 前端不感知 canonicalKey 的计算，只通过 API 使用
- 与 M1 Single Source of Truth 一致：核心业务状态由服务端管理

### 为什么不无条件删除连字符？（Closure Blocker A 核心）

无条件删除连字符（旧 Option B）会把**真正不同的词**错误合并：

| 碰撞对 | 语义 | 旧行为 | Final 行为 |
|--------|------|--------|-----------|
| well-being / wellbeing | 同词（IELTS health 高频） | 合并 | **合并**（注册表） |
| e-mail / email | 同词 | 合并 | **合并**（注册表） |
| co-operate / cooperate | 同词 | 合并 | **合并**（注册表） |
| re-cover / recover | 不同词（再次覆盖 vs 恢复） | ~~合并（错误）~~ | **不合并** |
| co-op / coop | 不同词（cooperative vs 鸡舍） | ~~合并（错误）~~ | **不合并** |
| state-of-the-art / stateoftheart | 不同 | ~~塌缩~~ | **不合并** |
| well being（空格）/ wellbeing | 未登记 | 不合并 | **不合并**（fail-safe） |

**产品契约**：合并只发生在注册表明确登记的同词变体；其余一律独立。
安全默认（fail-safe）= 不合并 → 代价仅是「未登记变体多一份新词状态」，
可事后补登记；而错误合并会破坏两个不同词各自的长期学习状态，不可逆。

### Retrieval Miss Decision（不变）

- **不在 GenerationMeta 添加 knowledge_miss 字段**
- M2 Trace 的 `retrieval.executed.knowledge_miss_flag` 已满足 observability
- 添加 API 级字段会造成冗余，且 Gold 未明确要求

---

## 8. Implementation（Final）

### canonicalKey 函数与注册表

```typescript
// lib/learning/item-id.ts
export const LEXICAL_VARIANTS: Readonly<Record<string, string>> = {
  "wellbeing": "well-being", // 同词异拼（IELTS health 话题高频）
  "e-mail": "email",         // 同词异拼（现代标准拼写）
  "co-operate": "cooperate", // 同词异拼（现代标准拼写）
} as const;

export function canonicalKey(raw: string): string {
  const normalized = normalizeTerm(raw);
  return LEXICAL_VARIANTS[normalized] ?? normalized;
}
```

### itemId 生成

```typescript
// well-being 与 wellbeing → 同一 canonicalKey "well-being" → 同一 itemId
stableItemId(canonicalKey("well-being")) === stableItemId(canonicalKey("wellbeing"))
// re-cover 与 recover → "re-cover" / "recover" → 不同 itemId
stableItemId(canonicalKey("re-cover")) !== stableItemId(canonicalKey("recover"))
```

### Repository 去重

```typescript
// Memory: canonicalIndex 替代 normalizedIndex（2de03f7）
async createOrGetItem(item: LearningItem): Promise<LearningItem> {
  const existing = await this.findItemByNormalizedTerm(item.canonicalKey);
  if (existing) return existing;
  this.items.set(item.id, item);
  this.canonicalIndex.set(item.canonicalKey, item.id);
  return item;
}
```

### Supabase Migration（Blocker B 关闭）

**结论：Case 2 —— Supabase Repository 的查询/写入依赖 `canonical_key` 数据库列，代码在无该列时无法正确工作（`findItemByNormalizedTerm` 按列过滤、`createOrGetItem` 写入列并以列为 onConflict 仲裁）。因此需要独立后续 migration（设计见下）。**

> **Merge-ready 分支（`fix/eval-035-code-only`）说明：本分支仅纳入已验证产品代码，migration 施工（0009 / cloud-setup block / seed.sql）**尚未获批**，不随本分支进入 Integration。
> 依赖 `ENV-SUPABASE-01`：远程 Supabase collision state UNKNOWN，后续 Probe 明确 `READY_FOR_MIGRATION_DESIGN=NO`；
> 在 0009 获批并执行前，Supabase 运行时不可使用 canonical_key 路径（Memory 路径不受影响）。

**设计（待获批后单独落地，勿并入本分支）：**

`supabase/migrations/0009_lexical_canonical_key.sql`（新增）：

```sql
alter table public.learning_items add column if not exists canonical_key text;

update public.learning_items
   set canonical_key = lower(coalesce(nullif(normalized_term, ''), canonical_form))
 where canonical_key is null;

-- 词法变体注册表（与代码 LEXICAL_VARIANTS 逐一对应）
update public.learning_items set canonical_key = 'well-being' where canonical_key = 'wellbeing';
update public.learning_items set canonical_key = 'email'      where canonical_key = 'e-mail';
update public.learning_items set canonical_key = 'cooperate'  where canonical_key = 'co-operate';

alter table public.learning_items alter column canonical_key set not null;

create unique index if not exists ux_learning_items_canonical_key
  on public.learning_items (canonical_key);
```

- **不重写 0001–0008**：0008（M1 Final）已验收，未向其中塞入 035 无关 schema 变化
- **cloud-setup.sql**：在 seed 插入之后追加与 0009 相同的 canonical_key 块
  （先 backfill 再 set not null，避免 seed INSERT 违反约束）
- **seed.sql**：INSERT 增加 `canonical_key` 列（seed 的 canonical_key = lower(canonical_form)）
- **状态（本分支）**：`SUPABASE_CODE_STATUS = VERIFIED`（schema 契约与代码一致，测试覆盖 memory 路径）；
  `SUPABASE_RUNTIME_STATUS = UNVERIFIED`（未真实连接远程 Supabase；且 0009 未获批/未执行，
  Supabase 运行时 canonical_key 查询暂不可用——属 gated 状态，见 ENV-SUPABASE-01）

---

## 9. Regression（Final）

### 新增测试：`tests/unit/badcase-035-canonicalization.test.ts`（21 tests）

| 测试类 | 用例 | 验证 |
|--------|------|------|
| canonicalKey 注册表 | 5 | well-being==wellbeing 同 key、同 itemId、大小写/空格、display 保留、变体 identity≠query |
| MERGE/NON-MERGE fixtures | 9 | MERGE：well-being/wellbeing、e-mail/email、co-operate/cooperate；NON-MERGE：re-cover/recover、co-op/coop、state-of-the-art、well being、2-year、hello-world；注册表完整性（固定点） |
| findSeedItem | 1 | seed 无连字符/变体词 |
| Memory Repository | 4 | MERGE 创建同一 item、**NON-MERGE：re-cover/recover 创建不同 item**、不同词不合并、seedToLearningItem 含 canonicalKey |
| learn/card 路由端到端（r4 对齐） | 2 | well-being/wellbeing 两次请求同一 item.id（deduplicated=true）；retrieval.executed knowledge_miss_flag=true 保持 |

### 全量回归结果（本次 Final 复核实跑）

| 检查项 | 结果 |
|--------|------|
| `tsc --noEmit` | **PASS** |
| `next build` | **PASS** |
| Bad Case 035 测试 | **21/21 PASS** |
| M1 ELS-EVAL-037/038 | **PASS** |
| M2 Phase 1 测试 | **PASS** |
| M2 Phase 2 测试 | **PASS** |
| 全量 unit | 见下方实跑记录（既有 1 个预存在失败：llm-safety.test.ts，与本改动无关） |

---

## 10. Expected Eval Outcome（Final）

修复后预期行为（由 Eval Runner 在合并后真实判定，本 Builder 不代写 PASS）：
- `well-being` 和 `wellbeing` 生成同一个 `itemId`（deduplicated = true）
- `re-cover` 和 `recover` 保持两个独立 identity
- `retrieval.executed.knowledge_miss_flag` 对已存在变体为 false
- display form 保留用户首次输入的书写形式

---

## 11. Remaining Risks（Final）

1. **Supabase migration 未获批（ENV-SUPABASE-01）**：0009 / cloud-setup block / seed.sql 变更未纳入
   merge-ready 分支；远程 collision state UNKNOWN，需 Probe 确认 READY_FOR_MIGRATION_DESIGN=YES 后单独施工
2. **注册表扩展成本**：新变体需手动登记（有界、可审计；未登记输入 fail-safe 独立）
3. **Memory 数据**：进程重启后旧 item 消失，无迁移问题；Supabase 待 0009 获批后回填
