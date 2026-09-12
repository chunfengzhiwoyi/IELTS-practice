# PRODUCT-LOOP-04D — Evidence → Learner State Mapping Design

> Speaking→Vocabulary V1.1：把已验证的口语正确使用证据（Validated TargetExpression Evidence）安全地映射为长期应用能力状态（applicationLevel）。
> **本任务只设计，不实现。** 任何写回必须等 04E 独立 implementation task + Control Plane 批准。

**AGENT**: 豆包c
**BASE**: 9a7710a（canonical repo/arch-consolidate）
**STATUS**: READ_ONLY_DESIGN；PRODUCT_CODE_MODIFIED = NO；LONG_TERM_STATE_WRITEBACK = NO

---

## 1. 现有状态模型审计（基于代码，非假设）

### 1.1 applicationLevel 当前现实（第 4/5 节）

| 项 | 现状（已核实） |
|---|---|
| 类型 | `UserItemState.applicationLevel: number`（`lib/learning/types.ts`） |
| 初始化 | 恒为 `0`：learn submit route、review submit route、demo-service（2 处）、demo-review-seed —— 全部 `applicationLevel: 0` |
| 写入路径 | **无**（没有任何 runtime 代码递增/递减它；`git grep` 全仓确认） |
| 读取路径 | 仅 `lib/speaking/target-selection.ts`：`=== 0` → 优先级 +1（"还未在口语中用过"）；`>= 2` → 优先级 −1（"让位给更需要巩固的"） |
| Planner | **不读取** applicationLevel（`lib/planner/*` 无引用） |
| Report | **不读取** applicationLevel（`lib/report/*` 无引用） |
| 语义 | **SEMANTICS_PARTIAL**：注释只有"从未在口语中应用 / 已多次应用"的模糊意向；0/1/2 每级无正式定义 |

结论：applicationLevel 是**设计好但从未接线**的字段。它不参与记忆调度、不参与 Planner、不参与 Report；唯一消费方是 target-selection 的 ±1 优先级。这给了本任务一个低风险的接入窗口：**映射设计只需要与 target-selection 的现有语义兼容**。

### 1.2 相邻状态字段（第 36–39 节）

- `status: LearningStatus = NEW | EXPOSED | RECALLED_WITH_HELP | RECALLED_INDEPENDENTLY` —— **不存在 MASTERED**。status 是回忆导向（回忆任务证据驱动），与 application 是不同维度。
- `recallLevel / recognitionLevel: number` —— 由 Learn/Review 任务证据驱动。
- `currentIntervalDays / nextReviewAt` —— 由 `lib/review/review-schedule.ts` 固定映射驱动：CORRECT_INDEPENDENT=72h、CORRECT_WITH_HINT=24h、INCORRECT=4h、SKIPPED=2h。确定性、无 AI、与 application 无关。
- `consecutiveCorrect` —— 复习连续性计数。
- `LearningEvent.eventType = "NEW" | "REVIEW"` —— **无 APPLICATION 事件类型**。

### 1.3 Speaking 证据现状（第 9 节基础）

- `ValidatedTargetExpressionEvidence`：`itemId / attempted / quote / assessment (CORRECT|ISSUE|UNCERTAIN|NOT_USED) / reason / upgradeCandidate / validatorNotes`（`lib/speaking/types.ts`）。
- 04B validator（`lib/speaking/target-expression-evidence-validator.ts`）：itemId 白名单、枚举、quote grounding、missing→UNCERTAIN、duplicate→UNCERTAIN、短回声守卫、`upgradeCandidate` 仅当最终 assessment===CORRECT。
- 04C 真实质量（deepseek/deepseek-chat ×3 轮）：AVG CORRECT precision 0.9792、AVG recall 0.7302、FALSE_CORRECT 0/0/1（M45 GOLD_DISPUTE）、GROUNDING_VIOLATIONS 0。
- SpeakingSession 已含：`questionId / part / topic / question / firstAnswer / firstAnalysis / secondAnswer / secondAnalysis / createdAt / suggestedExpressions` —— 跨上下文（questionId/topic/part）与重试（first→second）元数据**全部现成**，无需新增。
- 持久化现实（第 34/35 节）：Memory 实现完整（session + analysis 含 evidence 可读回）；Supabase 无对应列（suggestedExpressions 读回恒 []，`SUPABASE_EVIDENCE_PERSISTENCE=NOT_IMPLEMENTED`）。

