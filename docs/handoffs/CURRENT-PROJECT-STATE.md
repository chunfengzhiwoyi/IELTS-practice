# CURRENT PROJECT STATE — IELTS Learning Platform Consolidation

> 任何新 Agent 接管时：先读本文件 + `git status` / `git log` / `git worktree list`，再读 `docs/architecture/REPO-ARCH-03G-CANONICAL-SWITCH.md` 即可恢复当前施工状态。
> 最后更新：2026-09-12（PRODUCT-LOOP-04AB-INTEGRATE 完成后）。

## REPO_CONSOLIDATION
**COMPLETE**

## CANONICAL_PATH
`D:\Codex\IELTS-practice`（唯一正式项目工作区）

## CANONICAL_BRANCH
`repo/arch-consolidate`

## CURRENT_HEAD
以 `git rev-parse HEAD` 为准（canonical switch 后 = 6a0ccb1 之上的 final switch docs commit）。

## CURRENT_PHASE
**PRODUCT_LOOP_04_COMPLETE** — Speaking→Vocabulary V1.1 整链完成：04A 证据契约审计 → 04B Evidence Pipeline → 04C 真实 LLM 质量验证 → 04D 状态映射设计 → 04E Evidence History + applicationLevel 写回 → 04F Speaking 跨语境内容覆盖修复（Level 2 真实路径可达）→ 04-FINAL E2E PASS。**04F 已集成**（`99d4e5f`）：题库 12→13、PHRASE/CHUNK 跨语境覆盖率 1/8→8/8（100%）、Level 2 real content path REACHABLE。`PRODUCT_LOOP_04_COMPLETE` ≠ `PRODUCTION_PERSISTENCE_COMPLETE`：REMOTE_SUPABASE_DEPLOYMENT_VERIFIED 仍为 NO。下一 Gate 为远程 Supabase evidence 持久化验证。

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
**TARGETED_FIX_REQUIRED（PRODUCTION-PERSISTENCE-01 BLOCKED）** — 远程 Supabase 部署被两项 blocker 阻断：① 无 DDL 通道（缺 DATABASE_URL / Management API token / supabase CLI；anon+service role 均无 DDL 能力）；② 远程 schema drift（0008 的 speaking_evaluations 缺失、无 schema_migrations 追踪）。Control Plane 需先裁决部署机制与 drift 处置，再重开远程验证（目标仍为部署 0010 + insert/upsert/select/unique/RLS/derive flow 验证）。REMOTE_SUPABASE_DEPLOYMENT_VERIFIED 仍为 NO。

## PRODUCT_LOOP_04A (SPEAKING→VOCAB EVIDENCE AUDIT)
- **04A_PRODUCT_DECISION**: EVIDENCE_PIPELINE_NEEDS_TARGETED_FIX
- **04A_EVIDENCE_SAFETY**: SAFE_FOR_EVIDENCE_ONLY
- **04A_FALSE_CORRECT**: 5（SEMANTIC_MISUSE ×4 + DEFINITIONAL_META_ECHO ×1）
- **04A_CORRECT_PRECISION**: 0.8077（21/26）
- **APPLICATION_LEVEL_SEMANTICS**: SEMANTICS_PARTIAL
- **04A_COMMIT**: 2b7ac2c（cherry-pick 7761aa5，docs-only：audit doc + frozen gold corpus 53 cases）
- 结论：结构规则不可捕获语义误用/回声；直接写回 19.2% 虚假升级 → 冻结 LONG_TERM_STATE_WRITEBACK=NO

