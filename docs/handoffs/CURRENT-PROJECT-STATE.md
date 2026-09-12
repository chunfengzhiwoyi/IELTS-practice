# CURRENT PROJECT STATE — IELTS Learning Platform Consolidation

> 任何新 Agent 接管时：先读本文件 + `git status` / `git log` / `git worktree list`，再读 `docs/architecture/REPO-ARCH-03G-CANONICAL-SWITCH.md` 即可恢复当前施工状态。
> 最后更新：2026-09-12（PRODUCT-LOOP-03B-INTEGRATE 完成后）。

## REPO_CONSOLIDATION
**COMPLETE**

## CANONICAL_PATH
`D:\Codex\IELTS-practice`（唯一正式项目工作区）

## CANONICAL_BRANCH
`repo/arch-consolidate`

## CURRENT_HEAD
以 `git rev-parse HEAD` 为准（canonical switch 后 = 6a0ccb1 之上的 final switch docs commit）。

## CURRENT_PHASE
**PRODUCT_LOOP_03_COMPLETE** — 03A Planner quality audit + 03B Planner targeted fixes 已入 canonical（03B cherry-pick `467bdf0` → `e4b2eee`，0 冲突）；PLANNER_V1_1 = STABLE_FOR_CURRENT_PRODUCT_STAGE；focused 50/50 + full unit 505/2 + typecheck + build PASS。下一 Gate：**SPEAKING-TO-VOCAB-V1.1**。

## COMPLETED_REPO_ARCH_PHASES
- REPO-ARCH-02-INVENTORY — PASS
- REPO-ARCH-02-PLAN — PASS
- REPO-ARCH-03A — PASS（base=496ae31，manifest 109 assets）
- REPO-ARCH-03B — PASS（3 个 "0-byte stub" 实为已实现，无 stub 遗留）
- REPO-ARCH-03C — PASS_WITH_PREEXISTING_SOURCE_DEBT（miniapp 迁入；seed 表述已按 git-blob 事实修正）
- REPO-ARCH-03D — PASS（android 迁入，69/69 hash identical）
- REPO-ARCH-03E — PASS；03E.1 — PASS（eval 107 files）；03E.2 — PASS（Android 独立 toolchain）
- SECRET-HYGIENE-01 — PASS（11 项 secret 外部化至 Vault；preservation blockers CLEARED）
- REPO-ARCH-03F-AUDIT — PASS；REPO-ARCH-03G-PRECHECK — PASS
- DOC-ABSORB-01 — PASS（27 项 P4–P7.5 evidence + 2 audit 文档吸收，SHA256 27/27）
- REPO-ARCH-03F-INTEGRATE — PASS（cherry-pick 5 commits 集成，无冲突；typecheck PASS）
- REPO-ARCH-03G-CANONICAL-SWITCH — PASS（canonical switch；旧 dirty tree 清理；临时 worktrees 退休；typecheck + build PASS）

## CURRENT_BLOCKERS
- **无仓库级 blocker**。Canonical switch 已完成。
- **M3 PAUSED**：020/023/025/035 仍 UNVERIFIED；未经 Control Plane 明确要求不得恢复。
- **LEGACY_MINIAPP_API_KEY_ROTATION**：建议 provider 端 ROTATE/REVOKE（未执行，非 blocking）。

## NEXT_GATE
**SPEAKING-TO-VOCAB-V1.1**（Speaking→Vocabulary 反向写回；当前 NOT_IMPLEMENTED，V1.1 FUTURE）。

## LEGACY_SOURCE_RETIREMENT
**COMPLETE** — `D:\Codex\ielts-monorepo` / `D:\Codex\ielts-android` / `D:\Codex\IELTS-m2-debug-console` 已退休删除；`feature/m2-debug-console` 与 `integration/m3-p1` branch 历史保留。

## SECRET_HYGIENE
**COMPLETE** — 11 项 secret/敏感资产 COPY 至 `D:\Codex\_secrets\IELTS-practice`（Git 外，无 git init）；TRACKED_REAL_SECRET_COUNT=0；GIT_SECRET_HISTORY_RISK=NOT_DETECTED；LEGACY_MINIAPP_API_KEY=PRESERVED_OUTSIDE_GIT+ROTATION_RECOMMENDED。详见 `docs/architecture/SECRET-HYGIENE-01.md`。