---

## 2. 核心原则（第 6–8、16、50–51 节）

1. **Evidence 与 State 分离**：`ApplicationEvidenceRecord`（发生了什么，事实记录）vs `applicationLevel`（基于证据历史推导的当前能力总结）。
2. **派生而非直接变更**：`applicationLevel` 由证据历史**确定性重算**（RECOMPUTABLE_FROM_HISTORY=YES），不做"每来一条证据 +1"的直接变异。
3. **三个维度不坍缩**：Recall（能不能想起来）/ Application（能不能实际用对）/ 综合 Status（更高层）各自独立建模。Speaking CORRECT **绝不**改 recallLevel、status、nextReviewAt、review schedule。
4. **可解释优先**：用确定性 threshold + state machine，不用不透明分数、不用动态权重。
5. **一次正确 ≠ 掌握**：单条 validated CORRECT 最多说明"这一次回答中出现了一次 grounded 正确使用"。

---

## 3. Evidence History 模型（第 9–12 节）

### 3.1 ApplicationEvidenceRecord（proposal，04E 落地用）

```ts
interface ApplicationEvidenceRecord {
  evidenceId: string;          // 确定性：hash(userId|itemId|sessionId) 或 UUID
  userId: string;
  itemId: string;
  sessionId: string;           // 幂等键：同一 (sessionId, itemId) 至多一条
  questionId: string;          // 跨上下文派生用（denormalize 自 session）
  part: "P1" | "P2" | "P3";
  topic: string;               // 跨上下文派生用
  assessment: "CORRECT" | "ISSUE" | "UNCERTAIN" | "NOT_USED"; // 只存 validated 后的
  quote: string | null;        // grounding 锚（CORRECT/ISSUE 非空）
  reason: string;              // validator/LLM 判据摘要
  validatorNotes: string[];    // 降级/修复说明（可空）
  upgradeCandidate: boolean;   // == (assessment === "CORRECT")
  recoveredViaRetry: boolean;  // first=非CORRECT → second=CORRECT（第 28/30 节）
  recordedAt: string;          // ISO；derivation 的日历日判定用
  pipelineVersion: string;     // 如 "04B-validator-1"
  provider: string | null;     // 如 "deepseek"（不存 key）
  model: string | null;        // 如 "deepseek-chat"
}
```

不新增无必要字段：session 元数据（questionId/part/topic）从 session 可查，但为 derivation 性能 denormalize；provider/model 用于未来 pipeline 升级时重新解释（第 25 节），不存 secret。

### 3.2 幂等 / 去重（第 11–12 节）

- **唯一键 `(sessionId, itemId)`**：一个 Speaking session 对一个 target item **最多一条最终 evidence**。重试分析、页面刷新、重复 analyze 一律 upsert 覆盖，不产生第二条。
- 同 session 内多次出现（用户把表达说 3 次）→ 不累计，仍是一条 session-level evidence。
- first/second 双分析：同 session 内合并为一条，取最终判定（second 存在则以 second 为准；`recoveredViaRetry = first≠CORRECT && second==CORRECT`）。
- **DEDUPE: YES**；**IDEMPOTENCY_RULE: unique(sessionId, itemId), upsert semantics**。

---

## 4. applicationLevel 语义（第 17–19 节）

范围：**0 / 1 / 2**（当前字段为 number，建议运行时用 union `0|1|2` 约束）。每一级定义如下（**非"低/中/高"模糊描述**）：

