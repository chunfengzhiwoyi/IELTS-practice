# PRODUCT-LOOP-04B — SPEAKING→VOCAB EVIDENCE PIPELINE

> 状态：**IMPLEMENTED**（04B worktree，`feature/product-loop-04b-speaking-vocab-evidence`）
> 基线：`0b7d773`（canonical `repo/arch-consolidate`；04A 审计以 branch `audit/product-loop-04a-speaking-vocab-evidence`@`7761aa5` 只读方式作知识输入，未集成 canonical）
> 本任务只实现 **evidence pipeline**；**LONG_TERM_STATE_WRITEBACK = NO**。
> 质量证明（真实 CORRECT precision）属于 **PRODUCT-LOOP-04C**，本任务不宣布。

---

## 1. 04A Findings（本任务输入）

- 简单规则 / string match 不足以可靠判断"用户是否正确使用"目标表达。
- CORRECT precision **0.8077**（21/26），FALSE_CORRECT=5：
  - **SEMANTIC_MISUSE ×4**（E20–E23：canonical 短语完整出现，但语义角色/搭配对象错误）
  - **DEFINITIONAL_META_ECHO ×1**（G31：定义式复述，非应用）
- 直接写回 26 个 candidates 中 **19.2% 虚假升级** → 04B 冻结 LONG_TERM_STATE_WRITEBACK=NO。
- `applicationLevel` 语义部分成立（`SEMANTICS_PARTIAL`），本任务不改。
- **SECOND_LLM_CALL_REQUIRED = NO** → 复用现有 Speaking analyzer 同一次 LLM 调用。

## 2. Wiring Before / After（04A Finding #1 修复）

**Before**：`suggestedExpressions` 生成于 session response，但没有可靠进入 analyze pipeline。

**After**：
1. `SpeakingSession.suggestedExpressions?: SuggestedExpression[]`（可选，兼容旧构造/旧记录）
2. `app/api/speaking/session/route.ts`：session 创建时写入 **frozen snapshot**（itemId / canonicalForm / meaning）
3. `app/api/speaking/analyze/route.ts`：按 `sessionId` 从 repository 读回 `session.suggestedExpressions ?? []`，传入 analyzeSpeakingWithLlm
4. **禁止 analyze 时重新调用 selectTargetExpressions()**——learner state 在 session 建立后改变，analyze 的 targets 不漂移（T04 覆盖）
5. **Server authority**：客户端不可注入 target（RequestSchema 无该字段；LLM 输出白名单外 itemId 被 validator drop，T05 覆盖）

## 3. Session Target Snapshot（frozen）

```ts
export interface SuggestedExpression {
  itemId: string;
  canonicalForm: string;
  meaning: string;
}
```

- snapshot 随 session 持久化；后续 learner state 变化不改变"这次 Speaking 当时被提示了什么"。
- 0 targets → `[]` → analyzer 正常工作，evidence=[]（T03 覆盖）。
- Explicit question override（02C 冻结行为）不受影响。

## 4. LLM Schema Extension（同一次调用）

`EnhancedAnalysisSchema` 新增与 `ieltsAnalysis` 平级的可选子对象（zod，语义不变形）：

```ts
targetExpressionUsageEvidence: z.array(z.object({
  itemId: z.string(),
  attempted: z.boolean(),
  quote: z.string().nullable(),
  assessment: z.enum(["CORRECT", "ISSUE", "UNCERTAIN", "NOT_USED"]),
  reason: z.string(),
})).optional()
```

**NEW_LLM_RUNTIME_CALL = NO**——仍是现有 Speaking analyzer 那一次 LLM analysis；只扩展 prompt/schema。JSON_EXAMPLE 同步更新。

## 5. Prompt Semantic Rules（buildSystemPrompt 注入 EVIDENCE_RULES）

