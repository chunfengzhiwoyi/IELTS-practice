# REPO-ARCH-03G — Canonical Switch Read-Only Precheck（任务报告）

- 日期：2026-09-11
- Worktree：`D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-03G-PRECHECK`
- Branch：`audit/repo-arch-03g-precheck`
- Base：`1bdf8fd8561c6b296358764cd786d1a6dcab7719`
- 模式：PARALLEL_READ_ONLY / MAINLINE_IMPACT = NONE
- 并行 agent：豆包a SECRET-HYGIENE-01、豆包b REPO-ARCH-03F-AUDIT（未等待；遇 secret 标 `WAIT_FOR_SECRET_HYGIENE_01`，遇 source retirement 标 `WAIT_FOR_03F_DECISION`）

## 0. 结论摘要

**CANONICAL_SWITCH_READY_NOW = NO**，但非笼统否决。精确 blockers：

1. **P4_P7_PERMANENT_DOCS**：61 个 P4_P7_EVIDENCE 中 27 个为永久项目证据（v2-system-audit 等），需一次 doc absorption task 进入 consolidation，否则 switch 后丢失。
2. **SUPABASE_0009_UNPRESERVED**：`0009_p6_instrumentation.sql` 只存在于旧 canonical dirty working tree（2611B），全 Git 历史、全磁盘无第二副本 → 唯一资产，switch 前必须保留或显式 defer。
3. **WAIT_SECRET_HYGIENE**：vercel-env-production.txt / vercel-upload.env（及新发现的 .env.local）处置未完成。
4. **03F_DECISION_PENDING**：source retirement 唯一资产审计（豆包b）仍在进行，未出结果。

产品代码本身 100% 可切换：**0 个未保留产品资产（除 0009）**；Dashboard 36/36 已吸收；4 个 tracked modified 已吸收；旧 canonical tracked 产品内容在语义上是 consolidation 的子集（consolidation 甚至包含旧 canonical 缺失的 M3 S1 修复）。

## 1. 环境快照（前/后）

| 项 | 审计前 | 审计后 |
|---|---|---|
| OLD CANONICAL HEAD | `f0ac5131828ddddadf5231779ed262319f1f034b` | 相同（未变） |
| OLD CANONICAL BRANCH | `integration/m3-p1` | 相同 |
| tracked modified | 4 | 4 |
| untracked（目录级 `??`） | 63 | 63 |
| untracked（文件级 `??`，--untracked-files=all） | 103 | 103 |
| status 总行数（文件级） | 107 | 107 |
| CONSOLIDATION HEAD | `1bdf8fd`（clean） | **`9c3d7da`**（并行 SECRET-HYGIENE-01 推进，docs-only：SECRET-HYGIENE-01.md + keystore.properties.example + CURRENT-PROJECT-STATE.md；产品树未动） |

**SOURCE_CANONICAL_UNCHANGED = YES**（前后逐项一致，审计全程只读）。
**CONSOLIDATION_UNCHANGED = NO**（并行 agent 在审计期间推进 1bdf8fd → 9c3d7da，变更仅 secret-hygiene docs + .example，不影响本报告产品结论）。

## 2. Dirty Asset 全量枚举（文件粒度）

- 真实 dirty 集 = **107 个 status 条目（4 modified + 103 untracked）+ 2 个 ignored secret = 109**，与 `canonical-asset-manifest.json` 109 条目**逐路径精确吻合**（集合比对 0 差）。
- **CANONICAL_DIRTY_SET_DRIFT = NO**（"63 条目录级 untracked" 是目录折叠计数；文件粒度 103，manifest 对齐 109）。
- ignored 全量（566 条）归属：`.next` 419、`scripts/_dashboard_kit_extracted` 86、`out` 52、`playwright-report` 2、`test-results` 2、`tsconfig.tsbuildinfo` 1、`.workbuddy` 1 → **BUILD_ARTIFACT / GENERATED_IGNORE**（不构成 blocker，本任务未删除）；`vercel-env-production.txt`、`vercel-upload.env` → SECRET。
- **新增发现**：`.env.local`（1892B，ignored）——manifest 未收录的第 3 个本地环境文件，属 SECRET-HYGIENE-01 处置范围（不改变 109 资产账目）。

