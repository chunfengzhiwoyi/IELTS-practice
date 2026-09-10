# Bad Case 030 — Report Baseline / Missing vs Zero

## Problem

ELS-EVAL-030 (S1): 只有本周数据、没有前七天 baseline 时，CompareSection 仍显示类似"新收表达 1 → 0 ▲ 1"的伪造趋势。

Frozen Gold 要求：没有历史 baseline 时，不得展示上升/下降/Δ/▲/▼/百分比变化/"提升/下降"等趋势性结论。

## Frozen Gold

- **Category**: REPORT / UI PRESENTATION
- **Scenario**: 新用户或数据不足时，上一周期完全无数据
- **Expected Behavior**: 进入"暂无历史对比/无可比较数据"空态
- **Failure Criteria**: 系统在没有证据时生成趋势性事实判断（unsupported factual claim）
- **Severity**: S1（伪造趋势 = 欺骗性输出）

## Before Evidence

### 调用链

```
User → /api/report (route.ts)
  → aggregateReportData → Repository
  → buildClientReportFromRaw (report-transform.ts)
    → buildWeekBuckets → { thisWeek, lastWeek }
      → lastWeek 无事件时 newItems=0, reviews=0（missing 被折叠成 0）
  → report-page.tsx → <CompareSection thisWeek lastWeek weeklyActivity />
    → visible = rows.filter(r => (r.thisV ?? 0) > 0 || (r.lastV ?? 0) > 0)
    → const a = r.thisV ?? 0; const b = r.lastV ?? 0;
    → if (a > b) delta = { text: "▲ 1", up: true }  // 伪造 delta
```

### 关键代码位置

- `lib/client/report-transform.ts:170-196` — `buildWeekBuckets` 把 missing 折叠成 0
- `components/report/compare-section.tsx:39` — `visible` filter 用 `?? 0`
- `components/report/compare-section.tsx:51-55` — delta 计算用 `?? 0`，missing 被当成 true zero

## Root Cause

**不是"UI 数字不太好看"**。真正的产品问题是：**系统在没有证据时生成了趋势性事实判断。**

数据层 `buildWeekBuckets` 对无事件的周期返回 `newItems=0, reviews=0`，将 MISSING（无数据）与 ZERO（有数据但真实值为 0）混为一谈。UI 层 `?? 0` 进一步消除了仅存的 `reviewAccuracy: null` 区分。最终结果：`thisV=1, lastV=0` 被解释为"从 0 增长到 1"，但实际上 0 代表"没有数据"而非"真实值为 0"。

## 为什么 missing != zero

| 状态 | 含义 | 可否计算 delta |
|------|------|---------------|
| MISSING | 上一周期无任何学习/口语活动 | 否——没有 baseline，无法比较 |
| ZERO | 上一周期有活动，某指标真实值为 0 | 是——0 是合法的比较基准 |

示例：
- 上周学了 3 个词，本周学了 1 个 → 真实下降（lastV=3 是真实值）
- 上周无任何活动，本周学了 1 个 → **不可比较**（lastV=0 是 missing，不是真实零）
- 上周有复习活动但无新词，本周学了 1 个 → 真实增长（lastV=0 是真实零，因为上周有活动）

## Failure Layer

REPORT / UI PRESENTATION — 数据契约缺少 presence 标志，UI 将 missing 解释为 zero。

## Data Boundary

**审计结果**：
- `WeekBucket.newItems: number` — 总是 0（missing 被折叠）
- `WeekBucket.reviews: number` — 总是 0（missing 被折叠）
- `WeekBucket.reviewAccuracy: number | null` — null 保留（仅此字段区分 missing）
- `WeekBucket.activeDays: number` — 总是 0（missing 被折叠）
- `WeekBucket.speakingCompleted: number` — 总是 0（missing 被折叠）

上游 aggregation 保留原始 events/sessions，但 `buildWeekBuckets` 在 view model 层折叠了 missing 语义。

## UI Boundary

`compare-section.tsx`：
- `visible` filter：`(r.thisV ?? 0) > 0 || (r.lastV ?? 0) > 0` — missing lastV=0 仍可见
- delta 计算：`const b = r.lastV ?? 0` — missing 变成 0
- 无 `baselineExists` / `hasActivity` 判断

## Options