| Level | 名称 | 定义 | 是否说明"能力已稳定" |
|---|---|---|---|
| 0 | `NO_STABLE_APPLICATION_EVIDENCE` | 尚无足够跨 session 的正确使用证据。可能已出现过 1 条 CORRECT，但不足以构成稳定应用能力 | 否 |
| 1 | `EMERGING_APPLICATION` | 已在 ≥2 个独立 Speaking session 中产生 validated CORRECT（同一 session 重试不重复计），说明多次正确使用过，但证据量与时间/上下文独立性仍不足以认为稳定 | 否 |
| 2 | `STABLE_APPLICATION` | 累计 ≥3 条 validated CORRECT，来自 ≥3 个独立 session、跨 ≥2 个不同日历日、跨 ≥2 个不同 context（questionId 或 topic），说明在多个独立场景持续正确应用 | 是（限定于"应用维度"；≠ mastery，≠ IELTS 能力） |

**阈值性质声明（第 19/53 节）**：2 次 / 3 次 / 2 天 / 2 context 为 **conservative V1 heuristic**，标记 `HEURISTIC_NOT_PEDAGOGICALLY_VALIDATED`。精确数值是否最优属于 `NEEDS_PEDAGOGY_EVIDENCE`（未来数据调参），不阻塞 V1。

---

## 5. 状态机与确定性派生规则（第 16、32 节）

### 5.1 派生函数（proposal，04E 实现）

```
输入：该 (userId, itemId) 的全部 ApplicationEvidenceRecord
过滤：assessment == CORRECT（upgradeCandidate == true）
去重：每个 sessionId 取一条（幂等键）
计数：
  C = 去重后 CORRECT session 数
  D = 这些 session 中 distinct 日历日（recordedAt 的日期）数
  K = 这些 session 中 distinct context 数（distinct questionId ∪ distinct topic，取较大口径；确定性元数据，无 LLM）
规则：
  C < 2            → Level 0
  C >= 2 且 C < 3  → Level 1
  C >= 3 且 D >= 2 且 K >= 2 → Level 2
  其他 C >= 3 情况（D<2 或 K<2）→ Level 1
```

### 5.2 晋级规则

- **0 → 1**：`C ≥ 2`，且 2 条来自 **2 个不同 session**（非同一 session 的 immediate retry —— 去重已保证）。
- **1 → 2**：`C ≥ 3`（≥3 sessions）+ `D ≥ 2`（跨 2 天）+ `K ≥ 2`（跨 2 语境）。

### 5.3 降级 / 衰减（第 20、47–48 节）

- **DEMOTION_POLICY: 无自动降级（V1）**。单次 ISSUE 绝不降级（一次失误 ≠ 能力消失）。V1 不设计任何降级路径。
- **DECAY_POLICY: V1 不自动衰减**。证据永久累计（时间窗口 = 永久）。衰减/降级需要真实数据与教学证据 → `NEEDS_PEDAGOGY_EVIDENCE`，未来单独设计。跨 2 天要求（L2）是 V1 中最轻的"时间跨度"代理，不引入 decay 数学。

---

## 6. 各评估值行为（第 20–24 节）

| assessment | 行为 |
|---|---|
| **CORRECT**（validated, upgradeCandidate） | 唯一正向候选证据；计入 C/D/K；但单条不单独推动任何晋级（C≥2 才可能 L1，C≥3 才可能 L2） |
| **ISSUE** | 记录为 `application difficulty evidence`（供审计/练习定向/未来 Report）；**不**降级、**不**改 recallLevel/status/nextReviewAt/review schedule、**不**重置已累计 CORRECT 计数、不阻止后续晋级（V1 中 promotion 只看 CORRECT 计数） |
| **NOT_USED** | **NO-OP**（suggestion 是 OPTIONAL，不用不失败）：不降级、不提前 nextReviewAt、不改 status |
| **UNCERTAIN** | **NO-OP**：不正向、不惩罚（04A 冻结原则） |

### 6.1 ISSUE 的保守设计说明

ISSUE 在 V1 只做三件事：①存证据记录；②可在 Report 中作为"近期应用困难"描述（evidence-grounded）；③未来可作为 practice targeting 信号。**不进入记忆调度、不改状态**（第 37/38 节冻结）。重复 ISSUE 是否应触发"应用能力观察期"（阻止晋级窗口）——列为未来 tuning 项，V1 不做（避免在 precision-first 下制造二次保守叠加）。