## PRODUCT_LOOP_04B (SPEAKING→VOCAB EVIDENCE PIPELINE)
- **EVIDENCE_PIPELINE**: IMPLEMENTED（已集成 canonical `a39e8f0`）
- **SESSION_TARGET_SNAPSHOT**: IMPLEMENTED（itemId/canonicalForm/meaning frozen at session creation）
- **SERVER_TARGET_AUTHORITY**: YES（analyze 按 sessionId 读回 frozen targets；不重选；客户端不可注入）
- **EXISTING_ANALYZER_REUSED**: YES；**SECOND_LLM_CALL**: NO
- **STRICT_VALIDATOR**: IMPLEMENTED（itemId whitelist / enum / quote grounding / missing / duplicate / unknown / contract conflict）
- **GROUNDING_REQUIRED**: YES
- **EVIDENCE_RECORDING**: ENABLED_REFERENCE_PATH
- **EVIDENCE_QUALITY**: REAL_LLM_VERIFIED（04C：AVG_CORRECT_PRECISION=0.9792；MAX_FALSE_CORRECT=1；GROUNDING_VIOLATIONS=0）
- **LONG_TERM_STATE_WRITEBACK**: DISABLED；**APPLICATION_LEVEL_WRITEBACK / RECALL_LEVEL_WRITEBACK / REVIEW_SCHEDULE_WRITEBACK**: DISABLED
- **SUPABASE_EVIDENCE_PERSISTENCE**: NOT_IMPLEMENTED（toDomain 读回恒 []；EVIDENCE_DURABILITY=PARTIAL；无新 DB schema / migration）
- **SPEAKING→VOCAB V1.1**: evidence 记录已就绪；**反向写回仍 NOT_IMPLEMENTED（V1.1 FUTURE）**

## PRODUCT_LOOP_04C (EVIDENCE QUALITY EVAL — REAL LLM)
- **PRODUCT_LOOP_04C**: COMPLETE（`6c6d529` → cherry-pick `49786d4`，docs + eval harness + real run artifacts；无产品 runtime diff）
- **REAL_LLM_PIPELINE**: YES；**PROVIDER**: deepseek；**MODEL**: deepseek-chat；**TEMPERATURE**: 0.3
- **REAL_RUN_COUNT**: 3（53 cases/57 item labels/轮；159 次真实 LLM 调用；avg latency ≈8.4s/call；tokens/cost NOT_AVAILABLE）
- **CORRECT_PRECISION**: RUN1=1.0 / RUN2=1.0 / RUN3=0.9375 / **AVG=0.9792**；**CORRECT_RECALL**: AVG=0.7302
- **ISSUE_PRECISION**: 0.7493；**ISSUE_RECALL**: 0.8；**NOT_USED_ACCURACY**: 0.9792；**UNCERTAIN_RATE**: 0.1696；**OVERALL_ACCURACY**: 0.7544
- **GROUNDING_VIOLATIONS**: 0（三轮）；**VALIDATOR_DOWNGRADES**: 8/6/6（全保守路径）；**MISSING_EVIDENCE**: 0；**DUPLICATE_CONFLICT**: 2/1/1
- **FALSE_CORRECT**: 0 / 0 / 1；**MAX_FALSE_CORRECT**: 1；**AVG_FALSE_CORRECT**: 0.33；**FALSE_ISSUE**: 4/4/4
- **04A BEFORE/AFTER**: SEMANTIC_MISUSE_FALSE_CORRECT 4→0；META_ECHO_FALSE_CORRECT 1→0；precision 0.8077→0.9792；FALSE_CORRECT 5→0.33
- **CONSERVATIVE_TRADEOFF**: CORRECT recall 1.0→~0.73、UNCERTAIN ~5.3%→~17% —— **PRECISION_FIRST_TRADEOFF（非能力退化，亦非完美）**
- **M45_GOLD_STATUS**: **DISPUTED**（pros and cons：RUN_3 判 CORRECT；模型理由=目标表达本身正确、错误在表达外句级主谓一致，与 04A §9D 契约冲突；原 Gold 不覆盖、历史 metrics 不重算；Gold v2 需 adjudication 后修订）
- **P0_FINDINGS**: 0；**P1_FINDINGS**: 0；**P2_FINDINGS**: 3（P2-1 FALSE_ISSUE/保守误判 D17/M44/D18；P2-2 模型枚举漂移 "INCORRECT"→保守降级；P2-3 M45 多目标+句级语法不稳定）—— 均不阻塞 state mapping design，必须保留
- **EVIDENCE_SAFETY_DECISION**: **SAFE_FOR_STATE_MAPPING_DESIGN**
- **PRODUCT_DECISION**: **EVIDENCE_QUALITY_GOOD_ENOUGH_FOR_STATE_MAPPING_DESIGN**（=允许进入 04D 设计映射；**不等于 state writeback 已批准**）
- **LONG_TERM_STATE_WRITEBACK**: DISABLED；APPLICATION_LEVEL_CHANGED / RECALL_LEVEL_CHANGED / STATUS_CHANGED / NEXT_REVIEW_AT_CHANGED / REVIEW_SCHEDULE_CHANGED: NO
- **SECRET_LEAK**: NO（.env.local 未 track；real-run JSON/docs 无 key）
- **NEXT_GATE**: **PRODUCT-LOOP-04D-STATE-MAPPING-DESIGN**；**M3**: PAUSED

