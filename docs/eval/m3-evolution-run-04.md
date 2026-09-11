# M3 Evolution — EVAL-RUN-M3-04（After S1 Fixes 019 + 030）

## 1. Evolution Table（重点 Case）

| Case | M3-P1（43364c3） | M3-02（55806ba） | M3-P3（55806ba+special tools） | M3-03（f117d85） | M3-P4A（f117d85） | M3-P4B（f117d85, human） | **M3-04（496ae31）** |
|---|---|---|---|---|---|---|---|
| **026** | FAIL | PASS | PASS | PASS (3/3→VERIFIED_CLOSED) | PASS | PASS | **PASS（VERIFIED_CLOSED 保持，regression #4）** |
| **033** | FAIL | PASS | PASS | PASS (3/3→VERIFIED_CLOSED) | PASS | PASS | **PASS（VERIFIED_CLOSED 保持，regression #4）** |
| **034** | UNVERIFIED | UNVERIFIED | UNVERIFIED | PASS (CAPABILITY_VERIFIED) | PASS | PASS | **PASS（CAPABILITY_VERIFIED 保持）** |
| **019** | MANUAL | MANUAL | MANUAL | MANUAL | MANUAL(S1_CANDIDATE) | **FAIL(S1)**（human 冻结） | **PASS**（human-gold-backed regression：BC-M3-004 1/3） |
| **030** | MANUAL | MANUAL | MANUAL | MANUAL | **FAIL(S1)**（编造 ▲） | FAIL(S1)（BC-M3-003 OPEN） | **PASS**（BC-M3-003 1/3） |
| **008** | PASS | PASS | PASS | PASS | PASS | PASS | PASS（无漂移） |
| **035** | FAIL→UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED（generationMeta.knowledge_miss 仍缺） |
| **037** | PASS | PASS | PASS | PASS | PASS | PASS | PASS（无漂移） |
| **038** | PASS | PASS | PASS | PASS | PASS | PASS | PASS（无漂移） |
| **039** | BLOCKED | BLOCKED | PASS | PASS | PASS | PASS | PASS（无漂移） |
| 020 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED（trace contract 缺） |
| 023 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 025 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |

## 2. S1 Fix Verification（本轮核心）

### 2.1 ELS-EVAL-019（BC-M3-004 — 幻觉证据直达 UI）

- **Before Fix（f117d85 / P4B human FAIL(S1)）**：用户回答 `I like books. Reading is fun. I read often.`（无 which 从句/复合句/比较级/被动语态），产品反馈声称存在以上语言现象，且沿 speaking-feedback UI 渲染路径直达用户。
- **After Fix（496ae31）**：
  - gate 检出：evidenceConsistencyCheck=60（NEEDS_REVIEW），EVIDENCE_MISMATCH×3 + mainIssue 关联缺失
  - sanitizer：4 条 evidence 移除，summary/mainIssue.description/candidateIssues/issues 替换为安全文案
  - **public response**：summary / overallDiagnosis / mainIssue.description / ieltsAnalysis.*.evidence|issues 无任何幻觉断言（hits=[]）
  - **public metadata**：qualityWarning.sanitization 仅安全摘要（applied/evidenceRemoved/affectedDimensions/replacedFields），全文无 raw claim
  - **UI**：真实组件渲染（renderToStaticMarkup，渲染字段=API 字段）无幻觉文本；无第二条旁路
  - **false-positive**：合法 `which` 定语从句 + `better` 比较级保留；真正 ungrounded 断言（被动语态）移除
  - **trace**：validation.result 含 evidence_sanitization 诊断（labels-only）；Frozen required llm_raw_output 保留 provider 转录（Gold 契约）
- **结论**：S1 红线行为已消除 → **PASS**；BC-M3-004 → FIXED_PENDING_REGRESSION 1/3（不得 VERIFIED_CLOSED）。

### 2.2 ELS-EVAL-030（BC-M3-003 — 无 baseline 编造趋势 Δ）

- **Before Fix（f117d85 / P4A FAIL(S1)）**：仅本周数据时 CompareSection 渲染 `新收表达 1 → 0 ▲ 1`（把 missing baseline 当 0 计算 delta）。
- **After Fix（496ae31）**：
  - `lastWeek.hasActivity=false`（无任何活动）→ 整节空态「暂无历史对比数据」，无任何 ▲/▼/Δ
  - **TRUE ZERO**：上周有活动且 newItems=0 → 正常显示 `▲ 1`（真实零值差，合法比较）
  - **per-row null**：上周有活动但该指标 reviewAccuracy=null → 该行 delta `—`（不计算）；其他有 baseline 行正常
  - API 全文无进步/提升/突破文案（hits=[]）
- **结论**：修复正确区分 MISSING 与 TRUE ZERO → **PASS**；BC-M3-003 → FIXED_PENDING_REGRESSION 1/3。

## 3. Historical Evidence（保留，未覆盖）

- PRE-M1 / Before Fix / After Integration：保留于 `docs/eval/bad-case-registry.json`（BC-M3-001/002/003/004 原始 FAIL evidence、fix commit、integration checkpoint）。
- 历史 run 全部只读保留：m3-20260909-143153（P1）、m3-20260910-070726（M3-02）、m3-20260910-081624（P3）、m3-20260910-085726（M3-03）、m3-20260910-094159（P4A）。
- 008 / 035 / 037 / 038 演化证据：见上表。

## 4. 状态转移小结（FINAL，双口径）

- RUN_AUTOMATED：32 PASS / 0 FAIL / 3 MANUAL（006/016/018）/ 4 UNVERIFIED（020/023/025/035）
- FINAL（+Frozen Human Gold）：**35 PASS / 0 FAIL / 4 UNVERIFIED / 0 MANUAL**（35+4=39）
- 019/030 本轮为独立 Eval 首次 PASS（regression 1/3）；026/033 regression #4 PASS（VERIFIED_CLOSED 保持）；034 CAPABILITY_VERIFIED 保持
- NEW_REGRESSIONS：none

## 5. 后续（NEXT_GATE）

- BC-M3-003/004：需连续 regression（2/3、3/3）稳定后才可 VERIFIED_CLOSED
- 020/023/025/035：PRODUCT_CAPABILITY_GAP 处置（generationMeta.knowledge_miss 等）需 Control Plane 决策（候选 BC-020-R1 / BC-023-R2 / BC-025-R1 / BC-035-R2）
- 未声明 M3 COMPLETE