---

## 7. 边界冻结（第 36–40 节）

| 项 | 决定 | 理由 |
|---|---|---|
| Speaking CORRECT → recallLevel +1 | **NO** | Recall 证据来自回忆/复习任务；Application 证据来自真实使用；分别建模 |
| Speaking CORRECT → status 改变 | **NO** | status 是回忆导向枚举（无 MASTERED）；applicationLevel=2 ≠ status 变化，默认独立维度 |
| Speaking CORRECT → nextReviewAt 延后 | **NO（V1）** | 不让一次开放式口语表现破坏现有确定性 review schedule |
| Speaking ISSUE → nextReviewAt 提前 | **NO** | 不直接篡改记忆调度；只作未来 recommendation/targeting 信号 |
| Speaking CORRECT → MASTERED / IELTS 提升 | **NO** | 单条/应用维度证据都不推导 mastery |
| applicationLevel → Planner 输入 | **不改动** | 已核实 Planner 不读 applicationLevel；04D 不强行加入 |
| applicationLevel → target-selection | **保持并显式化**（第 8 节） | Level 0 +1 优先级（创造机会）；Level 1 无加成（仍需练习）；Level 2 −1（让位）；**不永久移除**（现有逻辑即如此） |

---

## 8. 与产品消费方的交互（第 40–42 节）

### 8.1 target-selection（唯一现有消费方）

Level 提升后自然降低该词作为 target 的优先级（0→+1、≥2→−1），符合产品逻辑：
- **Level 0**：优先创造使用机会（把"学过但没在口语用过"变成"用过"）。
- **Level 1**：仍需练习，无加成/无惩罚。
- **Level 2**：降低出现频率，让位给更需要巩固的表达；**不永久移除**（保持 V1 逻辑，避免"已稳定就永远不出现"的退化）。

### 8.2 Report（第 41 节）

未来 Report 必须用 **evidence-grounded 措辞**：
- ✅ "本周你在 3 个不同口语场景中正确使用过这个表达"
- ❌ "你已经掌握了这个表达"
- 建议新增 `applicationSummary`（per item）：`correctSessions / distinctDays / distinctContexts / level`，展示为"应用记录"，**不夸大为 mastery**。现有 `SpeakingObservation` 是维度级模式观察，与本设计互补（本设计是表达级）。

### 8.3 Planner

**不改动**。Planner 不读 applicationLevel，04D 不强行加入（避免扩大范围）。

---

## 9. 20 个 Evidence History 场景（第 43 节）

确定性规则下每个场景：`Expected applicationLevel` + `Why` + `What does NOT change`。