## PRODUCT_LOOP_04D (EVIDENCE→STATE MAPPING DESIGN)
- **PRODUCT_LOOP_04D**: COMPLETE（`b6c7c52` → cherry-pick `048659a`，docs-only；无 runtime diff）
- **APPLICATION_LEVEL_MODEL**: **DERIVED_FROM_EVIDENCE_HISTORY**（evidence=唯一事实源；derived 可重算/可重建）
- **APPLICATION_LEVEL_RANGE**: 0 | 1 | 2
  - **LEVEL_0**: NO_STABLE_APPLICATION_EVIDENCE（可能已有 1 条 CORRECT，不足稳定）
  - **LEVEL_1**: EMERGING_APPLICATION（≥2 validated CORRECT，≥2 distinct sessions）
  - **LEVEL_2**: STABLE_APPLICATION（≥3 CORRECT，≥3 sessions，≥2 distinct calendar days，≥2 distinct contexts）
- **LEVEL_0_TO_1**: ≥2 validated CORRECT across ≥2 distinct sessions（同 session immediate retry 经去重排除）
- **LEVEL_1_TO_2**: ≥3 validated CORRECT across ≥3 sessions + ≥2 distinct days + ≥2 distinct contexts
- **QUALIFYING_EVIDENCE**: VALIDATED_CORRECT_ONLY（upgradeCandidate + pipelineVersion≥04B-validator-1）
- **SAME_SESSION_DEDUPE**: YES（(sessionId,itemId) 唯一键 + upsert）
- **ISSUE_BEHAVIOR**: RECORD_ONLY_NO_DEMOTION（不改调度/状态/计数）
- **NOT_USED**: NO_OP；**UNCERTAIN**: NO_OP
- **DEMOTION_POLICY**: NONE_IN_V1；**DECAY_POLICY**: NONE_IN_V1（均 NEEDS_PEDAGOGY_EVIDENCE）
- **RECALL_LEVEL_CHANGED_BY_SPEAKING**: NO；**STATUS_CHANGED_BY_SPEAKING**: NO；**NEXT_REVIEW_AT_CHANGED_BY_SPEAKING**: NO；**REVIEW_SCHEDULE_CHANGED_BY_SPEAKING**: NO
- **M45_ADJUDICATION**: **FUTURE_GOLD_V2_RECOMMEND_CORRECT**（pros and cons 本身使用正确，原句主谓一致属表达外错误，符合 04A §9D）；**04C historical Gold/metrics: UNCHANGED**（禁止回写旧 artifact）
- **04E_SCOPE**: IMPLEMENT_EVIDENCE_HISTORY_AND_DERIVED_APPLICATION_LEVEL；**SUPABASE_EVIDENCE_MIGRATION**: **AUTHORIZED**（仅限 Application Evidence History persistence，不得扩其它 schema）
- **LONG_TERM_STATE_WRITEBACK**: NO（真正写 applicationLevel 只在 04E implementation）
- **STATE_MAPPING_DECISION**: STATE_MAPPING_DESIGN_READY_FOR_IMPLEMENTATION；P0=0/P1=0/P2=3（阈值 HEURISTIC_NOT_PEDAGOGICALLY_VALIDATED）
- **NEXT_GATE**: **PRODUCT-LOOP-04E**；**M3**: PAUSED

