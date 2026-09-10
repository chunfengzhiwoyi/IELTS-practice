# REPO-ARCH-02-INVENTORY — Canonical Repository Architecture Inventory

> 本阶段只读盘点：不移动/删除/重命名任何文件，不 git add/commit，不创建 monorepo，不修改 import/build/package.json/产品逻辑。
> 结论基于目录结构、文件清单、SHA256 对比与关键文件内容，不依据修改日期。

## 0. Current Frozen State

- Canonical repo: `D:\Codex\IELTS-practice`
- 当前 checkout HEAD: `f0ac513`（branch `integration/m3-p1`）— 注意这是 **Eval System 参考树**，不是最新产品基线
- LAST VERIFIED PRODUCT CHECKPOINT: `496ae31`（integrate M3 S1 fixes 019 and 030）
- LAST VERIFIED EVAL: m3-20260910-125036（35 PASS / 0 FAIL / 4 UNVERIFIED / 0 MANUAL）
- M3: PAUSED
- **checkout 事实**：f0ac513 相对 496ae31 差 109 文件（+38630/-3892）——删除了 badcase 单元测试（026/030/033/034 等）、引入 tests/eval 体系。当前工作树 ≠ 产品真相。

## 1. Current Physical Layout（canonical，excl. node_modules/.next/.git）

```
IELTS-practice/
  app/            # Next.js App Router（42 tracked files）
    (auth)/login, (auth)/reset-password
    account, auth/callback, dashboard(未提交), debug, goals, learn, report, review, speaking
    api/  # 27 路由：learn/card|submit, review/session|submit, speaking/analyze|session|sessions|transcribe,
          # report, agent/message, auth/wechat-*, secrets, ima/list, ability/observations,
          # health/llm, learning/stats, debug/traces*, dashboard*(未提交, 3 个 stub 为 0 字节)
  components/     # 51 tracked：account/agent/assistant/auth/chat/dashboard(未提交)/debug/goals/home/layout/learn/llm/report/review/speaking
  lib/            # 107 tracked，17 模块：ability/agent/auth/client/crypto/dashboard(未提交)/db/debug/evaluation/goal/knowledge/learning/llm/observability/report/review/speaking
  data/           # knowledge/knowledge-objects-v1.json + seed/ielts-learning-items.json + seed/speaking-questions.json
  supabase/       # cloud-setup.sql, seed.sql, migrations/0001..0009（0009_p6_instrumentation = 035 gated）
  tests/          # e2e/eval/integration/oracle/stubs/unit（75 tracked）
  scripts/        # 9 tracked（含 eval/generate-baseline.ts）
  docs/           # eval/handoffs/tools/v3（43 tracked）
  generated/      # 未提交（dashboard/latest-eval.json 等）
  reports/        # 未提交（dashboard-p2-1/ 视觉对账 + png）
  public/, out/, playwright-report/, test-results/, .workbuddy/, agent building/
  根级：package.json(english-learning-agent 0.1.0), tsconfig.json, next.config.ts, middleware.ts,
       eslint/postcss/tailwind/vitest/playwright config, .env.example, apply-migrations.ps1,
       P4–P7 审计文档(~35 md/json/csv), vercel-env-production.txt(未跟踪,gitignore), vercel-upload.env(未跟踪,gitignore)
```

## 2. Uncommitted Asset Inventory（canonical 在途资产）

