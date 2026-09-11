# PRODUCT-LOOP-02C-V1.1 — Speaking → Vocabulary Correctness Evidence（契约草案，仅记录）

**AGENT**: 豆包c
**STATUS**: DOCUMENT_ONLY（本文件不实现任何代码；V1.1 未排期）

## 1. 目的

V1（PRODUCT-LOOP-02C-IMPLEMENT）只解决"学过的东西能否被系统主动安排去说"。V1.1 解决反向：
**系统能否可靠判断用户在口语中是否正确使用了目标表达，并据此形成词汇状态证据。**

## 2. 前置条件（必须先满足）

1. V1 的 suggestedExpressions 已上线并积累真实数据（出题匹配率、用户使用率）。
2. 已建立 quote grounding 基线：任何 correctness 判断必须可回溯到用户回答原文。
3. 明确验收：**UNCERTAIN 不升级；只有高置信 CORRECT 才可能成为 application evidence**。
4. 维持 Frozen Safety Boundary：V1.1 仍不得直接改写 status / recallLevel / nextReviewAt；
   只允许累积 application evidence（applicationLevel + usage 事件），且需经 Control Plane 单独批准。

## 3. 未来 LLM 分析契约（草案）

LLM analysis 输出新增结构化字段：

```ts
interface TargetExpressionUsage {
  itemId: string;
  attempted: boolean;        // 用户是否尝试使用该表达
  quote: string | null;      // 用户回答中的原话（quote grounding 必需）
  assessment: "CORRECT" | "ISSUE" | "UNCERTAIN";
  reason: string;            // 判定理由（简短，中文/英文均可）
}
```

字段要求：
- `quote` 必须逐字来自用户回答；无法定位 quote → 强制 `assessment = "UNCERTAIN"`。
- `assessment` 判定规则（草案）：
  - CORRECT：quote 存在，语义与搭配自然，无自我指涉/生硬元文本。
  - ISSUE：quote 存在但语义误用、搭配生硬、自我纠正。
  - UNCERTAIN：无法可靠判断（quote 缺失 / 语境歧义 / 低置信）。
- 输出位置：`analyzeSpeakingWithLlm` 的结构化分析结果（与现有 ieltsAnalysis 平级或嵌套），
  由 LLM provider 返回并经 zod 校验。

## 4. 状态影响规则（草案，未实现）

| assessment | application evidence |
|---|---|
| CORRECT（高置信） | 允许 applicationLevel 提升（cap 2）+ usage 事件 |
| ISSUE | 仅记录事件（observation），不改变状态 |
| UNCERTAIN | 不升级、不惩罚；仅记录 |

- 任何单次 CORRECT 不得改变 status / recallLevel / nextReviewAt（沿用 V1 铁律）。
- 仍需要 deterministic 兜底检测（如表达未出现 → attempted=false），不能仅依赖 LLM。

## 5. 验证计划（草案）

- 加入 PRODUCT-LOOP-02C 第 10 节规划的 EVAL-PL-02（USAGE_DETECTION_TRIPLET）与 EVAL-PL-03（NO_OVER_PROMOTION）。
- 人工抽样仲裁：LLM assessment 与人工判定的一致性抽查（首批 ≥ 20 条）。

## 6. 明确不做（本阶段）

- 不实现 detectTargetUsage / USED_CORRECTLY / USED_WITH_ISSUE / NOT_USED（V1 禁止项）。
- 不新增数据库表；不改变现有 review 调度。