## EVAL_SYSTEM
**PRESENT** — REPO_LEVEL_QUALITY_SYSTEM（tests/eval + scripts/eval + docs/eval，107 files，来源 eval/m3-run-04@8080e1e）。
- 39 cases；run-04（m3-20260910-125036）artifacts 在；registry 冻结（026/033 VERIFIED_CLOSED；019/030 FIXED_PENDING_REGRESSION 1/3）。
- M3 PAUSED；历史 run 归属 product checkpoint `496ae31`，不重写。

## P4_P7_PERMANENT_EVIDENCE
**ABSORBED** — `docs/evidence/dashboard-v2/` 27/27（P4=2, P5=4, P6=9, P7=7, P7.5=3, System=2）；SHA256 27/27；manifest 在 `docs/architecture/permanent-evidence-migration-manifest.json`。

## SUPABASE_0009
**PRESERVED_DEFERRED** / **NOT_ACTIVE** — `docs/deferred/supabase/`（DEFERRED, blocker ENV-SUPABASE-01, do_not_apply=true）；active migrations = 0001–0008。

## MINIAPP
PRESENT — apps/miniapp + apps/miniapp/core；weapp build PASS；**TD-MINI-01**：4 个 pre-existing TS errors（非迁移回归）。

## ANDROID
PRESENT — apps/android（:app + :core）；Debug build PASS（独立 toolchain `D:\Codex\_toolchains\java\jdk-17.0.20+8`）；69/69 source hash identical；signing assets 已 Vault 化。

## WEB
PRESENT — canonical switch 后 typecheck PASS + next build PASS（依赖经 npm install 补齐 506 packages；非产品回归）。

## LAST_VERIFIED_PRODUCT_CHECKPOINT
`496ae31`（历史 Eval run 归属，不重写；当前 consolidation HEAD 不是新的独立评估产品 checkpoint）

## PRODUCT_LOOP_02A（STATE-CONSISTENCY-01）
**COMPLETE** — commit `2a897e9`（已入 canonical）。
- Fix A：masthead streak 改读 `/api/learning/stats`（共享 hook `lib/client/use-learning-stats.ts`），不再读 localStorage events。
- Fix B：goal 页/概览「当前情况」改读服务端 stats（learnedCount/masteredCount/streak）；`getStudyHistory` 已无活跃组件调用者（legacy 死代码待清理）。
- Fix C：口语显式完成 `POST /api/speaking/complete` → `completeSession`（幂等；second-answer/retry 流程保留）。
- 无新 DB schema；weeklyGoal 档案持久化未动（PRODUCT-LOOP-02B 职责）。
- focused tests 44/44 PASS；typecheck PASS；next build PASS。

## PRODUCT_LOOP_02B（GOAL PLANNER V1）
**COMPLETE（E2E 已验证）— 已入 canonical（cherry-pick `6a8369d`，PRODUCT-LOOP-02-INTEGRATE）**
- GOAL_PLANNER：V1_IMPLEMENTED。GET/PUT `/api/goal` + GET `/api/today`；`lib/planner/planner-v1.ts` 纯函数确定性，不调用 LLM；targetBand/currentBand 不参与任何数量/优先级决策。
- GOAL_DURABILITY：**MEMORY_REFERENCE_ONLY / SUPABASE_NOT_IMPLEMENTED**（lib/goal/repository.ts：ENV-SUPABASE-01 BLOCKED，V1 恒回退 MemoryGoalRepository，显式告警 NOT durable / NOT synced across devices）。
- 未实现：跨设备 Goal 持久化、Planner 调 LLM（明确不做）。

## PRODUCT_LOOP_02C（VOCAB→SPEAKING V1）
**COMPLETE（E2E 已验证）— 已入 canonical（cherry-pick `63119ad`，PRODUCT-LOOP-02-INTEGRATE）**
- VOCAB_TO_SPEAKING：V1_IMPLEMENTED。session response 返回 `suggestedExpressions`（上限 `MAX_TARGET_EXPRESSIONS = 2`）；无匹配 → `[]` + 普通 Speaking（SAFE FALLBACK）。
- **NO_LONG_TERM_WRITEBACK**：target-selection 只读 UserItemState，不写 applicationLevel/recallLevel/status/nextReviewAt/currentIntervalDays/consecutiveCorrect。

## PRE_EXISTING_TEST_DEBT（2026-09-12 REBASELINED by PRODUCT-LOOP-03B-INTEGRATE）
历史 **24 个失败**（ff01160 基线观测）标记为 **HISTORICALLY_OBSERVED / NOT_CURRENTLY_REPRODUCED**——不宣称被产品代码修复，机制已澄清（见下）。

