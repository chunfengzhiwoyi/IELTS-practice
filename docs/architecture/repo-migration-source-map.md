# REPO Migration Source Map（ARCH-03A 只读快照）

> 本文件只记录外部迁移来源与目标映射，不复制任何源码。
> 生成于 REPO-ARCH-03A（2026-09-10）。canonical 与各外部源目录本轮均为只读。

## 1. 外部迁移来源

| SOURCE | SOURCE TYPE | FUTURE TARGET | ACTION | 备注 |
|---|---|---|---|---|
| `D:\Codex\ielts-monorepo\apps\mini` | UNIQUE（Taro+React 小程序，13 pages） | `IELTS-practice/apps/miniapp` | MIGRATE（ARCH-03C） | 含 src/、configs、tsconfig、package.json |
| `D:\Codex\ielts-monorepo\packages\core` | MINIAPP_COMPATIBILITY_CORE（`@ielts/core`，源码级 tsconfig paths 引用 + exports: `.`/`./mini`/`./server`/`./seed/*`） | `IELTS-practice/apps/miniapp/core`（app-local，OPTION M1） | MIGRATE（ARCH-03C） | **不得命名为 packages/core**；不得描述为全局 SSOT |
| `D:\Codex\ielts-android` | UNIQUE（IELTSStudy，`:app` + `:core`，Compose + DataStore + BYOK） | `IELTS-practice/apps/android` | MIGRATE（ARCH-03D，按 allowlist） | secrets/build/local 排除 |
| `D:\Codex\ielts-monorepo\apps\web` | STALE_PARTIAL_COPY（缺 019/M2 trace/Dashboard/Eval） | — | DO_NOT_MIGRATE | 唯一候选文件 `components/home/assistant-margin.tsx` → FINAL_REVIEW_REQUIRED（ARCH-03F 前） |
| `D:\Codex\IELTS-m2-debug-console` | 保留 worktree（含唯一敏感文件 vercel-env-production.txt） | — | 不迁移 | SECRET-HYGIENE-01 处置 |
| `D:\Codex\IELTS-practice`（dirty canonical） | canonical 在途资产 | consolidation worktree 同路径 / docs/evidence | 按 canonical-asset-manifest.json 吸收（ARCH-03B） | 见 manifest |

## 2. Miniapp 依赖图（实测）

- `apps/mini/package.json` **不含** `@ielts/core` 依赖。
- 解析：`apps/mini/tsconfig.json` paths `"@ielts/core": ["../packages/core/src/index.ts"]` + `packages/core/package.json` exports（`.`、`./mini`、`./server`、`./seed/*`）；构建经 `tsconfig-paths-webpack-plugin`。
- mini/src 实际 import：
  - `@ielts/core`：setStorageAdapter、getProfile、saveProfile、MonogramColor、ImaConfig、ModelConfig、formatCNDate、speaking-llm 相关类型
  - `@ielts/core/mini`：TaroStorageAdapter（storage/mini.ts）
- 迁移方案（OPTION M1）：`apps/miniapp/core/` 整体迁入 compatibility core；tsconfig paths 改为 `"./core/src/index.ts"`（+ `"./core/src/storage/mini.ts"`）；**mini/src import 零改动**。

## 3. Core 内容分类（已冻结）

- MINIAPP_SPECIFIC（必须迁）：auth/wechat-bridge-client.ts、storage/adapter.ts、storage/mini.ts、mini-service.ts、plan.ts、llm-catalog.ts、config.ts、server.ts
- DUPLICATED_CANONICAL_RULE（标 LEGACY_COMPAT，非 SSOT）：review/{answer-judge, initial-schedule, review-schedule}（18 行，与 canonical 27 行分叉）、learning/types、speaking/types、client/{day, item-id, progress, report-narrative}
- IDENTICAL_DUPLICATE：seed/ielts-learning-items.json、seed/speaking-questions.json（与 `data/seed` hash 一致 → 单源 = canonical data/seed）
- UNKNOWN：无

## 4. Android 源 allowlist（按真实目录，ARCH-03D 执行）

- **MIGRATE**：settings.gradle.kts、build.gradle.kts、gradle.properties、gradle/、gradlew、gradlew.bat、app/（含 app/build.gradle.kts，排除 app/build）、core/（含 core/build.gradle.kts，排除 core/build）
- **DO_NOT_MIGRATE**：.gradle/、.jdk/、.jdk.zip、.jdk_home、app/build/、core/build/、.verify/、local.properties、keystore.properties（SECRET）、release-key.jks（SECRET）、andrun.log、andrun2.log、build.log、repro_out.txt、capture_crash.bat、install-apk.bat、rebuild-install.bat、repro_learn.py（后 4 个为本地调试脚本 → REVIEW_BEFORE_COPY）
- 迁移后验收：`apps/android` 可独立 Gradle sync + `./gradlew assembleDebug`；不接 Supabase；不改网络架构。

## 5. 分类冻结

- canonical lib = CURRENT BUSINESS RULE SSOT
- miniapp legacy rule（apps/miniapp/core）= CLIENT-COMPAT IMPLEMENTATION
- android core = ANDROID CLIENT IMPLEMENTATION
- 第一阶段不统一三端规则；后续 CROSS-CLIENT-CONTRACT-RECONCILIATION。