## PRODUCT_LOOP_04E (APPLICATION EVIDENCE STATE WRITEBACK)
**COMPLETE — 已入 canonical（cherry-pick `5c61086` → `a16772a`，0 冲突；实现文档 `docs/product/PRODUCT-LOOP-04E-APPLICATION-STATE-IMPLEMENTATION.md`，集成记录 `docs/product/PRODUCT-LOOP-04E-INTEGRATION.md`）**
- **PRODUCT_LOOP_04E**: COMPLETE
- **APPLICATION_EVIDENCE_HISTORY**: IMPLEMENTED（SSOT=evidence history；`applicationLevel` 为 materialized derived cache，可从 history 重算/重建）
- **APPLICATION_EVIDENCE_SSOT**: EVIDENCE_HISTORY；**APPLICATION_LEVEL_DERIVATION**: IMPLEMENTED（纯函数 `deriveApplicationLevel`，deterministic/idempotent/order-insensitive/recomputable；无 `applicationLevel += 1`）
- **APPLICATION_LEVEL_WRITEBACK**: ENABLED_FROM_VALIDATED_HISTORY（analyze 完成后落库 validated evidence → 每 target 重算写回）
- **APPLICATION_LEVEL_RANGE**: 0|1|2（0=NO_STABLE_APPLICATION_EVIDENCE / 1=EMERGING_APPLICATION / 2=STABLE_APPLICATION）
- **LEVEL_0_TO_1**: 2 CORRECT / 2 distinct sessions（同 session 去重后只算 1）
- **LEVEL_1_TO_2**: 3 CORRECT / 3 sessions / 2 calendar days / 2 contexts
- **ONE_CORRECT_PROMOTES**: NO；**SAME_SESSION_DEDUPE**: YES（(userId,itemId,sessionId) 唯一 + upsert；retry 合并一条，recoveredViaRetry=true）
- **QUALIFYING_EVIDENCE**: VALIDATED_CORRECT_ONLY（upgradeCandidate + pipelineVersion>=04B-validator-1；raw LLM/ISSUE/NOT_USED/UNCERTAIN/malformed/unknown-target/grounding-failed 均不参与正向）
- **ISSUE_DEMOTES**: NO；**NOT_USED**: NO_OP；**UNCERTAIN**: NO_OP；**DEMOTION_POLICY**: NONE_IN_V1；**DECAY_POLICY**: NONE_IN_V1
- **RECALL_LEVEL_CHANGED_BY_SPEAKING**: NO；**STATUS_CHANGED_BY_SPEAKING**: NO；**NEXT_REVIEW_AT_CHANGED_BY_SPEAKING**: NO；**CURRENT_INTERVAL_CHANGED**: NO；**CONSECUTIVE_CORRECT_CHANGED**: NO；**REVIEW_SCHEDULE_CHANGED_BY_SPEAKING**: NO
- **MEMORY_EVIDENCE_PERSISTENCE**: IMPLEMENTED（reference）；**SUPABASE_EVIDENCE_PERSISTENCE_IMPLEMENTATION**: IMPLEMENTED（migration 0010 + Supabase repository，mapping parity 测试覆盖）
- **REMOTE_SUPABASE_DEPLOYMENT_VERIFIED**: **NO**（本任务未部署 0010 到远程 Supabase、未做真实写读验证；**REMOTE_SUPABASE_EVIDENCE_WRITE_READ: NOT_TESTED**）——创建 migration+repo 只证明 persistence implementation exists，不等同 remote deployment verified
- **MIGRATION 0010**: 只建 `application_evidence`（id/user_id/item_id/session_id/question_id/part/topic/assessment/quote/reason/validator_notes/upgrade_candidate/recovered_via_retry/recorded_at/pipeline_version/provider/model）+ UNIQUE(user_id,item_id,session_id) + index + RLS（user_id=auth.uid() select/insert/update own）；不依赖 deferred 0009；不触碰 Goal/Planner/其他 schema
- **HISTORICAL_USERS**: 无 evidence history → derive=0（不从 recallLevel/status/review history 反推）
- 04C eval tests 3 处 type-only 非空断言修复（pre-existing tsc 基线，零 runtime 行为变化）
- 验证：04E focused **55/55 PASS**；回归（04B+02C+02D+02-E2E+planner+today）**183/183 PASS**；full unit **617 PASS / 2 FAIL**（llm-safety 静态债 + env.test 环境依赖，均非 04E 回归）；`npx tsc --noEmit` **PASS**；`npx next build` **PASS**（41/41）
- **M3**: PAUSED；**NEXT_GATE**: **PRODUCT-LOOP-04-FINAL-E2E**