| # | 场景 | 去重后计数 | 期望 Level | Why | 不改变 |
|---|---|---|---|---|---|
| S01 | 0 evidence | C=0 | **0** | 无证据 | 一切 |
| S02 | 1 CORRECT（1 session） | C=1 | **0** | C<2；单条不晋级 | recallLevel/status/nextReviewAt/schedule 全不变 |
| S03 | 2 CORRECT 同一 session（first+second 都正确） | C=1 | **0** | 去重 → 1 session 1 条 | 同上；**演示幂等** |
| S04 | 2 CORRECT、2 个 session、同日 | C=2 | **1** | 满足 C≥2 跨 2 session | 其他维度不变 |
| S05 | 2 CORRECT、2 个不同日 | C=2 | **1** | C≥2；跨日仅 L2 才要求 | 同上 |
| S06 | 3 CORRECT、3 session、同日、同题 | C=3, D=1, K=1 | **1** | 不满足 D≥2 / K≥2 → 不能 L2 | 同上 |
| S07 | 3 CORRECT、3 session、2 天、2 语境 | C=3, D=2, K=2 | **2** | 满足全部 L2 条件 | 记忆/复习维度不变 |
| S08 | CORRECT + ISSUE | C=1 | **0** | C<2；ISSUE 只记录不惩罚 | ISSUE 不改调度/状态 |
| S09 | CORRECT + NOT_USED | C=1 | **0** | NOT_USED=NO-OP | 无负向 |
| S10 | CORRECT + UNCERTAIN | C=1 | **0** | UNCERTAIN=NO-OP | 无负向 |
| S11 | 2 CORRECT + 后置 ISSUE | C=2 | **1**（保持） | L1 已达成；ISSUE 不降级不重置 | 不降回 0 |
| S12 | Level 2 + 1 次 ISSUE | C≥3 | **2**（保持） | 单次 ISSUE 绝不降级 | 不降回 1 |
| S13 | 重试 ISSUE→CORRECT（同一 session） | C=1 | **0** | recoveredViaRetry 仍只算 1 session 1 条；不能单独推动稳定等级 | 不晋级 |
| S14 | 同一 session 三次重试全 CORRECT | C=1 | **0** | 同 session 去重；次数不累计 | 不晋级 |
| S15 | 2 个不同 question、同日（2 session） | C=2, K=2, D=1 | **1** | L1 满足；L2 仍需跨日 | 不升 L2 |
| S16 | 同 question 跨不同日（2 session） | C=2, D=2, K=1 | **1** | L1 满足；L2 需跨语境 | 不升 L2 |
| S17 | 多目标：A 有 3 session CORRECT（2 天 2 语境），B 无 | A: C=3,D=2,K=2 → **2**；B: C=0 → **0** | **per-item 独立** | 证据按 itemId 分别派生，绝不串台 | B 不受 A 影响 |
| S18 | 1 条假设假阳性 CORRECT + 无其他 | C=1 | **0** | 单条 FP 无法晋级（§31/44/45） | 状态全不变 |
| S19 | 旧 pipeline 证据（无 pipelineVersion）+ 新 pipeline 1 条 CORRECT | 新 C=1 | **0** | 只计已验证 pipeline 版本（≥`04B-validator-1`）；旧证据保留但不可计 | 旧记录不丢弃（audit） |
| S20 | 重复 session evidence（同 sessionId+itemId 被重复 analyze/刷新） | C=1 | **0**（若仅此 session） | 幂等键去重；不重复计为多条能力证据 | 不因刷新虚增 |

---

## 10. 反事实安全 / 假阳性韧性 / 假阴性容忍（第 31、44–46 节）

### 10.1 单条孤立 CORRECT（§44）

任何单条 evidence，无论 pipeline 精度多高，`C=1 < 2` → 无法 0→1；更无法 Mastered / 延长 review interval（review 调度不读 application 证据）。**满足反事实安全**。

### 10.2 假阳性韧性（§45，STATE_MAPPING_SAFETY_TEST）

| 假设 | 需要 | 概率（precision≈0.98，近似独立） | 结果 |
|---|---|---|---|
| 1 条 FP 造成晋级 | 不可能（C≥2） | — | 安全 |
| 2 条 FP（2 session）造成 L1 | 2 次独立 FP 且同 item | ~0.02² ≈ 0.0004 | 极小；且 L1 无写回副作用（仅 target-selection +1 与 Report 描述） |
| 3 条 FP（3 session）造成 L2 | 3 次独立 FP + 跨 2 天 + 跨 2 语境 | ~0.02³ ≈ 8e-6 | 可忽略 |

**multi-evidence accumulation 正是 04C precision≈0.98（非 100%）的安全余量**（§26）。若未来改用精度更低的模型，此阈值仍成立但应重新评估。

### 10.3 假阴性容忍（§46）

recall≈0.73 意味着真实正确使用可能漏记。阈值 C≥2/C≥3 偏低（**不是** 10 次），使得 recall 损失不会导致 Level 永远升不上去；代价是"真实应用 3 次只记到 2 次"的用户会较晚到 L2（保守、可接受）。precision-first 与 evidence threshold 的 tradeoff：**阈值取低、积累取多**，风险不对称性（FP 更危险）由"跨 session + 跨日 + 跨语境"的组合要求而非高计数来兜底。**不盲目提高阈值**。

---

## 11. 时间窗口 / 衰减（第 47–48 节）