| Option | 描述 | 优点 | 风险 |
|--------|------|------|------|
| A | 仅修 CompareSection，用 `lastV === null` 判断 | 最小改动 | `newItems`/`reviews` 从不为 null，无法区分 |
| **B** | **WeekBucket 加 `hasActivity: boolean`，CompareSection 在 `!lastWeek.hasActivity` 时显示空态** | **明确区分 missing/zero，per-metric null 仍保留，最小可靠** | **需同步 demo-service 的 WeekBucket** |
| C | 上游 aggregation 加 baseline 字段 | 更彻底 | 大规模 Report 重构，超出 scope |

## Product Decision

**Option B** — `WeekBucket` 新增 `hasActivity: boolean`。

- `hasActivity = ev.length > 0 || speakingCompleted > 0`
- `!lastWeek.hasActivity` → CompareSection 显示"暂无历史对比数据"空态，不计算任何 delta
- `lastWeek.hasActivity === true` → 正常 delta 计算（0 是真实零值）
- per-row：`lastV === null`（如 reviewAccuracy 无复习）→ 显示 "—"，不计算该指标 delta

## Behavior Matrix

| Case | 本周 | 上周 | hasActivity(last) | 结果 |
|------|------|------|-------------------|------|
| A | thisV=1 | 无数据 | false | 空态，无 ▲/▼/Δ |
| B | thisV=1 | lastV=0（有活动） | true | 允许 "▲ 1" |
| C | thisV=0 | lastV>0 | true | 允许 "▼ N" |
| D | 两期都有数据 | 两期都有数据 | true | 正常比较 |
| E | 两期都无数据 | 两期都无 | false | 空态 |
| F | 本周有数据 | 上周有活动但某指标 null | true（period级） | 该指标显示 "—"，其他指标正常 |

## Implementation

1. `lib/client/report-transform.ts`
   - `WeekBucket` 接口加 `hasActivity: boolean`
   - `buildWeekBuckets` 的 bucket 函数计算并返回 `hasActivity`
2. `lib/client/demo-service.ts`
   - 同步 `WeekBucket` 接口和 `buildWeekBuckets`
3. `components/report/compare-section.tsx`
   - `!lastWeek.hasActivity` → 空态（保留本周活跃日历）
   - per-row `lastV == null` → 不计算 delta，显示 "—"

## Data Contract

- `DATA_CONTRACT_CHANGED`: YES（WeekBucket 新增 `hasActivity` 字段，additive）
- `UI_CONTRACT_CHANGED`: YES（missing baseline 时显示空态而非伪造 delta）
- 不修改数据库、API route、aggregation

## Regression

### 新增测试：`tests/unit/badcase-030-report-baseline.test.ts`（12 tests）

| 场景 | 验证 |
|------|------|
| CASE A | 本周有数据、上周无 → lastWeek.hasActivity=false |
| CASE B | 上周有 REVIEW 但 newItems=0 → hasActivity=true，0 是真实零 |
| CASE C | 本周=0、上周>0 → 合法下降 |
| CASE D | 两期都有数据 → 正常 |
| CASE E | 两期都无 → 都 false |
| CASE F | 上周只有 REVIEW → newItems=0 是真实零 |
| reviewAccuracy null | 无复习时返回 null 而非 0 |
| speaking hasActivity | 口语 session 单独标记活动 |
| CompareSection 空态 | missing baseline → shouldShowEmptyState=true |
| true zero | hasActivity=true → 允许 delta |
| null ≠ 0 | missing 不被简单等价为 0 |
| delta 条件 | baselineExists=false → deltaShown=false |

### Regression Matrix

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| missing baseline 显示 ▲ | 是 ✗ | 否 ✓ |
| true zero 比较 | 正常 | 正常 ✓ |
| 两期都有数据 | 正常 | 正常 ✓ |
| reviewAccuracy null | 被 ?? 0 折叠 | 显示 "—"，无 delta ✓ |

## Expected Independent Eval

ELS-EVAL-030 预期：
- 无 baseline 时不显示 ▲/▼/Δ/提升/下降
- 显示"暂无历史对比"空态
- 有 baseline 时正常比较行为不变

**不声明 ELS-EVAL-030 PASS**——最终判定由独立 Eval Runner 完成。

## Files Changed

1. `lib/client/report-transform.ts` — WeekBucket 加 hasActivity，buildWeekBuckets 设置
2. `lib/client/demo-service.ts` — 同步 WeekBucket 和 buildWeekBuckets
3. `components/report/compare-section.tsx` — missing baseline 空态 + per-row null 处理
4. `tests/unit/badcase-030-report-baseline.test.ts` — 新增 12 tests
5. `docs/v3/badcases/030-report-baseline.md` — 本文档