## PRODUCT_LOOP_04_FINAL (FINAL E2E + INTEGRATION)
**COMPLETE — 已入 canonical（cherry-pick `4468b84` → `e488de5`，0 冲突；报告 `docs/product/PRODUCT-LOOP-04-FINAL-E2E.md`，集成记录 `docs/product/PRODUCT-LOOP-04-FINAL-INTEGRATION.md`）**
- **PRODUCT_LOOP_04_CORE_LOGIC**: **COMPLETE**（学→建议→真实使用→validated evidence→History→派生→target-selection 反馈，整链真实成立）
- **PRODUCT_LOOP_04_FINAL_E2E**: **PASS**；**PRODUCT_LOOP_04_TECHNICAL_E2E**: PASS
- **PRODUCT_LOOP_04_PRODUCTION_CONTENT_READINESS**: **NEEDS_CONTEXT_COVERAGE_FIX**（如实：技术闭环通过，但真实内容供给不足）
- **APPLICATION_EVIDENCE_LOOP**: END_TO_END_VERIFIED；**REAL_LLM_PATH**: PASS（deepseek / deepseek-chat，5 次真实调用，fallback_used=false）
- **APPLICATION_LEVEL_0_TO_1**: REAL_PATH_VERIFIED（真实 LLM 两独立 session CORRECT → 0 → 1）
- **APPLICATION_LEVEL_1_TO_2**: PRODUCTION_LOGIC_VERIFIED_WITH_CONTROLLED_TIME_CONTEXT_FIXTURE（跨日/跨语境 evidence fixture + 真实 derive/写回 → 2；**LEVEL_2_TEST_SETUP: CONTROLLED_EVIDENCE_FIXTURE**）
- **TARGET_SELECTION_FEEDBACK_LOOP**: VERIFIED（Level 0 score 4 → Level 2 score 2；入选但优先级下降；不永久排除）
- **PLANNER_APPLICATION_LEVEL_INDEPENDENCE**: PASS（PlannerInput 无 applicationLevel）
- **STATE_INVARIANTS**: PASS（recallLevel/status/nextReviewAt/currentIntervalDays/consecutiveCorrect/recognitionLevel 全程不变）
- **RECOMPUTABLE_FROM_HISTORY**: PASS（人为置 0 → recompute 恢复 2；SSOT=Evidence History）
- **SAME_SESSION_DEDUPE**: PASS（真实 LLM 路径 + 确定性路径双验证）
- **ISSUE_DEMOTES**: NO；**NOT_USED**: NO_OP；**UNCERTAIN**: NO_OP；单条假阳性 CORRECT → Level 0（PASS）
- **CURRENT_SPEAKING_QUESTION_BANK**: **12 questions**；**CROSS_CONTEXT_LEVEL2_REAL_PATH**: **STRUCTURALLY_UNREACHABLE**（可匹配 PHRASE/CHUNK 无任何表达能在题库匹配 ≥2 distinct contexts → 真实用户当前无法自然满足 >=2 distinct contexts）
- **分类**: **P2_PRODUCT_CONTENT_COVERAGE_GAP**（非 state machine / LLM / evidence / planner bug；限制 STABLE_APPLICATION 在生产中的可达性）
- **MEMORY_E2E**: PASS；**SUPABASE_REPOSITORY_SEMANTICS**: PASS（04E persistence mapping parity）；**SUPABASE_PERSISTENCE_IMPLEMENTED**: YES
- **REMOTE_SUPABASE_DEPLOYMENT_VERIFIED**: **NO**；**REMOTE_SUPABASE_EVIDENCE_WRITE_READ**: **NOT_TESTED**（production persistence 未宣称 complete）
- 回归：04E/04B/02C/02D/02-E2E/Planner/badcase-026 全 PASS；04C deterministic harness PASS（未重跑 159 次真实调用）；full unit **631/632 PASS**（**KNOWN_DEBT**: llm-safety.test.ts pre-existing——ModelSettingsPanel.tsx client import @/lib/llm/catalog，494eb69 即存在，未修改）；`tsc --noEmit` PASS；`next build` PASS
- **M3**: PAUSED；**NEXT_GATE**: **PRODUCT-LOOP-04F-SPEAKING-CONTEXT-COVERAGE**（独立题库覆盖修复任务；本任务不得趁机补题库）