| 规则 | 内容 |
|---|---|
| OPTIONAL 语义 | suggestedExpressions 是 OPTIONAL SYSTEM SUGGESTIONS；NOT_USED ≠ error / 质量惩罚 / vocab failure |
| CORRECT 四条件 | ① 确实被尝试/使用 ② 语义适合当前句子 ③ 核心搭配/结构正确 ④ quote 来自原始 answer ⑤ 非单纯重复提示词 |
| 定义式/元语言回声 | 念出表达、解释含义、讨论"这个短语是……" → 不得 CORRECT → UNCERTAIN / ISSUE |
| 语义误用 | canonical 完整出现但语义角色/搭配对象错误 → ISSUE（04A 最大 FALSE_CORRECT 来源） |
| 屈折变体 | 允许 take it / took it / taking things for granted 等自然变化，LLM 判断是否真实使用 |
| 自纠（先错后改） | 最终出现清晰、grounded、语义正确的使用 → 可 CORRECT，quote 指向最终正确 span |
| 先对后错 | 不能机械取"曾经有 correct span"；最终意图冲突无法判断 → UNCERTAIN |
| 不确定性 | 语义适配/是否属于目标表达/是否 echo/最终修正意图不明确 → UNCERTAIN（precision-first） |

LLM 输入仅含 itemId / canonicalForm / meaning 最小上下文；不暴露 recallLevel / review schedule / mastery state。

## 6. Deterministic Validator

`lib/speaking/target-expression-evidence-validator.ts`（纯函数，不依赖 LLM）：

- **白名单**：evidence.itemId 必须 ∈ session frozen targets；越界 drop（不进 validated、不扩张 targets）
- **枚举**：assessment 严格 ∈ 4 值；非法 → 该条无效
- **Grounding**：CORRECT/ISSUE 必须 quote 非空且规范化后存在于 answer（`normalizeEvidenceText`：小写/空白压缩/边缘标点/引号；安全变换，不大幅改写用户文本）；失败 → UNCERTAIN + `grounding_*` note
- **NOT_USED contract**：quote 必须 null 且 attempted=false；违者保守降级
- **CORRECT/ISSUE attempted**：必须 attempted=true；矛盾不接受原样
- **Missing item**：模型漏判 ≠ NOT_USED → 每条缺失 target 补 UNCERTAIN（`missing_or_invalid_model_evidence`）
- **Duplicate**：同 itemId 多条一致 → 合并；冲突 → UNCERTAIN（`duplicate_conflicting_evidence`）
- **Echo 结构守卫**：quote==canonical 且 answer ≤10 词 → UNCERTAIN（`short_answer_exact_canonical_echo`）；长回答由 LLM 语义层负责
- **完整性**：每 frozen target 恰好一条 final evidence（0→[] / 1→1 / 2→2）
- **upgradeCandidate**：仅最终 CORRECT 为 true（后续 04C 唯一可升级信号）

## 7. Fallback Behavior

- quality gate **BAND_SCORE_LEAK（02D redline）** → rule engine safe fallback：全部 targets → UNCERTAIN（`analysis_fallback_no_reliable_usage_evidence`），不伪造 CORRECT（T21）
- LLM malformed JSON / throw → 同上保守化（T22/T23）
- 无 targets（`[]`）→ evidence=[]，不因缺 vocab target 使 analysis fail
- Evidence 异常永不破坏核心 Speaking feedback 返回（T24）

## 8. Persistence Behavior

- Memory repository：frozen snapshot + validated evidence 随 session 保存（MemorySpeakingRepository parity）。
- Supabase repository：`toDomain` 读回 `suggestedExpressions: (row.suggested_expressions as ...) ?? []`（无该列 → 恒 []）。
  - **SUPABASE_EVIDENCE_PERSISTENCE = NOT_IMPLEMENTED**（未新增 DB schema / migration；`PERSISTENCE_SCHEMA_BLOCKER` 未触发，因为无需 schema 变更即可交付本任务）。
  - **EVIDENCE_DURABILITY = PARTIAL**：memory 全功能，Supabase 跨设备持久化未实现。

## 9. State Integrity（冻结边界）

T25–T29 覆盖：CORRECT / ISSUE / NOT_USED / UNCERTAIN 四种 evidence 后，以下字段**全部不变**：