**当前 integrated tree 实测**（canonical 本机、标准测试 env：`LLM_PRIMARY_PROVIDER=mock` + `AUTH_MODE=demo`，`npx vitest run` = **505 PASS / 2 FAIL**，36 files）：
**CURRENT_REPRODUCIBLE_TEST_DEBT = 2**
- llm-safety（1）：`ModelSettingsPanel.tsx` imports `@/lib/llm`（静态检查违规，组件未改）。**确定性静态债**，全环境复现。
- env.test（1）：Supabase 占位 URL 识别失败 —— `.env.local` 含真实 Supabase URL。**环境依赖**：干净环境通过。
- 注：历史 4×auth-401（badcase-026/035 learn/card e2e）在 `AUTH_MODE=demo` 标准 env 下不出现（环境配置正确，非产品变化）。无 03B 引入的新失败。

机制澄清（历史 24 构成）：
- badcase-019/033 “LLM mock 约 5s/例超时”= canonical `.env.local` 设 `LLM_PRIMARY_PROVIDER=deepseek` → 测试命中真实 provider（latency 5–7s）→ 5000ms 超时；mock env 下 019 26/26、033 14/14、02d 6/6 全过。独立 worktree（无 .env.local）默认 `LLM_PRIMARY_PROVIDER=mock`（lib/env.ts:43）故通过。
- int-m3-01-combined-path 等其余项：本次 integrated tree **全部通过**（未复现）。
修复建议：后续单独任务（非产品主线 blocker；本机 .env.local 类问题属环境，非产品缺陷）。

## PRODUCT_LOOP_02D（AI-020-BAND-SAFETY）
**PRODUCT_FIX_COMPLETE / FORMAL_EVAL_PENDING — 已入 canonical（cherry-pick `e66d4d3`，PRODUCT-LOOP-02-INTEGRATE）**
- 核心修复：任何 `BAND_SCORE_LEAK`（1 条及以上，不再看数量/score）→ **确定性强制规则引擎安全回退**（FORCE_SAFE_FALLBACK），public analysis 全字段 band-free，不残留 LLM band 文本。
- 020 trace 字段（validation.result，validator=speaking_quality_gate）：`band_leakage_flag` / `analysis_path`（rule_based_analysis | llm_analysis）/ `final_response_redacted`；fallback.triggered error_code=`BAND_SCORE_LEAK_REDLINE`。
- 顺带修复预存在 gate 误报：`BAND_SCORE_PATTERNS` 中 `\d\.?\d?\s*分` 会把“每天 5 分钟”等时间投入建议误判为 band 分数（020 强制回退会放大该误伤）→ 改为 `\d\.?\d?\s*分(?!钟)`。测试断言 pattern 同口径同步。
- badcase-019 E case 断言更新为 020 修复后的 band-free 语义（020 配套断言更新；**019 lifecycle 未动**）。
- 未动：023/025/035；019/030 lifecycle；Frozen Gold；recallLevel/复习调度/report formulas；无新 DB schema；无新 Eval run。
- 验证：02D（6）+ badcase-019（26）+ badcase-033（14）= **46/46 PASS**；完整 run **432/1**（唯一失败 llm-safety 预存在）；`npx tsc --noEmit` **PASS**；`npx next build` **PASS**。
- 单泄漏 fixture（1 条 leak、原 score≈85→PASS）已新增，覆盖旧 run-04 未覆盖的“少条泄漏仍安全”路径。
- 完整 run 实测（02D worktree，无 .env.local）：432/1（仅 llm-safety）；integrated canonical 实测详见上节 PRE_EXISTING_TEST_DEBT（REBASELINED，CURRENT_REPRODUCIBLE_TEST_DEBT = 6）。

## PRODUCT_LOOP_03A（PLANNER QUALITY AUDIT）
**COMPLETE** — commit `6fb560c`（docs(product): audit planner v1 quality）+ `d5d3d72`（chore(product): record planner quality audit decision），均已入 canonical。识别 P1-1（due>=5 绝对 Learn gate 悬崖）、P1-2（silent over-budget）、P2/P3 系列问题，交由 03B 修复。