## PRODUCT_LOOP_04F (SPEAKING CROSS-CONTEXT COVERAGE)
**COMPLETE — 已入 canonical（cherry-pick `373e122` → `99d4e5f`，0 冲突；报告 `docs/product/PRODUCT-LOOP-04F-SPEAKING-CONTEXT-COVERAGE.md`，集成记录 `docs/product/PRODUCT-LOOP-04F-INTEGRATION.md`）**
- **SPEAKING_CONTEXT_COVERAGE**: **FIXED**（覆盖 04_FINAL 段的 STRUCTURALLY_UNREACHABLE 结论）
- **QUESTION_BANK**: 13（新增 `sp-p1-005` Environmental Habits，questionId 唯一，OPTIONAL 契约保持）
- **SPEAKING_ELIGIBLE_PHRASE_CHUNK**: 8（seed-003/006/007/008/013/015/016/018）
- **ITEMS_WITH_2PLUS_CONTEXTS**: 8（BEFORE=1）；**CROSS_CONTEXT_COVERAGE_RATE**: 100%（BEFORE=12.5%）
- **EXPRESSION_TAGS_CHANGED**: 7（seed-003/006/008/015/016/018/021）；**QUESTIONS_ADDED**: 1；**QUESTIONS_RETAGGED**: 0
- **SEED_003_REAL_CONTEXTS**: 5（sp-p1-001/P1 Daily Routine、sp-p2-003/P2 A Person Who Influenced You、sp-p3-001/P3 Education and Technology、sp-p3-003/P3 Work-Life Balance、sp-p1-005/P1 Environmental Habits）；P1/P2/P3 三池真实 target-selection 均可达 ≥2 distinct contexts
- **LEVEL_2_REAL_CONTENT_PATH**: **REACHABLE**（不依赖 CONTROLLED_EVIDENCE_FIXTURE 即可自然满足 distinctContexts>=2）
- **CONTENT_EXCEPTIONS**: NONE；**OPTIONAL_SUGGESTION_CONTRACT**: PRESERVED（无匹配→targets=[]，Speaking 正常）
- **TAG_NATURALITY_REVIEW**: PASS；**QUESTION_QUALITY_REVIEW**: PASS
- **TEST_FIXTURE_ASSUMPTION_UPDATED**: YES（02C D1/D2、02-E2E E2E-08 原「seed-003 在 P3 无匹配」fallback fixture 过时 → 换真正无匹配场景；p3-speaking 题数 12→13、P1 4→5）；**PRODUCT_BEHAVIOR_EXPECTATION_CHANGED**: NO
- **APPLICATION_LEVEL_RULE_CHANGED**: NO；**EVIDENCE_RULE_CHANGED**: NO；**PLANNER_CHANGED**: NO；**DATABASE_CHANGED**: NO（NEW_DATABASE_SCHEMA=NO、NEW_SUPABASE_MIGRATION=NO、0010 unchanged、0009 仍 deferred）
- **回归（canonical 集成后）**: coverage 7/7、02C/02D/02-E2E(16)/04B/04E/Planner/p3-speaking 全 PASS（206/206）；`tsc --noEmit` PASS；`next build` PASS；full unit **637 PASS / 2 FAIL**（**KNOWN_DEBT**: llm-safety.test.ts pre-existing static；env.test ENVIRONMENT_DEPENDENT——canonical `.env.local` 含真实 Supabase URL 时按设计失败）
- **PRODUCT_LOOP_04**: **COMPLETE**（理由：Evidence quality real-LLM verified + Evidence history/state writeback implemented + Level0→1 real path verified + Level2 mapping verified + Level2 real content path reachable + target-selection feedback verified）
- **REMOTE_SUPABASE_DEPLOYMENT_VERIFIED**: **NO**（PRODUCT_LOOP_04_COMPLETE ≠ PRODUCTION_PERSISTENCE_COMPLETE）
- **M3**: PAUSED；**NEXT_GATE**: **PRODUCTION-PERSISTENCE-01-REMOTE-SUPABASE-EVIDENCE**

