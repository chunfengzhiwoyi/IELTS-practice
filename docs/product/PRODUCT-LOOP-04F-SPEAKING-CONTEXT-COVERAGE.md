# PRODUCT-LOOP-04F — Speaking Cross-Context Coverage Fix

## 状态总览

- **任务**：解决 Level 2 的 `distinctContexts >= 2` 在真实题库中不可达的内容缺口。
- **结论**：`SPEAKING_CONTEXT_COVERAGE_FIXED` —— Level 2 真实内容路径 `REACHABLE`。
- **边界遵守**：未修改 `deriveApplicationLevel`、evidence validator、Speaking evidence prompt、evidence persistence、recallLevel/status/nextReviewAt/review schedule、Planner、Supabase schema / migration 0010、M3。

---

## 1. Root Cause

PRODUCT-LOOP-04 Final E2E 暴露出唯一真实内容路径缺口：

- `applicationLevel = 2` 要求：
  - `>=3` validated CORRECT
  - `>=3` distinct sessions
  - `>=2` distinct calendar days
  - **`>=2` distinct contexts**（`K = max(distinct questionId, distinct topic)`）
- 但审计发现：Speaking question bank 仅 12 题，其中 Speaking-eligible 的 PHRASE / CHUNK 表达（8 个）绝大多数只匹配 1 个 context。用户即使多次正确使用表达，也无法自然满足 `distinctContexts >= 2`。

根因有两层：

1. **题库覆盖不足**：P1/P2/P3 各 4 题，话题面窄；部分表达天然适配多个话题（如 take something for granted 可谈健康习惯、家庭支持、技术便利），但题库中没有这些第二语境。
2. **表达 tag 设计过窄**：seed-003 仅 `[daily, ielts-part1]`，seed-006/016/018 仅 1 个口语 tag，无法命中自然语境。

---

## 2. Before Coverage Matrix（实测）

口径：`isSpeakingEligible` 与 target-selection 一致（PHRASE/CHUNK 必入；WORD 需 `collocations > 0`；且含 `ielts-speaking / ielts-part1/2/3` tag）。

| itemId | term | type | contexts | 匹配题目 |
|---|---|---|---|---|
| seed-003 | take something for granted | PHRASE | **1** | sp-p1-001 |
| seed-006 | from my perspective | CHUNK | **0** | — |
| seed-007 | environmentally friendly | CHUNK | **1** | sp-p3-002 |
| seed-008 | broaden one's horizons | PHRASE | **1** | sp-p3-001 |
| seed-013 | a blessing in disguise | PHRASE | 2 | sp-p2-003, sp-p3-003 |
| seed-015 | bear in mind | PHRASE | **1** | sp-p1-001 |
| seed-016 | pros and cons | PHRASE | **0** | — |
| seed-018 | in terms of | CHUNK | **0** | — |
| seed-021 | compromise | WORD | **0** | — |

**Before 指标**：
- question count：**12**
- Speaking-eligible PHRASE/CHUNK：**8**（seed-003/006/007/008/013/015/016/018）
- 含 WORD（seed-021，带 collocations）：eligible 合计 **9**
- items with `>=2` contexts：**1**（seed-013）
- coverage rate：**1/8 = 12.5%**（PHRASE/CHUNK 口径）

---

## 3. Fix Strategy

按任务卡 §10 优先顺序执行，**不使用阈值捷径**（不改 Level 2 的 context 要求），**不做 context-key 伪装**（不把同题重复算作不同 context），**不新增 LLM runtime call**（继续确定性 tags/metadata 匹配）。

1. **补表达 tag（7 个 seed 条目）** —— 依据每个表达在真实 IELTS 话题中的自然使用机会：
   - seed-003：`[daily, ielts-part1, life, technology]`（把健康/教育/家庭支持/技术便利视为理所当然）
   - seed-006：`[opinion, ielts-speaking, technology, environment, culture]`（在 P3 讨论中表达个人观点）
   - seed-008：`[travel, education, ielts-speaking, place, culture]`（旅行/全球化开阔眼界）
   - seed-015：`[daily, ielts-speaking, skill, balance]`（学技能/记平衡要点）
   - seed-016：`[academic, ielts-speaking, technology, culture, environment]`（利弊讨论）
   - seed-018：`[academic, ielts-speaking, technology, work, culture]`（话题插入语）
   - seed-021：`[relationships, ielts-speaking, work, environment]`（工作生活平衡/环境政策需妥协）
2. **新增 1 道 P1 题**（唯一必须新增的题）：`sp-p1-005` Environmental Habits —— 为 environmentally friendly、environmentally 语境表达提供第二个自然 context；同时为 take something for granted（对环保便利视为当然）、from my perspective 等提供语境。
3. **同步 3 个过时测试假设**（04F 内容变更的必然结果，非产品回归）：
   - 02C D1/D2、02-E2E E2E-08 原以「seed-003 在 P3 无匹配」作为 SAFE FALLBACK 场景；04F 后 seed-003 在 P1/P2/P3 均有匹配，fallback 场景改用确实无匹配的组合（seed-006+P2 池、seed-016+part=P2、topic=environment 限定池）。
   - p3-speaking.test.ts 题数断言 12→13、P1 4→5。

**Not changed**：question matching 逻辑（双向子串 textHits）、target-selection 资格/优先级、SPEAKING_TOPIC_TAGS 集合、pickQuestion 兜底、derive 规则。

---

## 4. Questions Added / Retagged

- **QUESTIONS_ADDED**：1（`sp-p1-005`，P1 / Environmental Habits，questionId 唯一，keyTopicWords=["environment","friendly","daily","habits","protect"]）
- **QUESTIONS_RETAGGED**：0
- **EXPRESSION_TAGS_CHANGED**：7（seed-003/006/008/015/016/018/021）
- **Over-expansion guard**：12→13 题，仅新增必要的 1 题；其余覆盖通过补 tag 达成，符合「最小充分修复」。

