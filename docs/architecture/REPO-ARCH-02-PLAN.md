# REPO-ARCH-02-PLAN — IELTS Repository Consolidation Execution Plan

> 本任务只规划，不执行：未移动/复制/删除源码、未修改产品/import/package.json、未 git add/commit、未切换 canonical branch、未 reset/clean/stash。
> 冻结决策来自 REPO-ARCH-02-INVENTORY 与 Control Plane，本计划不重新讨论。

## 1. Frozen Decisions（Control Plane 冻结）

| # | DECISION | VALUE |
|---|---|---|
| A | Architecture Model | **MINIMAL_CONSOLIDATION**（非 Full Monorepo） |
| B | Web | 保持 root Next app（app/components/lib 不动）；`ielts-monorepo/apps/web` = STALE_PARTIAL_COPY，不整体迁移 |
| C | Miniapp | 唯一来源 `ielts-monorepo/apps/mini` → 目标 `IELTS-practice/apps/miniapp`；旧 `packages/core` = MINIAPP_COMPATIBILITY_CORE + MINIAPP_UNIQUE_ADAPTERS，不得反向覆盖 canonical 规则 |
| D | Android | 唯一来源 `ielts-android` → 目标 `IELTS-practice/apps/android`；保留 :app/:core 模块结构，只做 source consolidation |
| E | Dashboard | WEB_INTERNAL（app/dashboard + api + components/dashboard + lib/dashboard）；不建 apps/admin；0 字节 stub 保持 INCOMPLETE |
| F | Eval | REPO_LEVEL_QUALITY_SYSTEM（tests/eval + scripts/eval + docs/eval）；不建 apps/eval |
| G | Backend | supabase/ 保持 repo root |
| H | Packages | 本阶段不建 packages/ai、不默认建 packages/core、packages/contracts |

## 2. Critical Checkout Problem & 冻结迁移策略

- 当前 canonical：HEAD `f0ac513`（branch integration/m3-p1），含 4 tracked modifications + 60+ untracked（Dashboard / P4–P7 docs / UI 修改 / env dumps / 报告）。
- `f0ac513` ≠ 最新 verified product checkpoint（`496ae31`）。
- **禁止**在 canonical dirty tree 上施工。
- **冻结迁移策略**：未来所有结构施工在独立 worktree 完成：
  - `D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE`
  - base = `496ae31`
  - dirty canonical 中的保留资产按 manifest **逐项吸收**（copy + verify + commit）到该 worktree 分支
  - 在资产全部安全吸收、验证、提交之前：禁止 reset/clean/stash canonical、禁止直接切换 canonical branch

## 3. Canonical Dirty Asset Absorption Plan

按 REPO-ARCH-02-INVENTORY 分类（执行时逐项填 SHA256）：

