# PRODUCT-LOOP-04F-INTEGRATION

## 状态

**STATUS: PASS** — PRODUCT-LOOP-04F（SPEAKING-CROSS-CONTEXT-COVERAGE-FIX）已正式集成进入 canonical。

---

## 1. Canonical Before

- Repo: `D:\Codex\IELTS-practice`
- Branch: `repo/arch-consolidate`
- HEAD: `e4c8e95bd4d90e48181791da024a0b2411583e03`（正是任务卡 Expected HEAD，`e4c8e958...` 完整 hash 不存在，以 rev-parse 实测为准）
- Worktree: clean
- `e4c8e95` 即当前 HEAD（ancestor check exit=0）

## 2. Source Commit

- Source: `373e122fd19cadfc02fe8b520eb4e32099d64706`（`feat(product): expand speaking cross-context coverage`）
- Scope（name-status）：
  - `data/seed/ielts-learning-items.json`（7 个 topicTags 语义变更；diff 行数大是 compact→展开格式重排，json 语义对比确认仅 seed-003/006/008/015/016/018/021 变化）
  - `data/seed/speaking-questions.json`（+12 行 = 新增 sp-p1-005）
  - `tests/unit/product-loop-04f-coverage.test.ts`（新增，7 tests）
  - `tests/unit/p3-speaking.test.ts`（题数 12→13、P1 4→5）
  - `tests/unit/product-loop-02-e2e.test.ts`（E2E-08 fallback fixture）
  - `tests/unit/product-loop-02c.test.ts`（D1/D2 fallback fixture）
  - `docs/product/PRODUCT-LOOP-04F-SPEAKING-CONTEXT-COVERAGE.md`（新增）
- **无** lib/app/supabase/Planner/derive/validator/prompt/migration 变更

## 3. Coverage Facts（canonical 口径重算，非复制 handoff）

| 指标 | BEFORE | AFTER |
|---|---|---|
| question count | 12 | **13** |
| eligible PHRASE/CHUNK | 8 | 8 |
| items with `>=2` contexts | 1（seed-013） | **8** |
| coverage rate | 12.5% | **100%** |
| content exceptions | — | NONE |

seed-003 AFTER 精确匹配（production 匹配逻辑）：
- `SEED_003_MATCHING_QUESTION_COUNT`: **5**
- `SEED_003_DISTINCT_CONTEXT_COUNT`: **5**（全部不同 questionId → contextKey 去重后仍为 5）
- `SEED_003_CONTEXTS`:
  - sp-p1-001 / P1 / Daily Routine
  - sp-p1-005 / P1 / Environmental Habits
  - sp-p2-003 / P2 / A Person Who Influenced You
  - sp-p3-001 / P3 / Education and Technology
  - sp-p3-003 / P3 / Work-Life Balance
- 真实 target-selection 路径：P1→sp-p1-001、P2→sp-p2-003、P3→sp-p3-001（三池全可达）

**No context inflation（§7）**：context count 按 questionId 唯一去重；production contextKey 源自 questionId，同一题不会因多 tag 重复计数。

## 4. Tag Naturality Review（§5）

| item | 新增 tag | 真实使用机会 |
|---|---|---|
| seed-003 | life, technology | 把健康/家人支持/技术便利视为理所当然（P2 人物影响、P3 工作生活平衡/教育技术）✓ |
| seed-006 | technology, environment, culture | P3 讨论题表达个人观点标记语 ✓ |
| seed-008 | place, culture | 旅行地开阔眼界、全球化文化视野 ✓ |
| seed-015 | skill, balance | 学技能时记住要点、记住平衡 ✓ |
| seed-016 | technology, culture, environment | 利弊讨论（P3 各题）✓ |
| seed-018 | technology, work, culture | 话题引入插入语 ✓ |
| seed-021 | work, environment | 工作生活平衡需妥协、环境政策需妥协 ✓ |

**TAG_NATURALITY_REVIEW: PASS**

## 5. Question Quality Review（§4）

`sp-p1-005` Environmental Habits：
- questionId 唯一 ✓；Part=P1 合理 ✓；topic 为 P1 典型日常习惯话题 ✓
- 问题独立成立（"Do you try to live in an environmentally friendly way? What do you do in your daily life?"），无需强制使用表达 ✓
- keyTopicWords / followUps / expectedLength / dimensions 与既有题结构一致 ✓
- 符合现有 IELTS Speaking question 风格 ✓
- **QUESTION_QUALITY_REVIEW: PASS**；OPTIONAL_SUGGESTION_CONTRACT: PRESERVED

