# Bad Case 026 — Retrieval Conflict Detection & Resolution

- **Case ID**: ELS-EVAL-026（RETRIEVAL_KNOWLEDGE）
- **Workstream**: DATA_RETRIEVAL
- **Status**: FIXED（product code）；最终 PASS 由独立 Eval Runner 在集成后判定，本 Builder 不声明 PASS
- **Branch**: `fix/eval-026-retrieval-conflict`
- **Base**: `43364c3`（M2-P3B final acceptance）
- **Eval reference**: `f0ac513`（integration/m3-p1，39-case eval system）
- **Latest failing run**: `m3-20260909-143153` → FAIL（S2，failure_layer=RETRIEVAL）

---

## 1. Problem

两条 `lexical_guidance` 对同一用法给出矛盾指导（register 冲突）时，检索均命中，
但产品无冲突检测/消解机制：矛盾 guidance 原样并列注入 prompt，且无任何可追踪的
消解记录（`conflict_resolution` 缺失）。

Frozen Gold 判定（m3-20260909-143153 实跑）：

| Row | 断言 | 结果 |
|---|---|---|
| r-conflict-detected | 检索层/prompt 层检测到冲突并处理（conflict_resolution 非空、可追踪） | **FAIL**（conflictDetected=true, resolutionTracked=false） |
| r-no-contradiction | 最终注入 guidance 不并列互斥断言 | PASS（fixture 文本自身含"冲突"字样，表层命中） |
| r-fixture-hit | fixture 冲突对象均被检索命中 | PASS |

## 2. Frozen Gold

`docs/ELS_EVALUATION_V1_1.json` → ELS-EVAL-026：

- **expected_behavior**：检索层或 prompt 层必须检测到冲突并处理，使最终词卡不输出
  自相矛盾的 guidance；具体消解策略（取主源 / 双源并陈并提示差异 / 降级注入等）由
  实现决定，并在 trace 中记录——**本 Case 不把任何未经 Product Decision 冻结的冲突
  优先级写进 Gold**。
- **must_not_happen**：词卡同时出现"A 场合禁用 / B 场合必用"类直接矛盾建议且无取舍
  或差异提示；把未冻结的优先级规则当作既定事实输出。
- **pass_criteria**：
  1. 词卡最终 guidance 无语义矛盾（无直接矛盾对并存）；
  2. generationMeta / trace 记录冲突检测结果与消解动作（`conflict_resolution` 非空、可追踪）；
  3. 若走"双源并陈"路线，必须携带差异提示。
- **notes [FIX-06]**：V1.0 的 "official > lexical_guidance / 按 sourceType/sourceId 取主源"
  优先级**未冻结**，V1.1 已删除；只要求 capability-oriented 三件事：检测、不矛盾、可追踪。
- **required_trace_fields**：`retrieval_query, knowledge_object_ids, conflict_detected,
  conflict_resolution, generation_meta, llm_raw_output`。

## 3. Before Evidence（m3-20260909-143153）

```json
{
  "row": "r-conflict-detected",
  "actual": { "conflictDetected": true, "resolutionTracked": false },
  "knowledgeObjectIds": ["pt-topic-environment", "fx-register-conflict-a",
                         "fx-register-conflict-b", "lg-register-writing-task2",
                         "lg-paraphrase-guidance"],
  "promptContextSnippet": "[Fixture 语域指引 A] 该词在正式学术写作中必须使用…\n[Fixture 语域指引 B] 该词在正式写作中应避免使用…"
}
```

Before 事实：

- `RetrievalResult` 只有 `{ matched, promptContext, knowledgeObjectIds }`，无任何冲突字段；
- `learn/card` 路由 `retrieval.executed` 硬编码 `conflict_detected: false, conflict_resolution: "capability_missing"`；
- 两条互斥 register 指引以 `[标题] guidance` 平铺并列注入 prompt，无差异提示。

## 4. Conflict Definition（按 Gold 与任务 §2 冻结）

对任意一对已命中 lexical_guidance 对象（同 `guidanceType` + 相同 `appliesTo.contexts` 组内）：