| CATEGORY | 资产组 | ACTION | TARGET（consolidation 分支内） | VALIDATION_AFTER_COPY |
|---|---|---|---|---|
| DASHBOARD_PRODUCT | app/dashboard/page.tsx、app/api/dashboard/*（5 routes，3 为 0 字节 stub）、components/dashboard/**（11+css）、lib/dashboard/**、lib/auth/dashboard-access.ts、tests/unit/dashboard-metrics.correctness.test.ts、tests/oracle/dashboard/oracle.ts、generated/dashboard/latest-eval.json | COPY_AS_PRODUCT | 同路径原样 | typecheck、build、dashboard 相关测试；stub 保持 0 字节 |
| WEB_UI_CHANGE | components/assistant/assistant-dock.tsx、components/layout/masthead.tsx、tsconfig.json、.gitignore | COPY_AS_PRODUCT | 同路径 | typecheck、build |
| ARCHITECTURE_DOC | docs/architecture/REPO-ARCH-02-*.md、docs/handoffs/REPO-HYGIENE-*.md、M3-PAUSED-STATE.md | COPY_AS_DOC | 同路径 | 文件存在校验 |
| P4_P7_EVIDENCE | 根级 P4–P7 ~35 份 md/json/csv、reports/dashboard-p2-1/**、scripts/LINGXI_*.zip、docs/ELS_EVALUATION_V1*.json/md、docs/v2-system-audit.md、REAL_EVENT_MAPPING_FINAL.csv | REVIEW_BEFORE_COPY | `docs/evidence/p4-p7/`（根级文档归组） | 计数/哈希核对 |
| LOCAL_ENV_OR_SECRET | canonical 根级 vercel-env-production.txt、vercel-upload.env | DO_NOT_COPY_SECRET | 不进入 Git（移交 SECRET-HYGIENE-01 处置） | 0 tracked secret |
| BUILD_ARTIFACT | tsconfig.tsbuildinfo、out/、playwright-report/、test-results/、.workbuddy/ | IGNORE_GENERATED | 不迁移（gitignore） | git status 无新增 |

## 4. Secret Boundary（禁止读取内容）

| SOURCE_SECRET | TARGET_SECRET_LOCATION | REPO_TEMPLATE | GITIGNORE_REQUIREMENT |
|---|---|---|---|
| ielts-android/keystore.properties | 本机安全位置（迁移时仅复制到本地，不入 repo） | apps/android/keystore.properties.example | `apps/android/keystore.properties` |
| ielts-android/release-key.jks | 本机安全位置 | 无模板（二进制，仅说明文档） | `apps/android/*.jks` |
| IELTS-m2-debug-console/vercel-env-production.txt | Control Plane 处置（EXTERNAL_SECRET_PENDING） | 无 | 已 gitignore |
| canonical 根级 vercel-env-production.txt / vercel-upload.env | SECRET-HYGIENE-01 归档/销毁 | `.env.example` | 已 gitignore（.gitignore 现有规则保留） |

原则：repo 只存模板/example/ignore rule；真实 secret 仅存本机；本任务不读取、不移动任何 secret 内容。

## 5. Migration Source Map

| SOURCE | SOURCE TYPE | TARGET | ACTION | 备注 |
|---|---|---|---|---|
| D:\Codex\IELTS-practice（dirty canonical 保留资产） | canonical | consolidation worktree 同路径 | COPY_AS_PRODUCT / COPY_AS_DOC / REVIEW_BEFORE_COPY | 见 §3 manifest |
| D:\Codex\ielts-monorepo\apps\mini | UNIQUE | apps/miniapp | MIGRATE（§6） | 含 src/configs/tests |
| D:\Codex\ielts-monorepo\packages\core | MINIAPP_COMPAT | apps/miniapp/core（M1） | MIGRATE（§6） | 不命名为 packages/core |
| D:\Codex\ielts-android\app + core + gradle 配置 | UNIQUE | apps/android | MIGRATE（§8 allowlist） | secrets/build 排除 |
| D:\Codex\ielts-monorepo\apps\web | STALE COPY | — | DO_NOT_MIGRATE | 仅 assistant-margin.tsx 走 review gate（§9） |

## 6. Miniapp Dependency Reconciliation（实测）

**MINIAPP_DEPENDENCY_GRAPH（真实）**：
- `apps/mini/package.json` **不含** @ielts/core 依赖。
- 解析方式：`apps/mini/tsconfig.json` paths `"@ielts/core": ["../packages/core/src/index.ts"]` + `packages/core/package.json` exports（`.`、`./mini`、`./server`、`./seed/*`）；构建经 `tsconfig-paths-webpack-plugin` 解析。
- mini/src 实际 import：`@ielts/core`（setStorageAdapter/getProfile/saveProfile/MonogramColor/ImaConfig/ModelConfig/formatCNDate/speaking-llm 相关）、`@ielts/core/mini`（TaroStorageAdapter）。

**core 内容分类**：
- A. MINIAPP_SPECIFIC（必须迁）：auth/wechat-bridge-client.ts、storage/adapter.ts、storage/mini.ts（TaroStorageAdapter）、mini-service.ts、plan.ts、llm-catalog.ts、config.ts、server.ts
- B. DUPLICATED_CANONICAL_RULE（标 LEGACY_COMPAT，不宣布 SSOT）：review/answer-judge、review/initial-schedule、review/review-schedule（18 行，分叉）、learning/types、speaking/types、client/{day,item-id,progress,report-narrative}
- C. IDENTICAL_DUPLICATE：seed/ielts-learning-items.json、seed/speaking-questions.json（与 data/seed hash 一致）
- D. UNKNOWN：无（已全部分类）

**MINIAPP_CORE_TARGET_DECISION = OPTION M1**：`apps/miniapp/`（src + configs）+ `apps/miniapp/core/`（compatibility core 整体迁入）。理由：
- 单一消费者（仅 mini）→ 不需要 workspace package（M2 的 packages/miniapp-core 徒增 workspace 机制）；
- 源码级 paths 引用改为 `"@ielts/core": ["./core/src/index.ts"]`（+ `./core/src/storage/mini.ts` 等）→ mini/src 内 import **零改动**，import churn 最小；
- 命名 `miniapp/core` 而非 `packages/core`，避免"全局 Core SSOT"误解。
- 迁移第一阶段**禁止**重写 miniapp 业务规则；DUPLICATED_CANONICAL_RULE 类仅标注 LEGACY_COMPAT，统一留待 CROSS-CLIENT-CONTRACT-RECONCILIATION。

## 7. Canonical Rule Authority（冻结）

- `canonical lib` = CURRENT BUSINESS RULE SSOT
- `Miniapp legacy rule`（apps/miniapp/core） = CLIENT-COMPAT IMPLEMENTATION
- `Android core` = ANDROID CLIENT IMPLEMENTATION
- 第一阶段不要求三者统一；后续单独 CROSS-CLIENT-CONTRACT-RECONCILIATION 处理 review schedule / answer judge / state model / API models / learning types。

## 8. Android Migration Plan（源 allowlist 按真实目录）

**MIGRATE**：
- `settings.gradle.kts`、`build.gradle.kts`、`gradle.properties`、`gradle/`（wrapper 配置目录）
- `gradlew`、`gradlew.bat`
- `app/`（排除 app/build）、`core/`（排除 core/build）
  - app：src/main（kotlin + res + AndroidManifest）、build.gradle.kts
  - core：src/main（kotlin + resources）、build.gradle.kts

**DO_NOT_MIGRATE**：
- `.gradle/`、`.jdk/`、`.jdk.zip`、`.jdk_home`（本地环境）
- `app/build/`、`core/build/`（构建产物）
- `local.properties`（机器相关 SDK 路径）
- `keystore.properties`、`release-key.jks`（SECRET）
- `andrun.log`、`andrun2.log`、`build.log`、`repro_out.txt`（日志）
- `capture_crash.bat`、`install-apk.bat`、`rebuild-install.bat`、`repro_learn.py`（本地调试脚本 → REVIEW_BEFORE_COPY，可归 docs/evidence 或丢弃）
- `.verify/`（本地验证目录）

**验收**：迁移后 `apps/android` 可独立 Gradle sync + compile/build；不要求本阶段接 Supabase；不合并 Kotlin core 与 Web lib；不统一 TS/Kotlin model；不改网络架构。

## 9. Stale Monorepo Web Review Gate

- `apps/web` 整体 DO_NOT_MIGRATE。
- 唯一 canonical 缺失文件 `components/home/assistant-margin.tsx`：**ARCH-03F 前必须完成 reference-value comparison**（与 canonical components/home + assistant 渲染对比）→ 分类 `REBUILDABLE_REFERENCE`（预期，为 ChatSection 简单包装）或 `UNIQUE_FEATURE_TO_MIGRATE`；不得在源目录退休时静默丢弃。
- 该文件读取与判定归属 ARCH-03F 前的 review gate，本计划不执行。

## 10. Dashboard Absorption Plan（独立 commit，不与 miniapp/android 混）

1. manifest 登记全部 dashboard 资产（§3 DASHBOARD_PRODUCT 组）
2. copy 进 496ae31 consolidation worktree
3. 检查 route / auth（requireDashboardAccess）/ Supabase boundary
4. 检查 3 个 0 字节 stub（lifecycle/[stageId]、modules/[moduleId]、traces/[traceId]）→ 保持 INCOMPLETE，禁止虚构实现
5. typecheck
6. build
7. dashboard 相关测试（dashboard-metrics.correctness 等）
8. commit：`feat(dashboard): absorb existing dashboard assets`

## 11. Docs Absorption（独立 commit group）

- P4–P7 / handoff / architecture docs 与产品源码**分开 commit**：
  1. `chore(repo): establish consolidation manifest`
  2. `feat(dashboard): absorb existing dashboard assets`
  3. `chore(docs): absorb architecture and audit docs`
  4. `feat(miniapp): migrate miniapp client`
  5. `feat(miniapp): preserve compatibility core`
  6. `feat(android): migrate android client source`
  7. `chore(repo): finalize multi-client structure`
- 禁止单个 "migrate everything" 超级 commit。

## 12. Seed SSOT

- 冻结长期 winner：`canonical data/seed`（hash 与 core seed 一致）。
- 迁移 miniapp 后：不维护第二份可编辑 seed SSOT；若 miniapp build 需要本地打包副本 → 设计为 generated/copied build artifact（标注出处，禁止描述为第二 SSOT）。
- **SEED_MIGRATION_STRATEGY**：core 的 seed/*.json 随 miniapp/core 迁入并标注 `SOURCE: canonical data/seed (identical hash)`；后续 CROSS-CLIENT 阶段改为单一数据源。

## 13. Target Structure（第一阶段）

```
IELTS-practice/
├─ app/  components/  lib/        # root Next app（不动）
├─ apps/
│  ├─ miniapp/                    # ← apps/mini + miniapp/core（M1）
│  └─ android/                    # ← ielts-android（:app + :core + gradle）
├─ data/  supabase/  tests/  scripts/  docs/
└─ 既有 root configs
```
不建立：apps/web、apps/admin、apps/eval、packages/ai、packages/core（全局语义）。

## 14. Migration Execution Phases（独立施工 Gate）

- **ARCH-03A CREATE_CONSOLIDATION_BASE**：基于 496ae31 建 worktree `D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE` + 生成 CANONICAL_ASSET_MANIFEST（逐项 SHA256）。
- **ARCH-03B ABSORB_CANONICAL_UNCOMMITTED_ASSETS**：吸收 Dashboard / Web UI / 必要 docs（§3）；Secrets 不入 Git；验证 typecheck/build/相关测试。
- **ARCH-03C MIGRATE_MINIAPP**：apps/mini + compatibility core → apps/miniapp（M1）；验证 install/typecheck/Taro build/依赖解析；不改业务规则。
- **ARCH-03D MIGRATE_ANDROID**：按 §8 allowlist 迁移；验证 Gradle 结构 + compile/build。
- **ARCH-03E REPO_INTEGRATION_ACCEPTANCE**：Web/Minapp/Android/Dashboard/Eval/Supabase paths、secret exclusions、Git status、build boundaries。
- **ARCH-03F SOURCE_RETIREMENT**：仅 ARCH-03E PASS 后评估删除 ielts-monorepo / ielts-android；删除前再次 audit unique asset = 0 + assistant-margin review gate。
- **ARCH-03G CANONICAL_SWITCH**：全部保留资产已吸收并 commit 后，设计 canonical 最终 checkout 到新分支；之前禁止。

## 15. Build / Acceptance Matrix

| TARGET | COMMAND | EXPECTED |
|---|---|---|
| WEB | `npm ci && npx tsc --noEmit && npm run build`（consolidation worktree） | PASS；与 496ae31 产品行为一致 |
| DASHBOARD | typecheck + build + `npx vitest run tests/unit/dashboard-metrics.correctness.test.ts`（+现有相关） | PASS；3 个 stub 仍 0 字节（INCOMPLETE 记录） |
| MINIAPP | `npm ci` + typecheck + Taro build（`npm run build:weapp` 或等价）+ package dependency resolution | PASS；业务规则未改 |
| ANDROID | Gradle sync + `./gradlew assembleDebug`（apps/android） | PASS；模块结构保留 |
| EVAL | 路径/历史资产完整（tests/eval、scripts/eval、docs/eval 未动） | 完整；M3 paused 不跑 full 39-case（除非迁移触碰 Web 行为） |
| SUPABASE | supabase/ migrations 0001–0009 路径保留 | 未动；0009 仍受 ENV-SUPABASE-01 约束 |
| SECRETS | repo 内 grep 敏感文件名 / git status | 0 tracked secret |

## 16. Product Behavior Rule

- 若迁移仅移动 miniapp/android、吸收既有 Dashboard，且未改变 app/components/lib 已验证行为 → **无需重启 M3**。
- 若 consolidation 需要修改 canonical learning rules / API behavior / speaking / review / report / retrieval → **STOP**，报告 `PRODUCT_BEHAVIOR_CHANGE_REQUIRED`，由 Control Plane 决定是否恢复 Eval。

## 17. Source Retirement Gates

- **ielts-monorepo** 可 DELETE_AFTER_MIGRATION 仅当：miniapp 已迁移、compatibility core 已迁移、unique core adapters 已迁移、assistant-margin review 完成、无唯一源码残留、canonical 副本构建验证通过。
- **ielts-android** 可 DELETE_AFTER_MIGRATION 仅当：source 已迁移、canonical 内 Gradle build 成功、secret 处置完成、无唯一源码残留。
- 本 PLAN 不删除任何源目录。

## 18. Canonical Switch Gate & Asset Manifest

- **CANONICAL_ASSET_MANIFEST**（ARCH-03A 生成，字段）：SOURCE_PATH / SOURCE_SHA256 / CATEGORY / TARGET_PATH / TARGET_SHA256 / MIGRATED / VERIFIED。
- **Switch 前置条件**：全部保留资产 MIGRATED=true 且 hash/semantic verification 完成；之后才允许设计 canonical 最终 checkout（ARCH-03G）。原 dirty tree 在此之前不可退休。

## 19. Rollback Strategy

- 施工全部在独立 worktree/branch（基于 496ae31）→ canonical 原树零风险。
- 每个 Phase 独立 commit → 可单 Phase revert/调整。
- Miniapp/Android 迁移为纯新增目录（apps/*），不影响 root Next app → 若出现集成问题，删除对应 apps/* 目录即可回到 496ae31 等价状态（Web 行为未变）。
- Dashboard 吸收前 manifest 记录 SHA256 → 可精确比对/回退。
- 原 dirty canonical 保持不动直至 ARCH-03G → 天然回滚锚点。

## 20. SECRET-HYGIENE-01（未来单独任务）

- 对象：canonical vercel env dump（根级 2 个）、debug-console vercel env、Android signing secrets。
- 目标：识别仍需要/已废弃；**绝不把 secret 内容传入 LLM output/docs**；REPO-ARCH 不负责读取 secret。

## 21. Handoff 摘要

- RECOMMENDED_MODEL = MINIMAL_CONSOLIDATION；CONSOLIDATION_BASE = 496ae31
- MINIAPP_CORE_TARGET_DECISION = OPTION M1（apps/miniapp/core，app-local，非 packages/core）
- WEB_MOVE_REQUIRED = NO；MONOREPO_WEB_ACTION = DO_NOT_MIGRATE + assistant-margin review gate
- SEED_SSOT = canonical data/seed；SECRET_POLICY = 模板入 repo、真实 secret 仅本机
- 7 个 Phase（ARCH-03A..G）；PRODUCT_BEHAVIOR_CHANGE_EXPECTED = NO
- 本轮：0 移动 / 0 删除 / 0 产品代码修改