## 3. Manifest 状态核验（实际文件，非仅旧记录）

- `canonical-asset-manifest.json`：109 条目 = P4_P7_EVIDENCE 61 + DASHBOARD_PRODUCT 36 + WEB_UI_CHANGE 4 + HANDOFF_DOC 3 + ARCHITECTURE_DOC 2 + LOCAL_ENV_OR_SECRET 2 + UNKNOWN(0009) 1。
- migrated = 45 / verified = 45（**0 个 migrated 且未 verified**）：36 DASHBOARD + 4 WEB_UI + 3 HANDOFF + 2 ARCH_DOC。
- 未迁移 64：P4_P7 61 + 0009 1 + secret 2（全部 REVIEW_BEFORE_COPY / DO_NOT_COPY_SECRET）。

## 4. 4 个 Tracked Modified 复验（TRACKED_MODIFIED_ABSORPTION = PASS）

| 文件 | 旧 canonical vs consolidation | 判定 |
|---|---|---|
| components/assistant/assistant-dock.tsx | SHA256 IDENTICAL | ABSORBED_IDENTICAL |
| components/layout/masthead.tsx | SHA256 IDENTICAL | ABSORBED_IDENTICAL |
| .gitignore | 超集（consolidation 66→84 行，仅新增 miniapp/android 卫生条目，原条目全保留） | ABSORBED_SEMANTICALLY |
| tsconfig.json | 仅 exclude 新增 `"apps/miniapp"`（03C 记录根 tsconfig 排除项），其余全同 | ABSORBED_SEMANTICALLY |

不依赖旧 manifest 结论，本次为逐文件哈希 + 内容 diff 复验。

## 5. Dashboard 资产核验（DASHBOARD_ABSORPTION = PASS）

- 36/36 DASHBOARD_PRODUCT 条目存在于 consolidation，**MISSING=0，SIZE_MISMATCH=0**（manifest source_size = 实际字节）。
- 3 个 detail routes 用 **-LiteralPath** 验证（规避 PowerShell `[]` 通配符误判）：
  - `app/api/dashboard/lifecycle/[stageId]/route.ts` = 1421B
  - `app/api/dashboard/modules/[moduleId]/route.ts` = 1369B
  - `app/api/dashboard/traces/[traceId]/route.ts` = 669B
  - 全部 **IMPLEMENTED**，无 0-byte stub（03A 的 "3 stub" 记录为通配符读取假象，03B 已修正，本次复验成立）。
- `generated/dashboard/latest-eval.json`（211B）等其余条目均在场。

## 6. Durable Trace Store（DURABLE_TRACE_STORE_ABSORPTION = PASS）

- `lib/observability/durable-trace-store.ts`（3764B）已进入 consolidation。
- import 范围复验：app / components / lib / middleware **0 处**；唯一 import = `tests/unit/dashboard-metrics.correctness.test.ts` → **仅 Dashboard persistence capability，未接入普通 request runtime**。本任务只核对资产，不重新设计。

## 7. 产品树对比（OLD_CANONICAL_ONLY_PRODUCT_DIFF）

- 目录 `app components lib data supabase`：**OLD_CANONICAL_ONLY_PRODUCT_FILE_COUNT = 1**（`supabase/migrations/0009_p6_instrumentation.sql`）。
- 共享文件 246 个哈希对账：173 个 EOL-only 差异（CRLF/LF，归一化后内容一致），**13 个真实内容差异**。

### 7.1 关键发现：13 个内容差异方向 = consolidation 含旧 canonical 缺失的 M3 S1 修复