新增题自然性核查（§13/§18 Natural Use Opportunity）：

> "Do you try to live in an environmentally friendly way? What do you do in your daily life?"

- 本身是正常 P1 日常习惯题，完全不用 suggested expression 也成立（§14 不强迫表达）。
- environmentally friendly / from my perspective / take something for granted / pros and cons / bear in mind / compromise / give rise to / raise public awareness 均可在其中自然使用。

---

## 5. After Coverage Matrix（实测）

| itemId | term | type | contexts | 匹配题目 |
|---|---|---|---|---|
| seed-003 | take something for granted | PHRASE | **5** | sp-p1-001, sp-p2-003, sp-p3-001, sp-p3-003, sp-p1-005 |
| seed-006 | from my perspective | CHUNK | **4** | sp-p3-001, sp-p3-002, sp-p3-004, sp-p1-005 |
| seed-007 | environmentally friendly | CHUNK | **2** | sp-p3-002, sp-p1-005 |
| seed-008 | broaden one's horizons | PHRASE | **3** | sp-p2-002, sp-p3-001, sp-p3-004 |
| seed-013 | a blessing in disguise | PHRASE | 2 | sp-p2-003, sp-p3-003 |
| seed-015 | bear in mind | PHRASE | **4** | sp-p1-001, sp-p2-001, sp-p3-003, sp-p1-005 |
| seed-016 | pros and cons | PHRASE | **4** | sp-p3-001, sp-p3-002, sp-p3-004, sp-p1-005 |
| seed-018 | in terms of | CHUNK | **3** | sp-p3-001, sp-p3-003, sp-p3-004 |
| seed-021 | compromise | WORD | **2** | sp-p3-003, sp-p3-002 |

**After 指标**：
- question count：**13**
- Speaking-eligible PHRASE/CHUNK：**8**
- items with `>=2` contexts：**8/8**（seed-021 亦达 2）
- coverage rate：**8/8 = 100%**
- CONTENT_EXCEPTIONS：**NONE**

---

## 6. seed-003 Example（§12 参考表达）

`take something for granted` 现在拥有 5 个真实可匹配 context，至少取两个不同 context：

| 维度 | Context A | Context B | Context C |
|---|---|---|---|
| questionId | sp-p1-001 | sp-p2-003 | sp-p3-001 |
| part | P1 | P2 | P3 |
| topic | Daily Routine | A Person Who Influenced You | Education and Technology |
| 自然使用示例 | 把家人的付出视为理所当然 | 受某人影响后不再把支持当理所当然 | 把技术便利视为理所当然 |

真实 target-selection 路径验证（coverage 测试 console 实测）：

```
SEED_003_HITS: sp-p1-001/Daily Routine | sp-p2-003/A Person Who Influenced You | sp-p3-001/Education and Technology
```

- `REAL_QUESTION_IDS_DISTINCT: YES`
- `REAL_CONTEXT_KEYS_DISTINCT: YES`
- `LEVEL_2_REAL_CONTENT_PATH: REACHABLE`

轻量 Level 2 实设验证（任务卡 §25）：Session 1→Context A、Session 2→Context B、Session 3→A 或 B，可从真实题库自然产生 `distinctContexts >= 2`；时间维度仍由 test clock / fixture 模拟第二日。

---

## 7. Regression

| 套件 | 结果 |
|---|---|
| 04F coverage tests（T01-T07） | **7/7 PASS** |
| 04B evidence pipeline（含 48 项） | PASS |
| 02C target-selection / session route | PASS |
| 02D band redline | PASS |
| 02 E2E（16 项） | PASS |
| 04E application state | PASS |
| Planner（v1 / 03A regression / today-api / today-plan-view） | PASS |
| **回归合计** | **190/190 PASS** |
| full unit | **638 PASS / 1 FAIL**（唯一 = llm-safety ModelSettingsPanel static debt，pre-existing，未修） |
| `npx tsc --noEmit` | **PASS** |
| `npx next build` | **PASS** |

full unit 说明：04F worktree 无 `.env.local`，env.test 通过；仅 llm-safety 1 个 pre-existing 债务，未顺手修。

---

## 8. Frozen Boundaries 确认

- `APPLICATION_LEVEL_RULE_CHANGED: NO`（Level 0/1/2 阈值、distinct days/contexts 规则未动）
- `EVIDENCE_RULE_CHANGED: NO`（04B validator / 04E derive 未动）
- `NEW_LLM_RUNTIME_CALL: NO`（仍无第二次 LLM 调用）
- `PLANNER_CHANGED: NO`
- `DATABASE_CHANGED: NO`（`NEW_DATABASE_SCHEMA: NO`，`NEW_SUPABASE_MIGRATION: NO`，0010 未动）
- `M3: PAUSED`（未创建新 M3 run）
- suggested expression 仍为 OPTIONAL（02C 契约保持；无匹配时 `targets=[]`，Speaking 正常）

---

## 9. Product Decision

**`SPEAKING_CONTEXT_COVERAGE_FIXED`**

- Level 2 的 `distinctContexts >= 2` 已从真实题库自然可达；
- 没有使用阈值/context-key 捷径；
- 没有引入 CONTENT_EXCEPTION；
- 代价最小：12→13 题 + 7 个表达 tag 增补。

## 10. Remaining Exceptions

**NONE**（全部 8 个 Speaking-eligible PHRASE/CHUNK + 带 collocations 的 WORD seed-021 均达到 `>=2` contexts）。
