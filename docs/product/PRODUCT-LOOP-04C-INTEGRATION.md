# PRODUCT-LOOP-04C-INTEGRATION — Real Evidence Quality Evaluation Integration

> 记录 PRODUCT-LOOP-04C-FINAL（REAL LLM EVIDENCE QUALITY EVALUATION）正式集成进入 canonical 的事实。
> 本文件为集成记录；完整评估细节见 `PRODUCT-LOOP-04C-EVIDENCE-QUALITY-EVAL.md`（Phase 1 BLOCKED + Phase 2 REAL LLM）。

## 1. Integration Facts

| 项 | 值 |
|---|---|
| Canonical before | `95f65aadf546e1454a0e2a9b8f7b9a7a6213857a`（repo/arch-consolidate，clean；04A/04B evidence pipeline 在位） |
| Source commit | `6c6d529` test(product): complete real speaking vocab evidence evaluation |
| Source scope | 仅 docs + tests/eval（04C doc、harness 扩展、probe、real-run-1/2/3.json、real-run-aggregate.json）；**无 app/components/lib/supabase/schema runtime diff** |
| Integration method | `git cherry-pick 6c6d529`（DU 平凡冲突：canonical 原无该两文件 → 取 source 内容，人工合并事实；无产品代码冲突） |
| Integrated commit | `49786d4` test(product): complete real speaking vocab evidence evaluation |
| State/integration commit | 本任务单独提交：`chore(product): integrate real evidence quality evaluation` |

## 2. Real Model Configuration

| 项 | 值 |
|---|---|
| Provider | **deepseek**（产品 `.env.local` 正式配置 `LLM_PRIMARY_PROVIDER=deepseek`） |
| Model | **deepseek-chat**（main tier；env 注入，非代码写死） |
| Temperature | 0.3（analyzer 固定，未改） |
| Pipeline | 真实 `analyzeSpeakingWithLlm`（单 LLM 调用 + 04B schema）→ 真实 `validateTargetExpressionEvidence` |
| Prompt/schema version | 04B 集成后 canonical `95f65aa` 版本（EVIDENCE_RULES 语义规则） |
| Gold | 04A 冻结 53 cases / 57 item 级标签（未因结果修改） |
| Runs | 3（每轮 53 次真实 LLM 调用；**不挑最优，逐轮分列**） |
| 非确定性声明 | deepseek-chat 非完全 deterministic；结果按 RUN_1/2/3 如实记录 |

## 3. Frozen Real Metrics（§5）

| metric | RUN_1 | RUN_2 | RUN_3 | Macro avg | Worst-run |
|---|---|---|---|---|---|
| CORRECT precision | 1.0 | 1.0 | 0.9375 | **0.9792** | 0.9375 |
| CORRECT recall | 0.7143 | 0.7619 | 0.7143 | **0.7302** | 0.7143 |
| ISSUE precision | 0.7333 | 0.75 | 0.7647 | 0.7493 | 0.7333 |
| ISSUE recall | 0.7333 | 0.8 | 0.8667 | 0.8 | 0.7333 |
| NOT_USED accuracy | 1.0 | 1.0 | 0.9375 | 0.9792 | 0.9375 |
| UNCERTAIN rate | 0.1930 | 0.1579 | 0.1579 | 0.1696 | 0.1930 |
| overall accuracy | 0.7368 | 0.7719 | 0.7544 | 0.7544 | 0.7368 |
| **FALSE_CORRECT** | **0** | **0** | **1** | **0.33** | **MAX=1** |
| FALSE_ISSUE | 4 | 4 | 4 | 4 | 4 |
| GROUNDING_VIOLATIONS | 0 | 0 | 0 | **0** | 0 |
| VALIDATOR_DOWNGRADES | 8 | 6 | 6 | 6.7 | 8 |
| MISSING_EVIDENCE | 0 | 0 | 0 | 0 | 0 |
| DUPLICATE_CONFLICT | 2 | 1 | 1 | 1.3 | 2 |

- 真实调用：**159 次**（53×3）；avg latency ≈ **8.4s/call**；total ≈ 22.3 min。
- tokens / approx cost：**NOT_AVAILABLE**（harness 未采集 usage；不估算伪数据）。

## 4. Frozen Before / After（§6）

| 指标 | 04A BASELINE (rule-only) | 04C REAL PIPELINE (avg) |
|---|---|---|
| CORRECT precision | 0.8077 | **0.9792** |
| FALSE_CORRECT | **5** | **0.33（max 1，M45 GOLD_DISPUTE）** |
| SEMANTIC_MISUSE FALSE_CORRECT | **4**（E20–E23） | **0**（三轮 ISSUE/UNCERTAIN） |
| META_ECHO FALSE_CORRECT | **1**（G31） | **0**（三轮 UNCERTAIN） |
| GROUNDING_VIOLATIONS | 0 | **0** |