| 类型 | 定义 | 是否判 conflict |
|---|---|---|
| A. complementary | 多对象互相补充（不同维度 / 不同 register target / 同极性） | 否 |
| B. duplicate | 同 guidanceType + 同语境 + 规范化文本相同（冗余） | 否（记录 duplicate） |
| C. semantic conflict | 存在极性相反指令对（positive vs negative）且指向同一 register target（或均为词级总括指令） | **是** |
| D. precedence conflict | 不同 provenance/authority 结论不同 | 不自动判冲突（Gold [FIX-06]：优先级未冻结，不比较 provenance） |

Gold 026 对应 **C（actual semantic conflict）**：fixture 冲突对同为 `register_note` +
`writing-task2`，指令极性相反且 register target 均为"正式"。

### 确定性判定规则

- 分句：按 `。！？；;.!?\n，,` 切分 guidance 文本；
- 正向指令：`必须/应当/应/需/优先 + 使用/采用/用`、`must use / should use / …`；
- 负向指令：**必须绑定使用类动词**（`应避免使用/避免使用/禁止使用/禁用/不要用/不可用/不得用/勿用`、
  `should not use / must not use / avoid using / do not use / don't use`）——排除风格性
  "避免…表述/评价"（否则 `lg-hedging-writing`"学术写作中避免过于绝对的表述"会与 register
  正向指引误判冲突）；
- register target：`正式|学术|academic|formal|中性|neutral|口语|informal|colloquial|非正式|semi-formal|半正式`；
- 冲突 ⇔ 同一组内两对象存在 `(positive, t)` 与 `(negative, t')` 且 `t == t'`（含两者均为词级总括 `null`）。

## 5. Root Cause

1. `RetrievalResult` 无冲突检测输出契约（`conflict_detected / conflict_resolution`）；
2. `retrieveKnowledge` 无任何 conflict detector（Rule 1–4 只做匹配/排序/截断）；
3. `buildPromptContext` 平铺注入，无"双源并陈差异提示"机制；
4. 路由 `retrieval.executed` 如实上报 `capability_missing`（诚实但能力缺失）。

## 6. Options（Product Decision 比较）

| Option | 描述 | 误报风险 | 漏报风险 | 确定性 | 成本/延迟 | 结论 |
|---|---|---|---|---|---|---|
| A | 字符串/字段级规则 | 中（需绑定使用动词 + register target 才可控） | 低（fixture 场景全覆盖） | 高 | 低 | 采用（作为 C 的实现载体） |
| B | 基于 structured metadata 的 deterministic detection | 低（guidanceType + contexts + target 维度） | 低 | 高 | 低 | **采用** |
| C | LLM 判冲突 | — | — | 低（非确定性） | 高 | 拒绝 |
| D | 检测但不解决（仅 flag） | — | — | 高 | 低 | 作为 resolution 的一部分（并陈 + 提示），非唯一动作 |

不引入 vector DB / reranker / multi-agent（当前 KB 45 对象，Gold 明确小库适用）。

## 7. Decision

**Detection**：Option B —— 独立 deterministic helper `detectKnowledgeConflict(matches)`
（`lib/knowledge/conflict.ts`），纯函数、无 LLM、无优先级规则。

**Resolution Policy（冻结）**：`dual_source_with_conflict_note`
- 保留两个冲突对象并陈（Gold pass_criteria 3 允许"双源并陈"）；
- 在 `promptContext` 末尾附加确定性差异提示（告知 LLM 两条指引互斥、不得同时遵循、
  按当前词条与 IELTS 语域要求给出单一一致建议）；
- 不自动取舍 / 不建立优先级（Gold [FIX-06]：优先级未冻结，不得输出为既定事实）；
- `conflict_resolution = "dual_source_with_conflict_note"`，`conflict_detected = true`，
  `conflict_object_ids` 记录参与对象。

**为什么不是 suppress/select**：adapter 断言 `conflictDetected = hasConflictA && hasConflictB`
（两对象必须都留在结果中），且 Gold 允许双源并陈 + 差异提示；无冻结优先级时 suppress 违反
Gold 与 adapter。