| PATH_GROUP | TRACKED_STATE | PRODUCT_AREA | LIKELY_PURPOSE | UNIQUE_ASSET | MIGRATION_IMPORTANCE |
|---|---|---|---|---|---|
| app/dashboard/page.tsx + app/api/dashboard/*(5 routes, 3 为 0 字节 stub) | untracked | Dashboard | 管理前端入口 + API | YES | 吸收前必须冻结 |
| components/dashboard/**（11 文件 + dashboard.css） | untracked | Dashboard UI | 管理页面组件（Header/Icon/LearningImpact/Lifecycle/Metric/OverlayHost/ProductDiagnosis/ProductHealth/SystemKnowledge） | YES | 高 |
| lib/dashboard/**（types/aggregate/real-repository/api-repository/repository/eval-reader/layer-labels/mock/*） | untracked | Dashboard 数据层 | Supabase 聚合 + 离线 eval 读取 + mock（测试/E2E） | YES | 高 |
| lib/auth/dashboard-access.ts | untracked | 授权 | requireUser + DASHBOARD_ALLOWED_EMAILS allowlist（fail closed） | YES | 高 |
| generated/dashboard/latest-eval.json | untracked | Eval 可视化输入 | Dashboard 读取的离线 eval 快照 | YES | 中 |
| P4/P5/P6/P7 根级审计文档（~35 md/json/csv）+ reports/ + scripts/LINGXI_*.zip | untracked | QA/审计 | Dashboard 建设期的验收/审计证据链 | YES | 中（归档/吸收） |
| tests/unit/dashboard-metrics.correctness.test.ts + tests/oracle/dashboard/oracle.ts | untracked | 测试 | Dashboard 指标正确性测试与 oracle | YES | 高 |
| components/assistant/assistant-dock.tsx (+5/-2) | tracked modified | UI | 助手浮窗微调 | 在途 | 保留 |
| components/layout/masthead.tsx (+5) | tracked modified | UI | 顶栏微调 | 在途 | 保留 |
| tsconfig.json (+1/-1) | tracked modified | 构建 | 小改 | 在途 | 保留 |
| .gitignore (+16) | tracked modified | 卫生 | vercel env dump / .workbuddy / scratch 忽略规则 | 在途 | 保留 |
| vercel-env-production.txt / vercel-upload.env（根级） | untracked+ignored | 敏感 | P7 期间的 vercel 环境转储 | 敏感 | 不得入 Git |
| docs/ELS_EVALUATION_V1*.json/md, docs/v2-system-audit.md, REAL_EVENT_MAPPING_FINAL.csv | untracked | Eval/审计 | 早期 eval 版本与映射表 | YES | 归档 |

**Dashboard 判定**：`app/dashboard/page.tsx` = 528 字节 "use client" 路由页，仅渲染 `DashboardPage` + `ApiDashboardRepository`（fetch /api/dashboard）；`app/api/dashboard/route.ts` 走 `requireDashboardAccess`（复用 `lib/auth/session` 的 requireUser + 服务端 email allowlist）；数据来自 `RealDashboardRepository`（Supabase + 离线 eval run）。**它是 Web app 内的管理路由（Next shell / 同一 auth / 同一 Supabase / 同一 Vercel 部署），不是独立应用。**

## 3. Web Source of Truth

| 维度 | IELTS-practice（canonical） | ielts-monorepo/apps/web |
|---|---|---|
| package | english-learning-agent 0.1.0 | web 0.1.0 |
| scripts/deps | 12 scripts / 9 deps / 15 devDeps | 完全相同集合 |
| app/ | 42 文件（27 API routes, 含 dashboard/debug） | 21 文件 |
| components/ | 51 | 34 |
| lib/ | 107（17 模块） | 65 |
| supabase/ | 10（migrations 0001-0009） | 3 |
| tests/ | 75（含 tests/eval） | 12 |
| 019 特征 evidence-sanitizer/grounding | ✅ | ❌ 缺失 |
| M2 特征 lib/observability/trace-store.ts | ✅ | ❌ 缺失 |
| 030 特征 compare-section hasActivity | ✅ | ✅ 存在 |
| Dashboard | ✅（未提交） | ❌ 缺失 |
| Eval (tests/eval) | ✅ | ❌ 缺失 |

- apps/web 相对 canonical 唯一文件：仅 `components/home/assistant-margin.tsx`（ChatSection 的简单布局包装，可低成本重建）。
- **WEB_SOURCE_OF_TRUTH = D:\Codex\IELTS-practice**（功能完整度、产品历史、Eval/M2/Dashboard 全部在 canonical）。
- **MONOREPO_WEB_CLASSIFICATION = PARTIAL_COPY（陈旧快照）**；MONOREPO_WEB_RECOMMENDATION = **DO_NOT_MIGRATE**（无有效唯一资产需迁入；assistant-margin.tsx 可 REVIEW 后按需重建或丢弃）。

## 4. Miniapp Inventory（ielts-monorepo/apps/mini — 唯一资产）

- 技术栈：Taro + React（@tarojs/* 全家桶），`project.config.json` 微信小程序 + H5。
- src/：`app.tsx/app.config.ts` + 13 pages：`index, learn, review, speaking, report, goal, identity, profile, profile-edit, model-settings, privacy, ima-config, wechat-scan-login`。
- lib/：`api.ts`（API bridge）、`auth.ts`、`ima.ts`、`llm-client.ts`、`speaking-llm.ts`、`privacy.ts`、`fonts.ts`。
- components/：IdentityCard、NavBar、PageBody、PrivacyPopup；hooks/：useNavHeight。
- 功能覆盖：新词学习 learn、复习 review、口语 speaking、报告 report、目标 goal、登录 wechat-scan-login、模型设置 model-settings（BYOK）、IMA 配置。
- 缺失（如实记录）：独立 assistant 聊天页、无独立 sync 服务（services/ 目录为空）、无音频转写、无知识库 retrieval、无 trace 可观测。
- **UNIQUE_MINIAPP_ASSETS**：整个 `apps/mini/src`（canonical 无任何小程序代码）。
- 未来目标：`IELTS-practice/apps/miniapp`（Phase 2 迁移）。

## 5. packages/core Audit（ielts-monorepo/packages/core — 小程序共享包）

- `@ielts/core 0.1.0, type=module`，index.ts 明确"客户端入口（无 server-only，可被小程序 / H5 安全 import）"。
- 内容：review/{answer-judge, initial-schedule, review-schedule}、learning/types、speaking/types、client/{day, item-id, progress, report-narrative}、storage/{adapter, mini}、seed/*.json、config、llm-catalog、mini-service、plan、server、auth/wechat-bridge-client。
- 与 canonical lib 对比（同文件 hash 判定）：
  - review-schedule.ts：core=18 行 vs canonical=27 行，**hash 不同（已分叉）**；answer-judge、learning/types 同样 hash 不同。
  - seed：ielts-learning-items.json / speaking-questions.json **hash 相同（当前同源）**，与 canonical data/seed 重复。
  - canonical lib 无 storage/、无 seed/、无 wechat-bridge —— core 的 storage adapter、wechat-bridge-client、mini-service、plan、server、llm-catalog 是 **miniapp 独有补充**。
- **判定**：core 是早期为小程序抽出的 shared package，**不是当前 Learning Core SSOT**（canonical lib 才是，且经历了 M1/M2 的 empty-answer 边界、trace contract、knowledge layer、019/030 演进）。
- 分类：**DUPLICATED（已分叉） + COMPLEMENTARY（小程序独有抽象）**。CANONICAL_LIB_IS_NEWER（产品规则以 canonical 为准）。

## 6. Android Inventory（ielts-android — 唯一资产，非 git）

- rootProject `IELTSStudy`，modules `:app` + `:core`；Compose Material3（compose-bom 2024.02.02）+ navigation + DataStore + kotlinx-serialization；**无网络层依赖（无 Retrofit/OkHttp）、无 Supabase SDK**。
- app（UI 层，20 个 .kt）：screens = Today/Learn/Review/Speaking/Report/Goal/Identity/Profile/ProfileEdit/Login/Privacy/ApiConfig + nav/DataStore/ViewModel/theme。
- core：client/{IdAndDate, Progress, ReportNarrative}、llm/{ApiConfig, LlmCatalog, LlmClient, NarrativeLlm}、model/StudyModels、schedule/Schedule、service/{SeedData, StudyService}、storage/StorageAdapter。
- 功能覆盖：学习/复习/口语/报告/目标/身份/资料/登录/隐私/API 配置；**BYOK 直连 LLM（ApiConfigScreen），本地优先（DataStore），无服务端同步、无转写、无知识库、无 wechat、无可观测 trace**。
- 与 Web/miniapp 对比：模型（StudyModels vs web types vs mini types）、排期（Schedule vs review-schedule）为**三套平行分叉实现**；SeedData.kt 与 data/seed 为另一份 seed 变体。
- **ANDROID_UNIQUE_SOURCE_DIRS**：app/src + core/src（全部）；ANDROID_SHARED_CORE_DIRS：core 的 schedule/model/storage 概念与 web/mini 重叠但实现分叉；ANDROID_DUPLICATED_CONTRACTS：模型/排期/seed；ANDROID_MISSING_FEATURES：真实登录、转写、知识库、同步、可观测。
- 未来源码目标：`IELTS-practice/apps/android`（Phase 3），**签名密钥 keystore.properties / release-key.jks 绝不入 Git**。

## 7. Dashboard / Admin Boundary Decision

- **DASHBOARD_CURRENT_IMPLEMENTATION**：Web app 内部 admin 路由（app/dashboard + app/api/dashboard + components/dashboard + lib/dashboard；复用 Web 的 Next shell、session auth、Supabase、Vercel 部署；额外一层 email allowlist 授权，fail closed）。
- **ADMIN_ARCHITECTURE_DECISION = WEB_INTERNAL**（不拆独立 apps/admin）。
- DECISION_EVIDENCE：路由页仅 528 字节、全部逻辑在 components/lib 且与 Web 共用 `@/lib/...` 别名体系；auth 直接复用 `lib/auth/session`；无独立 routing shell、无独立 deployment 需求、无独立依赖集；数据经现有 Next API routes。拆分 apps/admin 会复制部署/认证/构建而无产品收益。

## 8. Shared Package Candidates（只识别，不抽取）

| Candidate | WHAT WOULD LIVE HERE | CURRENT SOURCE FILES | CONSUMERS | EXTRACTION_ACTUALLY_NEEDED |
|---|---|---|---|---|
| packages/core | 学习/复习规则 + 三端共享类型 | lib/review, lib/learning/types, lib/speaking/types, lib/client/{day,progress,report-narrative}（canonical）+ mini core 分叉 | Web（现在唯一）、miniapp（未来）、android（未来） | **是，但先 reconciliation**：三套已分叉，直接抽取会把冲突固化 |
| packages/contracts | API 契约/模型类型 | lib 各 types + android model.StudyModels + mini types | 三端 | **候选**：需要先把 android/mini 接入 canonical 后再抽 |
| packages/ai | LLM 编排/AI 实现 | lib/llm, lib/agent, lib/speaking, lib/evaluation | 仅 Web | **否**：只有 Web 使用 AI 实现，抽取无消费方收益，禁止为教科书形式拆包 |

## 9. Eval Placement

- 现状：`tests/eval`（cases/runner/phase0/vitest.config）、`scripts/eval/generate-baseline.ts`、`docs/eval`（spec/runs/manual-review/special-tool/bad-case-registry + baselines）——成熟的 repo-level quality system。
- Dashboard 中的 Eval 可视化 = 读取 `generated/dashboard/latest-eval.json` + `lib/dashboard/eval-reader.ts`，与 Eval Runner 本身分离。
- **EVAL_ARCHITECTURE_DECISION = 继续作为 repo-level quality system（A）**；不建 apps/eval（无独立运行 UI/服务；Dashboard 可视化不构成 application 条件）。

## 10. Backend / Supabase Placement

- `supabase/`（cloud-setup + seed + migrations 0001-0009）当前位于 repo-root，服务 Web API routes（lib/db + app/api/*）。
- 未来 miniapp/android/admin 均需要同一后端 → 不应搬到 apps/web 内部。
- **BACKEND_ARCHITECTURE_DECISION = 保持 repo-root `supabase/`**。

## 11. Secret Boundary

以下**永远不得进入未来 canonical Git**：
- `ielts-android\keystore.properties`、`ielts-android\release-key.jks`（Android 签名，本地仅存）
- `IELTS-m2-debug-console\vercel-env-production.txt`（EXTERNAL_SECRET_PENDING，处置由 Control Plane 决定）
- canonical 根级 `vercel-env-production.txt`、`vercel-upload.env`（P7 在途转储，已被 .gitignore 覆盖，须随 Dashboard 吸收一并归档/销毁）

**SECRET_MIGRATION_POLICY**：repo 只含 example/config template + .gitignore 规则（`.env.example`、`*.jks.example`、`*.properties.example`）；真实 secret 只存在于本地机器/托管 secret 服务；迁移 android/miniapp 时同步生成模板并确保 .gitignore 拦截。

## 12. Duplicate Assets 汇总

| ASSET | SOURCE_A | SOURCE_B | STATUS |
|---|---|---|---|
| Web 代码 | canonical app/components/lib | monorepo apps/web | 陈旧 partial copy（1 个可重建唯一文件） |
| 学习/复习规则 | canonical lib/review（27 行 review-schedule） | core review-schedule（18 行） | 分叉 |
| 领域类型 | canonical lib/learning/types, speaking/types | core learning/types, speaking/types | 分叉 |
| client helpers | canonical lib/client/{day,progress,report-narrative} | core client/{day,progress,report-narrative} | 分叉 |
| Seed 数据 | canonical data/seed/*.json | core seed/*.json | **当前 hash 相同（同源重复）** |
| Seed 数据 | canonical data/seed | android core/service/SeedData.kt | 分叉（Kotlin 变体） |
| 排期/模型契约 | canonical lib/review + types | android core model/schedule | 平行分叉 |

## 13. Architecture Conflicts（需决策，不擅自解决）

| CONFLICT_ID | SOURCE_A | SOURCE_B | DIFFERENCE | RISK | RECOMMENDED_WINNER | WHY | NEEDS_HUMAN_DECISION |
|---|---|---|---|---|---|---|---|
| AC-01 | canonical lib/review（27 行，含 empty-answer 边界） | core review-schedule（18 行，mini 用） | 规则分叉 | mini 与 web 学习行为不一致 | canonical（以已验证产品链为准） | canonical 经历过 M1/M2 验证与 019/030 等修复 | YES（mini 未来行为以哪套为准需确认） |
| AC-02 | canonical API 类型 | android model.StudyModels | 平行模型定义 | 三端契约漂移 | 未来 packages/contracts（由 canonical 抽取） | canonical 是唯一活跃产品 | YES（android 接入时序） |
| AC-03 | Dashboard 在途资产（60 untracked + 4 modified） | 未来 apps/admin 或正式吸收 | 未提交、含 3 个 0 字节 stub | 资产丢失风险 | 先冻结/吸收进 canonical（Web 内部） | 资产唯一且已通过 P4–P7 审计 | YES（是否正式吸收/是否补全 stub） |
| AC-04 | canonical checkout f0ac513（Eval 树） | 产品基线 496ae31 | HEAD 非产品真相 | 误把 Eval 树当产品 | 恢复产品基线（checkout/分支策略） | 产品验证链在 496ae31 | YES（M3 PAUSED 期间的 checkout 策略） |
| AC-05 | data/seed 与 core seed | 双份同 hash | 单源未定 | 未来漂移 | canonical data/seed | 已存在且被测试引用 | NO（机械单源化，迁移时执行） |

## 14. Proposed Final Logical Structure（推荐：Model A — Minimal Consolidation）

```
IELTS-practice/
  app/            # 保持当前 root Next app（不移动）
  components/     # 保持
  lib/            # 保持（Learning Core SSOT）
  apps/
    miniapp/      # ← 迁移自 ielts-monorepo/apps/mini（唯一资产）
    android/      # ← 迁移自 ielts-android（唯一资产，secrets 外置）
  data/           # 保持（seed/knowledge 单源）
  supabase/       # 保持 repo-root
  tests/          # 保持（unit + eval + e2e + oracle + stubs）
  scripts/        # 保持（含 eval/generate-baseline）
  docs/           # 保持（eval/handoffs/tools/v3/architecture）
```
- **不建**：apps/admin（Dashboard 保持 Web 内部）、packages/*（本轮；contracts 列为后续候选）、apps/eval、apps/web 移动。
- 理由：移动 Web 到 apps/web 产生 import churn + build risk + Eval/Dashboard 耦合迁移，收益低；三端 shared code 现实是"三套分叉实现"，立即 monorepo 化会把冲突固化。最小整合（加两个 app 目录）满足产品边界。

## 15. Migration Classification

| ASSET | CLASSIFICATION |
|---|---|
| canonical Web（app/components/lib） | KEEP_IN_PLACE |
| Dashboard（app/dashboard + api + components + lib + auth + generated + tests + reports + P4–P7 docs） | KEEP_IN_PLACE（先冻结吸收；stub 待补全决策） |
| monorepo apps/web | DO_NOT_MIGRATE_DUPLICATE（唯一文件 assistant-margin.tsx → UNKNOWN_REVIEW，可重建） |
| monorepo apps/mini | MIGRATE_UNIQUE_ASSET → apps/miniapp |
| monorepo packages/core | EXTRACT_SHARED_LATER（storage/wechat-bridge/mini-service 随 miniapp 迁入；规则类与 canonical reconciliation） |
| android app/ + core/ | MIGRATE_UNIQUE_ASSET → apps/android（secrets 外置） |
| android keystore.properties / release-key.jks | SECRET_EXTERNALIZE（永不入 Git） |
| Supabase（supabase/ 含 0009 gated） | KEEP_IN_PLACE（0009 仍受 ENV-SUPABASE-01 BLOCKED_EXTERNAL 约束） |
| Eval（tests/eval + scripts/eval + docs/eval） | KEEP_IN_PLACE（repo-level quality system） |
| Data/Knowledge（data/knowledge + data/seed） | KEEP_IN_PLACE（seed 单源化：吸收 core seed 同 hash 副本） |
| Docs（docs/*） | KEEP_IN_PLACE |
| 敏感文件（vercel-* dumps ×3 处） | SECRET_EXTERNALIZE / 归档销毁（Control Plane） |
| canonical 4 个 tracked 修改（UI/tsconfig/.gitignore） | KEEP_IN_PLACE（在途，保留） |

## 16. Migration Order（只设计，不执行）

- **Phase 1**：建立 canonical architecture manifest（本文档 + REPO-ARCH-02-PLAN）
- **Phase 2**：迁移唯一 miniapp（apps/mini → apps/miniapp），同步其独有 lib（storage/wechat-bridge/llm-client 等）
- **Phase 3**：迁移 Android source（app/core → apps/android），externalize secrets（模板 + .gitignore）
- **Phase 4**：吸收/冻结 Dashboard（决定 stub 补全或裁剪、P4–P7 文档归档、env dumps 销毁）
- **Phase 5**：处理 shared core/contracts（AC-01/AC-02 reconciliation；候选 packages/contracts，视三端接入后真实共享量）
- **Phase 6**：评估是否移动 Web 到 apps/web —— **预期不做**（收益低、风险高），保持 root Next app

## 17. Product Architecture Story（AI PM 面试可用）

**为什么有三端**：一个学习产品的三个触达层——Web 是完整能力承载端（学习/复习/口语/报告 + AI 助手 + 内部 Dashboard + Eval 基建），微信小程序是轻量高频触达（13 个页面覆盖学习/复习/口语/报告/目标/登录，BYOK 模型设置），Android 是本地优先的原生端（Compose UI + DataStore + 直连 LLM 配置）。三端共享同一产品心智（Learn → Review → Speaking → Report 的闭环 + 目标/身份/隐私）。

**哪些能力共享**：业务规则（排期、答题判定、进度、报告叙事）、领域类型、seed 数据。但目前是**三套分叉实现**（web lib / mini core / android core），这正是架构债——先固化 canonical 为规则 SSOT，再让 mini/android 适配，而不是反过来。

**AI 在哪里**：集中在 Web 的 lib/llm（编排、结构化输出、provider 回退）+ lib/speaking（转写、分析、质量门、幻觉遏制）+ lib/agent（助手）+ lib/knowledge（检索）；小程序与 Android 通过 BYOK 直连或走 Web API bridge。AI 不是独立包，而是 Web 产品内的能力层。

**数据在哪里**：Supabase（用户状态、学习记录、review、secrets、wechat 登录）+ 本地（Android DataStore、小程序本地存储）+ data/（seed/知识库静态数据）。

**Eval 为什么是内部质量系统**：它是产品验证的神经系统（frozen gold cases + runner + baseline + registry），服务"每次改动不破坏已验收行为"，不是用户可见应用；Dashboard 只做可视化呈现 eval 结果。

**Dashboard 为什么这样放**：它是 Web 内部的运营/诊断管理页（复用同一认证与部署），数据来自 Supabase + 离线 eval 快照；独立成 app 只会复制部署与认证而无产品收益。

## 18. Handoff 摘要字段

- WEB_SOURCE_OF_TRUTH = IELTS-practice；MONOREPO_WEB_CLASSIFICATION = PARTIAL_COPY（DO_NOT_MIGRATE）
- MINIAPP_SOURCE = ielts-monorepo/apps/mini（UNIQUE → apps/miniapp）
- ANDROID_SOURCE = ielts-android（UNIQUE → apps/android，secrets 外置）
- MONOREPO_CORE_CLASSIFICATION = DUPLICATED(DIVERGED)+COMPLEMENTARY；CANONICAL_LIB = CURRENT_CORE_SSOT
- DASHBOARD = WEB_INTERNAL；EVAL = REPO_LEVEL；BACKEND = REPO_ROOT supabase/
- RECOMMENDED_MODEL = MINIMAL_CONSOLIDATION
- 冲突 5 项（AC-01..AC-05），其中 4 项 NEEDS_HUMAN_DECISION
- 本阶段未移动/删除/修改任何产品文件；仅创建 docs/architecture/ 与本文档（未 git add / commit）