- V1：**永久累计**（无 rolling window、无 decay）。理由：缺乏 decay 的教学证据；且 L2 已隐含"跨 ≥2 天"的时间跨度代理。
- 明确标记：decay 曲线、窗口长度 = `NEEDS_PEDAGOGY_EVIDENCE`，未来基于真实学习数据（观察 L2 用户在数周/数月后的真实应用保持率）再设计，**不在初版制造复杂 decay**。

---

## 12. 持久化 / 可重算 / 跨设备（第 34–35、50–51 节）

- **逻辑模型 vs 生产持久性分离**：
  - 逻辑模型：`ApplicationEvidenceRecord` 表（proposal）+ deterministic derivation —— applicationLevel 永远可从历史重算（`RECOMPUTABLE_FROM_HISTORY=YES`；删除 derived 字段不影响恢复）。
  - 生产现实：Memory persistence 完整（session 含 evidence 可读回）；**Supabase persistence NOT_IMPLEMENTED**（无 migration，本任务禁止创建）。
- **Supabase 最终至少需持久化（04E 的 data model proposal，非本任务 migration）**：
  - `application_evidence` 表：上表字段（含 sessionId/itemId 唯一约束实现幂等）。
  - 可选 `user_item_state.application_level` 列复用（derived 缓存，可从 evidence 表重建）。
- **跨设备声明**：evidence 仅存 Memory 期间，applicationLevel **不得**宣称 durable / cross-device；跨设备需 Supabase 落地后才成立。报告/UI 不得在 Memory-only 阶段承诺跨设备能力。
- **可审计性**：Level 2 的"为什么"= 列出 C 条 CORRECT 的 sessionId/日期/语境 + pipelineVersion（§50）。**可重建性**：清空 derived 值只凭 evidence 历史可重算（§51）。

---

## 13. 事件模型（第 49 节）

04E 建议区分两类事件（**proposal，不实现**）：

| 事件 | 类型 | 含义 |
|---|---|---|
| `APPLICATION_EVIDENCE_RECORDED` | evidence event | 事实：一条 validated evidence 已落库（CORRECT/ISSUE/UNCERTAIN/NOT_USED 都可能触发） |
| `APPLICATION_LEVEL_CHANGED` | derived state change event | 副作用：derivation 后 Level 0→1 / 1→2 变化通知（target-selection 缓存失效 / Report 更新） |

绝不把两者混成一个事件；evidence event 是唯一事实源，level event 只是派生结果的通知。

---

## 14. M45 设计层 Adjudication（第 27 节）

**ADJUDICATION_RECOMMENDATION: 未来 Gold v2 应将 M45|seed-016 修正为 CORRECT**。

依据：
- 04A 冻结契约 §9D："目标表达本身正确即可；允许句子中存在其他无关错误"。M45 的 `is/are` 主谓一致错误位于目标表达 `pros and cons` 之外（搭配本身正确、语义成立）。
- 04C 模型理由与 §9D 一致；Gold 把句级语法错误计入表达内判定，偏严。
- 影响：若修正，三轮 FALSE_CORRECT = 0/0/0；04C 结论（EVIDENCE_QUALITY_GOOD_ENOUGH_FOR_STATE_MAPPING_DESIGN）不变甚至更强。
- **禁止**：重写历史 04C artifact、重算旧 metrics。仅作为未来 Gold v2 adjudication 记录（等待 Control Plane 仲裁）。

---

## 15. Findings

| 级别 | 发现 |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | ① `applicationLevel` 无写入路径是既有债务，04E 必须为"仅派生写入"建立纪律（防止未来出现第二处直接变异）；② retry-recovered CORRECT 与独立 session CORRECT 的完全等价性待数据验证（V1 靠去重 + C≥2 兜底，已安全）；③ 阈值 2/3/2/2 无教学实证 → `HEURISTIC_NOT_PEDAGOGICALLY_VALIDATED`，需真实数据调参 |
| NEEDS_PEDAGOGY_EVIDENCE | 精确阈值（2/3/2/2 是否最优）、decay 曲线、降级规则、L1 是否需要最小时间跨度 |

---

## 16. 20 问总答（第 54 节）