## 8. False-positive Risk（设计防线）

| 场景 | 判定 | 防线 |
|---|---|---|
| 多对象互补（同极性） | no conflict | 极性必须相反 |
| 多对象互补（极性相反但 target 不同：正式 vs 口语） | no conflict | register target 必须一致 |
| 风格性"避免…表述/评价"（lg-hedging、lg-opinion） | no claim / no conflict | 负向指令必须绑定使用类动词 |
| "避免口语化…，优先中性/学术"同一长句 | 分句后 target 分离 | `，` 参与分句 |
| 同内容重复（lg 重复对象） | duplicate（非语义冲突） | 规范化文本相同 → duplicate |
| retrieval miss / 单条命中 | no conflict | 组内对象数 ≥2 才比较 |

## 9. Implementation

**Files changed**：

| 文件 | 变更 |
|---|---|
| `lib/knowledge/conflict.ts`（新） | `detectKnowledgeConflict()` + `buildConflictNote()` 纯函数 helper |
| `lib/knowledge/types.ts` | `RetrievalResult` 增 `conflict_detected / conflict_resolution / conflict_object_ids`；`GenerationMeta` 增 `conflictDetected? / conflictResolution?` |
| `lib/knowledge/retrieval.ts` | 命中截断后运行 detector；检出冲突时 promptContext 追加差异提示；返回冲突字段 |
| `lib/llm/tasks/generate-word-card.ts` | 将检索冲突结果写入 `generationMeta`（Gold pass_criteria 2） |
| `lib/learning/types.ts` | `SeedLearningItem.generationMeta` 同步扩展 |
| `app/api/learn/card/route.ts` | LLM 生成路径新增第二条 `retrieval.executed`（知识层检索：ids / miss / conflict 字段）；seed-lookup 事件保持原契约不变 |
| `tests/unit/badcase-026-retrieval-conflict.test.ts`（新） | 16 个断言，覆盖 §8 全部防线 + trace + BC-035 回归 |
| `docs/v3/badcases/026-retrieval-conflict.md` | 本证据文档 |

**Trace Contract（复用 M2，不新增字段）**：`retrieval.executed.conflict_detected` /
`conflict_resolution`（既有字段）；知识层事件在生成路径新增第二条（事件流 append-only，
`[0]` 仍为 seed 查找，`m2-trace-phase2` 与 `els-eval-035` 读取 `[0]` 的断言不受影响）。

**未改动**：Frozen Gold、`tests/eval/**`、`scripts/eval/**`、BC-033、Supabase migrations、
Admin UI、无关 Knowledge fixtures、Eval Runner。

## 10. Regression

| 验证 | 结果 |
|---|---|
| `tsc --noEmit` | PASS |
| `next build` | PASS |
| badcase-026 tests | 16/16 PASS |
| BC-035 tests | 21/21 PASS |
| M1 ELS-EVAL-037/038 | PASS |
| M2 Phase 1 + Phase 2 trace tests | PASS |
| M2-P3A/P3B（m2-console-* + m2-ac-acceptance） | PASS |
| full unit | 299 passed / 1 failed（唯一失败 = 历史已知 `llm-safety.test.ts` 静态 import 断言，008/035 分支同样存在，与本改动无关） |

Test fixture 说明：冲突对象以 `provenance=fake-fixture`（Gold 026 许可）在测试层注入
`data/knowledge/knowledge-objects-v1.json`，`finally` 恢复原字节；产品数据未被污染。

## 11. Expected Eval Outcome

集成后由独立 Eval Runner 重新执行 ELS-EVAL-026：

- `r-conflict-detected`：`conflictDetected=true`（双对象并陈）+ `resolutionTracked=true`
  （`RetrievalResult` 含 `conflict_resolution`）→ 预期 **PASS**；
- `r-no-contradiction`：差异提示存在 → 保持 **PASS**（且从表层"冲突"字样命中转为真实
  语义防线）；
- `r-fixture-hit`：不变 **PASS**。

**本 Builder 不声明 ELS-EVAL-026=PASS**；最终判定仅由独立 Eval Runner 合并后给出。