## PRODUCTION_PERSISTENCE_01 (REMOTE SUPABASE EVIDENCE VERIFICATION)
**BLOCKED — PREFLIGHT 停止，未部署未写入（报告 `docs/product/PRODUCTION-PERSISTENCE-01-REMOTE-SUPABASE-EVIDENCE.md`）**
- **REMOTE_PROJECT_CONFIGURED**: YES（ref `nizjfakkmziwanxdcdxd`）；**REMOTE_CONNECTIVITY**: PASS（端点可达，auth/rest 401 为未带 key 预期；service role 只读探测成功）
- **REMOTE_SCHEMA_DRIFT**: **YES**（远程缺 0008 的 speaking_evaluations；无 supabase_migrations.schema_migrations 追踪；远程部署为手工/选择性应用）
- **APPLICATION_EVIDENCE_TABLE_BEFORE**: **ABSENT**（0010 未部署，符合预期）
- **DEPLOYMENT_METHOD**: NONE_AVAILABLE — 缺 DDL 凭据：DATABASE_URL / Management API token / supabase CLI 全部缺失；anon+service role 均无 DDL 能力（PostgREST 不提供 create table）
- **0010_DEPLOYMENT**: **BLOCKED**（两个 blocker：DATABASE_DEPLOYMENT_CREDENTIAL_REQUIRED + REMOTE_SCHEMA_DRIFT；按任务卡 §8/§9 STOP，不通过 REST 绕过 DDL，不强推 0010）
- **TEST_ROWS_CREATED**: 0；**TEST_ROWS_CLEANED**: 0（无需清理）；未触碰任何远程真实数据
- **保留真实标签**: REMOTE_SUPABASE_DEPLOYMENT_VERIFIED=NO、REMOTE_SUPABASE_EVIDENCE_WRITE_READ=NOT_TESTED、REMOTE_SUPABASE_RLS_VERIFIED=NO、APPLICATION_EVIDENCE_DURABILITY=NOT_VERIFIED（repository 实现 + memory E2E 仍 PASS）、CROSS_DEVICE_VERIFIED=NO
- **PRODUCT_RUNTIME_MODIFIED**: NO；本地回归快速确认 93/93 PASS（04E/04F/02-E2E/02C）；secret 无泄漏；.env.local 未 tracked
- **SEPARATE_PERSISTENCE_DEBT**（既有已知，不扩 scope）: 远程 0008 部分未应用；Goal persistence 仍 MEMORY_REFERENCE_ONLY
- **M3**: PAUSED；**NEXT_GATE**: TARGETED_FIX_REQUIRED（Control Plane 裁决部署机制 + drift 处置后重开）