- 拓扑：merge-base = `43364c3`；`f0ac513`（旧 canonical）侧仅 3 个 eval 提交（f0ac513 / 19577a6 / 7ff7fc1，旧 39-case eval 系统）；`496ae31`（consolidation 基线）侧为全部 S1 修复提交。
- `git diff 496ae31 f0ac513`：f0ac513 **删除**了 496ae31 中的修复：
  - BC-034 audio_metadata：`app/api/speaking/transcribe/route.ts`、`lib/observability/trace-contract.ts`
  - BC-033 LlmError kind 保留：`app/api/learn/card/route.ts`
  - BC-M3-003 baseline missing-vs-zero：`components/report/compare-section.tsx`、`lib/client/demo-service.ts`、`lib/client/report-transform.ts`
  - BC-M3-004 evidence sanitization：`lib/speaking/feedback-quality.ts`、`lib/speaking/types.ts`、`lib/llm/tasks/analyze-speaking.ts`；及被删文件 `lib/speaking/evidence-grounding.ts`、`lib/speaking/evidence-sanitizer.ts`
  - ELS-EVAL-026 conflict detection：`lib/knowledge/retrieval.ts`、`lib/knowledge/types.ts`、`lib/learning/types.ts`、`lib/llm/tasks/generate-word-card.ts`；及被删文件 `lib/knowledge/conflict.ts`
- **判定**：旧 canonical 工作树（= f0ac513）在这些路径上缺失已验证修复；consolidation（496ae31 基线）保留修复且经 eval S1 验证。consolidation 语义上 ⊇ 旧 canonical 产品内容。13 个差异文件分类 = **SUPERSEDED_BY_CONSOLIDATION**（不构成未保留资产）。
- 全树对比：f0ac513 tracked 363 文件，**0 个缺失于 consolidation HEAD**（633 文件）。

## 8. P4-P7 Evidence 决策盘点（本轮真正回答，不再写 REVIEW）

61 个 P4_P7_EVIDENCE 分类（基于逐文件头部/内容/版本关系审查）：

### A. PERMANENT_PROJECT_EVIDENCE = 27（进入新 canonical docs 需 doc absorption task）
| 组 | 文件 |
|---|---|
| P4（2） | P4_METRIC_FORMULA_AUDIT.md、P4_REAL_REPOSITORY_REPORT_V2.md |
| P5（4） | P5_CORRECTNESS_REPORT_V2.md、P5_EXIT_GATE_AUDIT.md、P5_FIXTURE_MATRIX_V2.md、P5_MUTATION_GUARDS.md |
| P6（9） | P6_1_EMIT_POINT_AUDIT.md、P6_1_PRIVACY_AUDIT.md、P6_1_RUNTIME_SOURCE_AUDIT.md、P6_1_WIRING_REPORT.md、P6_CONTENT_REUSE_REPORT.md、P6_INSTRUMENTATION_REPORT.md、P6_MIGRATION_AUDIT.md、P6_REPORT_REENTRY_REPORT.md、P6_TRACE_DURABILITY_REPORT.md |
| P7（7） | P7_API_QA.md、P7_FINAL_ACCEPTANCE_MATRIX.md、P7_INSTRUMENTATION_E2E.md、P7_INTEGRATION_QA_REPORT.md、P7_INTERACTION_QA.md、P7_SECURITY_AND_DEPLOYMENT_GATES.md、P7_VISUAL_QA.md |
| P7.5（3） | P7_5_AUTHORIZATION_AUDIT.md、P7_5_DEPLOYMENT_GATE_MATRIX.md、P7_5_EVAL_PACKAGING_AUDIT.md |
| 数据/系统（2） | REAL_EVENT_MAPPING_FINAL.csv、docs/v2-system-audit.md |