## PRODUCT_LOOP_03B（PLANNER TARGETED FIX）
**COMPLETE — 已入 canonical（cherry-pick `467bdf0` → `e4b2eee`，0 冲突；集成记录 `docs/product/PRODUCT-LOOP-03B-INTEGRATION.md`）**
- **PLANNER_STATUS: V1_1_STABLE_FOR_CURRENT_PRODUCT_STAGE**（无已知 P0/P1 产品逻辑缺陷；教学策略本身 NEEDS_PEDAGOGY_EVIDENCE，不视为最优）。
- **P1_ABSOLUTE_DUE_GATE_CLIFF: FIXED**（移除 dueCount>=5 绝对闸门；LEARN 由剩余预算分配）。
- **P1_SILENT_OVER_BUDGET: FIXED**；**BUDGET_STATUS: IMPLEMENTED**（WITHIN_BUDGET / OVERLOADED + overloadReason，绝不静默）。
- **DUE_4_TO_5_CLIFF: REMOVED**（weekly=140 放大版悬崖回归通过）。
- **REVIEW_BUDGET_CAP_RATIO=0.7 激活**，Review target.count 预算感知。
- **SPEAKING_NULL_IDLE: FIXED**（speakingIdleDays=null = NO_COMPLETED_SPEAKING_HISTORY = cadence overdue；null idle 不允许 REST）。
- **WEEKLY_TARGET_ZERO: SUPPORTED**（weeklyWordTarget=0 不强制 LEARN_NEW）。
- **EXAM_DATE_ROLE: CONTEXT_ONLY**；**FEASIBILITY_ROLE: CONTEXT_ONLY**（snapshot-only）；**TARGET_BAND_PLANNER_CONTROL: NO**（Band 不参与任何数量/优先级计算）。
- **PLANNER_REMAINING_QUESTIONS: NEEDS_PEDAGOGY_EVIDENCE**（learn/review 比例式并行是否最优、20 words/day cap、2-day Speaking cadence、0.5min/review item）——不得继续给 Planner 增加规则。
- 验证：focused 50/50（planner-v1 17 + 03a-regression 9 + today-api 2 + today-plan-view 6 + 02-E2E 16）；full unit **505 PASS / 2 FAIL**（2 项均为 PRE_EXISTING：llm-safety 静态债 + env.test 环境依赖；无 03B 回归）；`npx tsc --noEmit` PASS；`npx next build` PASS（41/41）。
- M3 边界：PAUSED；020=PRODUCT_FIXED_FORMAL_EVAL_PENDING；019_030=FIXED_PENDING_REGRESSION_1_OF_3；023_025_035=UNVERIFIED。

## PRODUCT_LOOP_02_E2E（REAL-LEARNING-LOOP-E2E）
**COMPLETE / PASS 16/16 — 固化 commit：本次（test(product): freeze product-loop-02 end-to-end learning loop）**
- **PRODUCT_CLASSIFICATION: CONTINUOUS_LEARNING_SYSTEM**（同一用户状态沿 Goal→Planner→Today→Learn→Review→Speaking→Report→Next Today 连续流动）。
- **FULL_LOOP_TRUTH_TABLE: 11/11 PASS**（GOAL_TO_PLAN / PLAN_TO_TODAY / TODAY_TO_LEARN / LEARN_TO_STATE / STATE_TO_REVIEW / REVIEW_TO_STATE / STATE_TO_SPEAKING / SPEAKING_COMPLETION / SPEAKING_NO_STATE_POLLUTION / STATE_TO_REPORT / REPORT_STATE_TO_NEXT_PLAN）。
- **REFERENCE_PROVIDER: MEMORY** — E2E PASS ≠ cross-device / Supabase persistence PASS。
- **GOAL_DURABILITY: MEMORY_REFERENCE_ONLY**；**SUPABASE_GOAL_PERSISTENCE: NOT_IMPLEMENTED**（ENV-SUPABASE-01 BLOCKED）。
- **VOCAB_TO_SPEAKING: V1 COMPLETE**（suggestedExpressions ≤2、来自已学 learner state、无匹配 SAFE FALLBACK=[]）；**SPEAKING_TO_VOCAB: NOT_IMPLEMENTED（V1.1 FUTURE）**（Speaking 零反向状态污染已验证）。
- **BAND_SAFETY: PASS**（单条泄漏也强制安全回退，public response band-free）。
- **M3: PAUSED**；**020: PRODUCT_FIXED_FORMAL_EVAL_PENDING**；**019_030: FIXED_PENDING_REGRESSION_1_OF_3**；**023_025_035: UNVERIFIED**。本任务未创建新 Eval run、未推进 lifecycle、未改 Frozen Gold。
- E2E_FINDING：无产品 bug（初始 6 个失败均为 harness 契约假设错误，已修正）。
- 产物：harness `tests/unit/product-loop-02-e2e.test.ts`（16 用例）；报告 `docs/product/PRODUCT-LOOP-02-E2E.md`。