1. **applicationLevel 是什么**：用户在某表达上的**应用能力派生状态**（基于 validated Speaking 证据历史），非记忆/复习维度。
2. **0/1/2 每级含义**：0=`NO_STABLE_APPLICATION_EVIDENCE`（可能已有 1 条 CORRECT，但不足稳定）；1=`EMERGING_APPLICATION`（≥2 独立 session 正确使用，尚不稳定）；2=`STABLE_APPLICATION`（≥3 session / ≥2 天 / ≥2 语境，多场景持续正确）。
3. **哪些证据计入**：仅 `validated CORRECT`（upgradeCandidate=true），且 pipelineVersion ≥ 04B-validator-1。
4. **哪些不计入**：ISSUE（只记录）、NOT_USED、UNCERTAIN、raw LLM 输出、无 provenance 的旧证据。
5. **同 session 去重**：YES —— `(sessionId, itemId)` 唯一，至多一条最终证据。
6. **跨 session 要求**：YES（L1 起 C≥2 跨 2 session）。
7. **跨日要求**：L1 不要求；**L2 要求 D≥2**。
8. **跨 context 要求**：L1 不要求；**L2 要求 K≥2**（distinct questionId/topic，确定性元数据，无 LLM）。
9. **ISSUE 处理**：记录为 difficulty evidence；不降级、不改调度、不重置计数、不阻止晋级（V1）。
10. **NOT_USED**：NO-OP（OPTIONAL 契约）。
11. **UNCERTAIN**：NO-OP。
12. **允许 demotion**：V1 不允许（单次 ISSUE 绝不降级；无自动降级路径；未来数据驱动设计）。
13. **recallLevel 是否改变**：**NO**。
14. **review schedule 是否改变**：**NO**（延后/提前都不做）。
15. **status 是否改变**：**NO**（status 无 MASTERED，独立维度）。
16. **Evidence History 持久化**：Memory 完整；Supabase 需新表（04E proposal）；本任务不建 migration。
17. **applicationLevel 可重算**：YES（evidence → derive 纯函数）。
18. **target-selection 使用**：保持现有 0→+1、≥2→−1 优先级；Level 不永久移除表达。
19. **Report 表达**：evidence-grounded 措辞（"N 个场景正确使用"），不写"掌握"。
20. **下一步实现**：04E —— 建 evidence 表 + derivation 纯函数 + session 分析落库钩子 + 幂等约束 + target-selection 读取已存在无需改；Planner/记忆调度零改动。

---

## 17. Product Decision（第 52 节）

**STATE_MAPPING_DECISION = `STATE_MAPPING_DESIGN_READY_FOR_IMPLEMENTATION`（A）**

依据：
- 语义（0/1/2）、阈值规则（C/D/K）、事件模型、状态边界、幂等、可重算、审计均已明确到可编码程度；
- 关键安全性质已证明（单条不可晋级、FP 韧性、ISSUE 不惩罚、三维度隔离）；
- 阈值标记为 HEURISTIC_NOT_PEDAGOGICALLY_VALIDATED，不阻塞 V1 实现（§53：允许 conservative product heuristic）；
- 剩余教学不确定项（decay/降级/精确阈值）已明确列为未来数据驱动项，不属于"无法安全确定核心规则"。

**LONG_TERM_STATE_WRITEBACK: NO**（04E 独立实现任务 + Control Plane 批准后才会发生）。

## 18. Next Phase

**PRODUCT-LOOP-04E（IMPLEMENT-EVIDENCE-STATE-MAPPING）**：
1. `ApplicationEvidenceRecord` 表（Supabase proposal，经 Control Plane 批准后建 migration）
2. `deriveApplicationLevel(evidence[])` 纯函数（C/D/K 规则 + 单测覆盖 S01–S20）
3. speaking analyze 落库钩子（幂等 upsert，`(sessionId,itemId)` 唯一）
4. target-selection 已读 applicationLevel，无需改动（验证派生值与现有 ±1 语义一致）
5. 明确不做：recallLevel/status/nextReviewAt/review schedule 任何改动；Planner 不改。
6. M3 维持 PAUSED。