### B. TEMPORARY_WORKING_NOTES = 26（无需进入最终 repo）
DASHBOARD_INTEGRATION_PLAN.md、DASHBOARD_PREFLIGHT.md、P4_API_RESPONSE_SAMPLES_V2.json、reports/P4_API_RESPONSE_SAMPLES.json、reports/dashboard-p2-1/{CSS_COLLISION_AUDIT.md, P2.1.1_FINAL_PARITY_DELTA.md, VISUAL_PARITY_AUDIT.md, 9×png}、scripts/_p21_domcheck.js、scripts/_p21_shots.js、shot-{final,proto,report-data,verify}.mjs、scripts/LINGXI_DASHBOARD_IMPLEMENTATION_KIT_FINAL.zip、P7_5B2_HUMAN_PROBE.md、P7_5_MIGRATION_REVIEW.md、P7_5_REMOTE_ENVIRONMENT_AUDIT.md

### C. DUPLICATED_BY_LATER_EVAL/DOCS = 8（可退休）
P4_API_SAFETY_AUDIT.md（并入 V2 报告）、P4_REAL_REPOSITORY_REPORT.md（V1→V2）、P5_CORRECTNESS_REPORT.md（V1→V2）、P5_FIXTURE_MATRIX.md（V1→V2）、docs/ELS_EVALUATION_V1.json + V1.md（被 V1.1 取代）、docs/ELS_EVALUATION_V1_1.json（**已以 IDENTICAL 吸收进 consolidation docs/eval/spec/**）、docs/ELS_EVALUATION_V1_1.md（json spec 为权威冻结形式）

### 计数与含义
- P4_P7_TOTAL_COUNT = 61；PERMANENT = 27；TEMP = 26；DUPLICATE = 8；UNKNOWN = 0；MIXED = 0。
- **UNPRESERVED_PERMANENT_DOC_COUNT = 27 → CANONICAL_SWITCH_BLOCKER = YES**（需要一次 doc absorption task；建议吸收为 consolidated dashboard-acceptance 文档集或逐文件保留至 docs/）。

## 9. Architecture / Handoff Docs

- 5 个旧 canonical 文档已吸收且 **IDENTICAL**（SHA256 复验）：M3-PAUSED-STATE.md、REPO-HYGIENE-01.md、REPO-HYGIENE-02.md、REPO-ARCH-02-INVENTORY.md、REPO-ARCH-02-PLAN.md。
- consolidation 含更新版本（03A–03E.2、CURRENT-PROJECT-STATE.md、ARCH-03B-ALLOWLIST.md 等）→ 旧版不构成 blocker；旧 canonical 中无其他未吸收架构/交接文档。分类：SUPERSEDED_BY_CONSOLIDATION（5 个已吸收）+ 无遗漏。

## 10. Supabase 0009（SUPABASE_0009_SWITCH_BLOCKER = YES）

- `supabase/migrations/0009_p6_instrumentation.sql`（2611B，UNTRACKED，ABSENT_IN_VERIFIED_BASE，BLOCKED_ENV-SUPABASE-01）。
- **SUPABASE_0009_UNIQUE_SOURCE_STATUS = UNIQUE_UNTRACKED_WORKING_TREE_ONLY**：
  - `git log --all -- <path>`：**0 命中**（从未在任何分支提交）；
  - 全磁盘 `D:\Codex` 扫描：仅此一份（含 _worktrees / IELTS-m2-debug-console / ielts-monorepo / 内容指纹搜索，均无等价副本）。
- 原则判定：不属于"已在 Git/外部安全保存来源中可恢复"→ 属于 **SWITCH_BLOCKING_UNPRESERVED_ASSET**。switch 前必须：复制入 consolidation `supabase/migrations/`（本地未提交或经 env 门禁提交）或显式备份 + defer 记录。本轮不迁、不复制。

## 11. Secret Assets（未读取内容）

| 文件 | exists | size | ignored | 处置 |
|---|---|---|---|---|
| vercel-env-production.txt | YES | 1280B | YES（.gitignore:53） | DO_NOT_COPY / WAIT_FOR_SECRET_HYGIENE_01 |
| vercel-upload.env | YES | 1094B | YES（.gitignore:54） | DO_NOT_COPY / WAIT_FOR_SECRET_HYGIENE_01 |
| .env.local（新发现） | YES | 1892B | YES（.gitignore:18） | 纳入 SECRET-HYGIENE-01 范围 |

**SECRET_ASSETS_STATUS = WAIT_FOR_SECRET_HYGIENE_01**。并行 agent 已在 consolidation 侧落地 SECRET-HYGIENE-01.md + keystore.properties.example（9c3d7da）；旧 canonical 的 3 个本地 env 文件处置完成后才可 CLEARED。未复制、未读取任何 secret。

## 12. Generated Assets（GENERATED_ASSETS_SWITCH_BLOCKER = NO）

.next / out / node_modules / test-results / playwright-report / build / cache / tsconfig.tsbuildinfo / .workbuddy / scripts/_dashboard_kit_extracted 全部 = BUILD_ARTIFACT（566 条 ignored），随 .gitignore 覆盖。本轮不删除。

## 13. Eval Asset State

- consolidation 已具备：tests/eval **56** + scripts/eval **1** + docs/eval **50** = **107**（来源 `eval/m3-run-04@8080e1e`，eval-asset-manifest 107 条；spec `docs/eval/spec/ELS_EVALUATION_V1_1.json` 与旧 canonical 版本 SHA256 IDENTICAL）。
- 旧 canonical f0ac513 内旧 Eval（39-case 系统，3 个提交）已由 8080e1e 取代。
- **LATEST_EVAL_PRESENT_IN_CONSOLIDATION = YES；OLD_CANONICAL_EVAL_SUPERSEDED = YES**（旧 eval 内容已提交于 Git 历史，switch 不丢失）。不构成 switch blocker。

## 14. Git History Safety（OLD_CANONICAL_HISTORY_PRESERVABLE = YES）

- `refs/heads/integration/m3-p1` = f0ac513 存在；`refs/heads/repo/arch-consolidate` = 9c3d7da（并行推进）；eval/m3-run-04 = 8080e1e、各 fix/* 分支、tag pre-m1-historical-baseline 均在场。
- 未来 switch 即使切换 filesystem checkout，**integration/m3-p1 分支及全部历史保留于 Git object DB**。

## 15. Switch 策略建议（仅比较，不执行）

- **推荐 STRATEGY A（filesystem checkout 到 repo/arch-consolidate）**：前提 = ①P4_P7 27 个永久文档吸收/归档；②0009 保留或显式 defer；③SECRET-HYGIENE-01 处置完成（CLEARED）；④03F source audit PASS。优点：无 merge 冲突面（两分支自 43364c3 分叉，历史天然保留）、产物树直接对齐已验证 checkpoint。
- STRATEGY B（merge consolidation → 新 canonical branch 再 checkout）：两分支分叉后均新增大量文件（旧 eval 系统 vs S1 修复），merge 会产生高冲突/重复风险，**不推荐**。
- 禁止项遵守：未切 branch / reset / clean / stash / delete / copy / merge。

## 16. Switch Gate 状态

| Gate | 状态 |
|---|---|
| UNPRESERVED_PRODUCT_ASSET_COUNT = 0 | ❌ = 1（0009，待保留） |
| UNPRESERVED_PERMANENT_DOC_COUNT = 0 | ❌ = 27（P4_P7 永久文档） |
| SECRET_PRESERVATION = CLEARED | ❌ WAIT_FOR_SECRET_HYGIENE_01 |
| SUPABASE_0009 = SAFE_PRESERVED_OR_EXPLICITLY_DEFERRED | ❌ 未保留/未 defer |
| 03F source audit = PASS | ❌ PENDING（并行） |
| consolidation worktree = clean | ✅（9c3d7da，检查时 clean） |
| repo/arch-consolidate = committed | ✅ |
| old branch/history = preserved | ✅ |

## 17. 输出与提交

- 本文件：`docs/architecture/REPO-ARCH-03G-PRECHECK.md`
- 提交：`audit/repo-arch-03g-precheck`（未 merge，未触碰 canonical / consolidation / 其他 worktree）
- 只读纪律：旧 canonical 全程只读（前后快照一致）；未读 secret 内容；未复制/删除/移动任何文件；未修改 consolidation。

## 18. 审计限制与缺口

- 13 个分叉文件判定依据 = 两提交内容 diff + 工作树 grep 佐证；未运行 typecheck/build（非本任务范围，03E 已 PASS）。
- P4_P7 永久文档的吸收形态（逐文件 vs 合并为 acceptance 文档）留待 doc absorption task 决定。
- .env.local 为 manifest 外新增本地文件，SECRET-HYGIENE-01 需一并处置。
- 并行 agent 可能继续推进 consolidation（当前 9c3d7da）；switch 执行前需重新核对 consolidation HEAD。

---

## AGENT_HANDOFF

| 字段 | 值 |
|---|---|
| AGENT | 豆包c |
| TASK_ID | REPO-ARCH-03G-PRECHECK |
| STATUS | COMPLETED |
| AUDIT_WORKTREE | D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-03G-PRECHECK |
| AUDIT_BRANCH | audit/repo-arch-03g-precheck |
| AUDIT_BASE | 1bdf8fd8561c6b296358764cd786d1a6dcab7719 |
| DIRTY_CANONICAL_HEAD | f0ac5131828ddddadf5231779ed262319f1f034b |
| DIRTY_CANONICAL_BRANCH | integration/m3-p1 |
| DIRTY_TRACKED_MODIFIED_COUNT | 4 |
| DIRTY_UNTRACKED_STATUS_COUNT | 63（目录级）/ 103（文件级） |
| DIRTY_ACTUAL_ASSET_COUNT | 109 |
| CANONICAL_MANIFEST_ASSET_COUNT | 109 |
| DIRTY_SET_DRIFT | NO |
| TRACKED_MODIFIED_ABSORPTION | PASS |
| DASHBOARD_ABSORPTION | PASS |
| DURABLE_TRACE_STORE_ABSORPTION | PASS |
| OLD_CANONICAL_ONLY_PRODUCT_FILE_COUNT | 1 |
| UNPRESERVED_PRODUCT_ASSET_COUNT | 1 |
| P4_P7_TOTAL_COUNT | 61 |
| P4_P7_PERMANENT_COUNT | 27 |
| P4_P7_TEMP_COUNT | 26 |
| P4_P7_DUPLICATE_COUNT | 8 |
| P4_P7_UNKNOWN_COUNT | 0 |
| UNPRESERVED_PERMANENT_DOC_COUNT | 27 |
| SUPABASE_0009_UNIQUE_SOURCE_STATUS | UNIQUE_UNTRACKED_WORKING_TREE_ONLY |
| SUPABASE_0009_SWITCH_BLOCKER | YES |
| SECRET_ASSETS_STATUS | WAIT_FOR_SECRET_HYGIENE_01 |
| GENERATED_ASSETS_SWITCH_BLOCKER | NO |
| LATEST_EVAL_PRESENT_IN_CONSOLIDATION | YES |
| OLD_CANONICAL_EVAL_SUPERSEDED | YES |
| OLD_CANONICAL_HISTORY_PRESERVABLE | YES |
| RECOMMENDED_SWITCH_STRATEGY | STRATEGY_A |
| CANONICAL_SWITCH_READY_NOW | NO |
| CANONICAL_SWITCH_BLOCKERS | WAIT_SECRET_HYGIENE; P4_P7_PERMANENT_DOCS(27); SUPABASE_0009_UNPRESERVED; 03F_DECISION_PENDING |
| SOURCE_CANONICAL_UNCHANGED | YES |
| CONSOLIDATION_UNCHANGED | NO（并行 1bdf8fd→9c3d7da，docs-only） |
| PRODUCT_CODE_MODIFIED | NO |
| FILES_DELETED | 0 |
| CONTROL_PLANE_DECISIONS_REQUIRED | 1（P4_P7 永久文档 absorption task + 0009 保留方案） |
| AUDIT_COMMIT | 见 git log（本任务提交） |
| READY_FOR_03F_DECISION | YES |