## PRODUCT_LOOP_03A（PLANNER-QUALITY-AUDIT）
**COMPLETE** — 正式产品决策证据已入 canonical（commit 6fb560c，cherry-pick 4e44623）。审计文档：docs/product/PRODUCT-LOOP-03A-PLANNER-QUALITY-AUDIT.md（75 次场景执行 / 36 pairs / 3×7 天模拟）。
- **PLANNER_DECISION: PLANNER_V1_NEEDS_TARGETED_FIXES**（无 P0；骨架健康：Memory floor / Speaking cadence floor / Band 隔离 / 确定性 / reason 真实性 53/53）。
- **P0_FINDINGS: 0**；**P1_FINDINGS: 2**：
  - **P1_1: ABSOLUTE_DUE_GATE_CLIFF** — dueCount>=5 → learn=0 绝对闸门不看预算：due 4→5 悬崖（w140 时 learn 18→0）、普通学习者 LEARN↔REVIEW 逐日振荡、持续积压期新学饿死。
  - **P1_2: SILENT_OVER_BUDGET** — Review floor（+受保护口语）超预算时无 TODAY_OVERLOAD 信号（6 场景实测静默超预算）。
- P2×5（examDate/feasibility DEAD_GOAL_SIGNAL、null-idle 绕过 cadence floor、weeklyWordTarget=0 不可表达、learn reason 压缩后不刷新、REVIEW 垄断日）；P3×3（REVIEW_BUDGET_CAP_RATIO 死配置等）；NEEDS_PEDAGOGY_EVIDENCE×4。
- **NEXT_GATE: PRODUCT-LOOP-03B（PLANNER-TARGETED-FIX）** — 比例式 learn 分配 + 超预算显式信号 + P2 打包小修；完成后才进入 SPEAKING_TO_VOCAB V1.1。
- PRODUCT_CODE_MODIFIED: NO；NEW_EVAL_RUN: NO；M3 维持 PAUSED。

## LAST_VERIFIED_EVAL_RUN
`m3-20260910-125036` — 35 PASS / 0 FAIL / 4 UNVERIFIED（020/023/025/035）

## KNOWN_DEBT
- **TD-MINI-01**：miniapp 4 个 pre-existing TS errors。
- **PRE_EXISTING_TEST_DEBT**：CURRENT_REPRODUCIBLE_TEST_DEBT = 2（1×env.test 环境依赖 + 1×llm-safety 静态债；详见上节）。
- **LEGACY_MINIAPP_API_KEY_ROTATION**：建议 provider 端 ROTATE/REVOKE（未执行）。
- **M3 UNVERIFIED**：020/023/025/035。
- docs/tools/*.py 硬编码旧 canonical 路径（provenance only）。

## PROTECTED_INFRASTRUCTURE
- `D:\Codex\_secrets\IELTS-practice`（Secret Vault，Git 外，禁止 git init/提交/修改）
- `D:\Codex\_toolchains\java\jdk-17.0.20+8`（本地 JDK17 toolchain，不入 Git）
- `D:\Codex\_worktrees\IELTS-practice`（空 worktree root，保留给未来施工）

## FINAL_WORKTREE_REGISTRY
- `D:/Codex/IELTS-practice` [repo/arch-consolidate] — 唯一注册 worktree

## DO_NOT_DO
- 不恢复/推进 M3（除非 Control Plane 明确要求）。
- 不运行 full 39-case Eval / 不创建新 RUN_ID / 不推进 registry lifecycle。
- 不重写历史 run provenance（仍属 496ae31）。
- 不把当前 repo consolidation HEAD 冒充新的 independently-evaluated product checkpoint。
- 不读取/移动/提交任何 secret；不把 Vault 加入任何 Git repository。
- 不把 `D:\Codex\_toolchains` 加入任何 Git repository。
- 不 merge / cherry-pick Eval branch / integration/m3-p1；产品树 authority = repo/arch-consolidate。
- 不建 apps/web、apps/admin、apps/eval、packages/*。
- 不改动 seed 数据本身 / `mini-service.ts`。
- 不激活 supabase 0009（保持 deferred）。
- 不再发明新的 repo hygiene 审计阶段（consolidation 已完成）。