`applicationLevel` / `recallLevel` / `status` / `nextReviewAt` / `currentIntervalDays` / `consecutiveCorrect`

Speaking session 显式完成（02A `POST /api/speaking/complete`）流程保持，幂等（T29）。

## 10. 为什么本阶段仍禁止 Writeback

1. 04A 已证明结构规则不可捕获语义误用/回声 → 直接写回会引入 ~19% 虚假升级。
2. 本任务建立了 raw → validated 的确定性防线，但 **validated 的精度尚未被独立真实模型评估**。
3. 只有 04C 用真实 pipeline + gold corpus 跑出可接受的 precision 后，才允许将 CORRECT_USE_EVIDENCE 映射为任何长期状态变化。
4. 正确术语是 **CORRECT_USE_EVIDENCE**，不是 mastered / learned / band improvement。

## 11. Known Limitations

- Validator 是结构性守卫：语义误用（E20–E23）与长句定义式回声（G31）依赖 LLM 语义层（prompt 规则），validator 无法单独拦截（gold G29 等 ≤10 词短回声反而被结构守卫拦截，比 04A 更保守）。
- 单条 band leak（02D T21）走 rule engine fallback，evidence 全 UNCERTAIN（无法保留 CORRECT，属于预期安全行为）。
- EVIDENCE_QUALITY = **NOT_YET_PROVEN**：unit test 只验证 wiring/schema/validator/fallback，不声称真实 CORRECT precision 提升。

## 12. 04C Evaluation Plan（下一 Gate）

- 用真实 Speaking analyzer + 真实模型跑 04A frozen gold corpus（53 cases）。
- 统计 CORRECT precision / recall、ISSUE precision、NOT_USED accuracy、UNCERTAIN rate、FALSE_CORRECT 构成。
- 目标：FALSE_CORRECT 显著下降（语义误用/回声被 LLM 语义层捕获）；precision 报告需与 04A 0.8077 同口径对比。
- 只有 04C 通过后才讨论 writeback 设计（属于未来任务，不在此范围）。

## 13. 状态语义（本任务宣布上限）

```
EVIDENCE_PIPELINE:            IMPLEMENTED
EVIDENCE_RECORDING:           ENABLED
EVIDENCE_QUALITY:             NOT_YET_PROVEN
LONG_TERM_STATE_WRITEBACK:    DISABLED
```

不得宣布 "Speaking→Vocabulary closed loop complete"。

## 14. 验证记录（04B worktree）

- 04B 新测试（T01–T29 + gold 回归）：**48/48 PASS**
- 回归门禁：02-E2E（16）+ badcase-019 + planner 系列 **85/85 PASS**；02A + 02C + 02D + badcase-030 **61/61 PASS**
- full unit：**563 PASS / 1 FAIL**（唯一失败 = llm-safety `ModelSettingsPanel` 静态检查，pre-existing 债务，非 04B 引入）
- `npx tsc --noEmit`：**PASS**
- `npx next build`：**PASS**

## 15. 验收对照

| 验收项 | 结果 |
|---|---|
| SUGGESTED_EXPRESSIONS_WIRED_TO_ANALYZE | YES |
| SESSION_TARGET_SNAPSHOT | YES |
| SERVER_TARGET_AUTHORITY | YES（CLIENT_CAN_INJECT_TARGET=NO） |
| SECOND_LLM_CALL | NO |
| STRICT_VALIDATOR | IMPLEMENTED（GROUNDING_REQUIRED=YES） |
| BAND_FALLBACK_SAFE / LLM_FAILURE_SAFE | YES |
| LONG_TERM_STATE_WRITEBACK | NO |
| APPLICATION_LEVEL / RECALL_LEVEL / STATUS / REVIEW_SCHEDULE | 均未改变 |
| NEW_DATABASE_SCHEMA / NEW_SUPABASE_MIGRATION | NO |
| TYPECHECK / WEB_BUILD | PASS |
| EVIDENCE_QUALITY_PROVEN | NO（属于 04C） |