## DASHBOARD-RECOVERY-01 (DASHBOARD / REPORT 当前状态审计)
**AUDIT COMPLETE（只读，PRODUCT_CODE_MODIFIED=NO；报告 `docs/product/DASHBOARD-RECOVERY-01-CURRENT-STATE.md`）**
- **Dashboard UI**: DONE（`/dashboard` 产品数据看板，dev 200，5 section 齐全，无 mock/JSON debug）
- **Learning Report UI**: DONE（`/report` 学习报告，模块齐全，dev 200）
- **Dashboard Real API**: DONE（7d/30d/all 200，sourceMode=real，聚合真实，生产不回退 Mock）
- **Report Real API**: DONE（200，服务端 SSOT 聚合 + 推荐 + LLM summary）
- **Supabase Read Connectivity**: PASS（dev 实读远程成功）；**Required Remote Data**: PARTIAL
- **SCHEMA_BLOCKER（error=3）**: dashboard 报告回流率/内容复用依赖 `report_views`/`content_reuse_events`，两表仅存在于 deferred 0009（从未激活部署）
- **EMPTY_BUT_VALID**: 远程无真实学习活动 → health/lifecycle/impact 多为 0/insufficient（合法展示）
- **部署**: 无 Vercel 项目/vercel.json/在线 URL（ONLINE_URL=NONE_FOUND）；`scripts/deploy-static.mjs` 静态导出不支持 API；`.env.example` 存在可参考
- **TYPECHECK**: PASS；**WEB_BUILD**: PASS（41/41，仅非阻塞 warning）
- **PREVIEW_DEPLOY_READY**: YES（代码可部署，需 Vercel 项目+环境变量）；**PRODUCTION_DEPLOY_READY**: NOT_READY
- **P2**: demo 模式 llmSummary=null（mock schema mismatch，生产真实 LLM 不受影响）
- **NEXT_STEP（最多 3）**: ① 建 Vercel 项目+配环境变量出 Preview URL；② Control Plane 裁决激活 deferred 0009（或声明两指标 known-unavailable）；③ 为演示账号写真实学习活动（或确认空数据态上线）
- **M3**: PAUSED（不受本审计影响）

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

## PRODUCT_LOOP_03B_RECONCILE（REVISED PLANNER REGRESSION COVERAGE）
**COMPLETE — commit 见本次（test(product): reconcile revised planner regression coverage）；记录 `docs/product/PRODUCT-LOOP-03B-DELTA-RECONCILE.md`**
- **PRODUCT_CODE_DELTA: NONE**（revised db91cc5 vs 已集成 e4b2eee 产品路径零差异；PLANNER_PRODUCT_LOGIC: UNCHANGED_AFTER_03B_INTEGRATION）。
- **TEST_COVERAGE: REVISED_TO_TEST_01_16_AND_MONO_01_06**（planner-v1.test.ts +151 行；due 3–7 cliff、预算感知、OVERLOADED、null idle、weekly=0、band 6/7/8/9 invariant、Speaking cadence reset、3×7-day、MONO-01..06）。
- 文档 reconciled（revised 版 + 集成/reconcile 记录；base 表述保持 d5d3d72，未回退 canonical state）。
- 验证：focused **59/59 PASS**（含 02-E2E 16/16，E2E 语义未变）；full unit **514 PASS / 2 FAIL**（env.test 环境依赖 + llm-safety 静态债，无 delta 回归）；typecheck PASS；next build PASS。
- M3 边界：PAUSED；020=PRODUCT_FIXED_FORMAL_EVAL_PENDING；019_030=FIXED_PENDING_REGRESSION_1_OF_3；023_025_035=UNVERIFIED。

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