## 6. Test Assumption Updates（§9）

- 02C D1：原「seed-003 + P3 池 → null」；现「seed-006 + P2 池 → null」（04F 后 seed-003 在 P3 有匹配）
- 02C D2：原「seed-003 + part=P3 → []」；现「seed-016 + part=P2 → []」
- 02-E2E E2E-08：原「part=P3 → fallback」；现「part=P3 + topic=environment → pool 锁定 sp-p3-002，seed-003 无重叠 → fallback」
- p3-speaking：题数断言 12→13、P1 4→5

均为「原 fallback fixture 因 coverage 扩展后不再无匹配 → 换成真正无匹配场景」。SAFE FALLBACK 产品行为期望（suggestedExpressions=[]、session 正常创建、pickQuestion 兜底）未变。
- `PRODUCT_BEHAVIOR_EXPECTATION_CHANGED`: **NO**
- `TEST_FIXTURE_ASSUMPTION_UPDATED`: **YES**

## 7. Frozen Boundaries（§10–13）

- applicationLevel 0/1/2、Level0→1、Level1→2 阈值、same-session dedupe、ISSUE/NOT_USED/UNCERTAIN 语义：**未改**
- Speaking analyzer prompt、TargetExpressionUsageEvidence schema、validator、grounding、server target authority：**未改**
- Planner diff = 0；applicationLevel 仍不进 Planner：**确认**
- database diff = 0；NEW_DATABASE_SCHEMA=NO、NEW_SUPABASE_MIGRATION=NO、0010 unchanged、0009 仍 deferred：**确认**

## 8. Cherry-pick

`git cherry-pick 373e122` → **0 冲突**，integrated commit `99d4e5f`。

## 9. Regression（canonical 集成后实测）

| 套件 | 结果 |
|---|---|
| 04F coverage tests | 7/7 PASS |
| 02C / 02D / 02-E2E(16) / 04B / 04E | PASS |
| Planner（v1/03A/today-api/today-plan-view） | PASS |
| p3-speaking | PASS |
| **回归合计** | **206/206 PASS**（17 files） |
| full unit | **637 PASS / 2 FAIL** |
| `npx tsc --noEmit` | PASS |
| `npx next build` | PASS |

full unit 2 个失败分类（§23）：
- `llm-safety.test.ts` ModelSettingsPanel static — **PRE_EXISTING**（确定性复现，04E-INTEGRATE 即存在，未顺手修）
- `env.test` env placeholder detection — **ENVIRONMENT_DEPENDENT**（canonical `.env.local` 含真实 Supabase URL 时按设计失败；04F worktree 无此文件时该测试通过）
- 无 NEW_REGRESSION。

## 10. PRODUCT_LOOP_04 Final Status（§25）

**PRODUCT_LOOP_04: COMPLETE**，理由：
- A. Evidence quality real-LLM verified（04C）
- B. Evidence history + state writeback implemented（04E）
- C. Level0→1 real path verified（04-FINAL）
- D. Level2 mapping verified（04D + 04-FINAL）
- E. **Level2 real content path now reachable**（04F：8/8 eligible ≥2 contexts，seed-003 真实三池可达）
- F. target-selection feedback verified（04-FINAL）

同时如实记录：
- `REMOTE_SUPABASE_DEPLOYMENT_VERIFIED`: **NO**
- `REMOTE_SUPABASE_EVIDENCE_WRITE_READ`: **NOT_TESTED**
- PRODUCT_LOOP_04_COMPLETE **≠** PRODUCTION_PERSISTENCE_COMPLETE

## 11. Next Gate

**NEXT_GATE: PRODUCTION-PERSISTENCE-01-REMOTE-SUPABASE-EVIDENCE**
- 部署 `0010_application_evidence.sql` 到真实远程 Supabase
- 验证：insert / upsert / select / unique(user_id,item_id,session_id) / RLS / derived applicationLevel flow

## 12. Commit

- 04F source：cherry-pick `99d4e5f`（feat(product): expand speaking cross-context coverage）
- 状态 + 集成记录：`chore(product): integrate speaking context coverage`（本记录 + CURRENT-PROJECT-STATE 更新）
- FINAL_HEAD：见 git rev-parse（上述 state commit 之后）

## 13. M3

**M3: PAUSED**（未创建新 Eval run，未推进任何 case lifecycle）