## 5. Conservative Tradeoff（§7）

- CORRECT recall **1.0 → ~0.73**；UNCERTAIN rate **~5.3% → ~17%**。
- 解释：**PRECISION_FIRST_TRADEOFF** —— LLM 语义层以保守判断换取零/近零虚假升级。
- 禁止误解：**不是**"模型能力整体退化"；也**不是**"Evidence 已完美"。FALSE_ISSUE（4/run）与 recall 损失为明确代价，已在 P2 findings 保留。

## 6. M45 Gold Dispute（§8）

- **M45** | target: `pros and cons`（seed-016）| category M（多目标一正确一错）。
- user answer：`I take my family for granted every day, and there is pros and cons to that.`
- RUN_3 预测：**CORRECT**（quote=`there is pros and cons to that`，upgradeCandidate=true，无 validator notes）。
- 原 Gold：ISSUE（gold reason：pros and cons 搭配语法错误：单数 is 配复数）。
- 模型理由：目标表达本身使用正确（语义成立、核心搭配正确）；错误（is 应为 are 的主谓一致）位于**目标表达之外**的句级语法。
- 冲突点：模型理由与 04A 冻结契约 §9D（"目标表达本身正确即可；允许句子中存在其他无关错误"）潜在一致 → **M45_GOLD_STATUS: DISPUTED**。
- 处置：**不覆盖历史 Gold；不重算旧 04C metrics**（保留 6c6d529/49786d4 可复现性）；未来 Gold v2 可在明确 adjudication 后修订（若裁定为 CORRECT，三轮 FALSE_CORRECT = 0/0/0）。
- 风险评级：非危险类误判（非语义误用/回声/幻觉 quote），对长期状态污染风险极低。

## 7. P Findings（§11）

| 级别 | 数量 | 内容 |
|---|---|---|
| P0 | 0 | 无未 grounding / unknown target 成为 final CORRECT |
| P1 | 0 | 无语义误用/回声 FALSE_CORRECT 复现；唯一 FALSE_CORRECT 为 GOLD_DISPUTE |
| P2 | 3 | **P2-1** FALSE_ISSUE/保守误判（D17/M44/D18，含固定题语境伪影）；**P2-2** 模型枚举漂移 "INCORRECT"→schema/validator 保守降级（M45r1/P52r2/N47r3）；**P2-3** M45 多目标+句级语法不稳定（HIGH_RISK_UNSTABLE_CASE） |

P2 均**不阻塞** state mapping design，但必须保留至 04D 设计/后续修复。

## 8. State Writeback Boundary（§10）

```
LONG_TERM_STATE_WRITEBACK: NO
APPLICATION_LEVEL_CHANGED: NO
RECALL_LEVEL_CHANGED: NO
STATUS_CHANGED: NO
NEXT_REVIEW_AT_CHANGED: NO
REVIEW_SCHEDULE_CHANGED: NO
```
04C 集成本身未修改任何 Learner State（无 product runtime diff）。

## 9. Safety / Product Decision（§9）

```
EVIDENCE_SAFETY_DECISION: SAFE_FOR_STATE_MAPPING_DESIGN
PRODUCT_DECISION: EVIDENCE_QUALITY_GOOD_ENOUGH_FOR_STATE_MAPPING_DESIGN
```
含义：允许进入 **PRODUCT-LOOP-04D**（Evidence → Learner State mapping **设计**）。**不含义 state writeback 已批准** —— 写回仍需 04D 映射规则 + Control Plane 单独批准。

## 10. Secret Safety（§15）

- `.env.local` 不在 tracked files（`git ls-files` 确认 rc=1）。
- real-run JSON / docs / harness：无 API key、无 secret、无 auth token（pattern 扫描 0 命中）。
- 真实凭据仅从 `.env.local` 进程内读取；从未打印值、未入 Git。

## 11. Next Gate

**PRODUCT-LOOP-04D-STATE-MAPPING-DESIGN**（M3 维持 PAUSED；无新 M3 run；019/020/023/025/030/035 lifecycle 未动）。

## 12. Verification

- `git show --name-status 6c6d529`：仅 docs + tests/eval → scope 合规。
- cherry-pick 后 `git status --short` clean；canonical HEAD 前进为集成提交。
- 真实 run artifacts（`real-run-1/2/3.json` + `real-run-aggregate.json`）原样进入 canonical（未重跑、未重新计算；159 次真实调用结果完整保留）。
