# REPO-HYGIENE-01 — D:\Codex IELTS 目录盘点（阶段一：只盘点，不实施清理）

> 阶段一约束遵守：未删除/移动/重命名任何目录；未修改任何产品代码；未执行 `git branch -D`；未执行 `git worktree remove`。
> 本文件写入 canonical 仓库 docs/handoffs/ 但**故意不提交**，避免触碰 canonical 仓库当前在途状态。REPO-HYGIENE-02 据此实施清理。

## 1. Main Worktree Registry（git -C D:\Codex\IELTS-practice worktree list --porcelain）

- 主仓库：`D:/Codex/IELTS-practice`，HEAD `f0ac513`（branch `integration/m3-p1`）——注意：main repo 当前 checkout 不是 `main` 分支。
- 注册 linked worktrees 共 21 个（全部无 locked / detached / prunable 标记）：

| path | HEAD | branch |
|---|---|---|
| IELTS-badcase-008 | c353425 | fix/eval-008-empty-boundary |
| IELTS-badcase-019 | 622ee322 | fix/eval-019-hallucination-gate |
| IELTS-badcase-026 | 4d33a376 | fix/eval-026-retrieval-conflict |
| IELTS-badcase-030 | 9940b69 | fix/eval-030-report-baseline |
| IELTS-badcase-033 | 79537c7 | fix/eval-033-error-contract |
| IELTS-badcase-034 | 138839d | fix/eval-034-audio-metadata-trace |
| IELTS-badcase-035 | 7ffdfa4 | fix/eval-035-code-only |
| IELTS-cap-020 | 496ae31 | fix/eval-020-trace-contract |
| IELTS-cap-retrieval | 51af1bb | fix/m3-retrieval-contract-closure |
| IELTS-eval-m2-run-02 | 7ff7fc1 | eval/m2-run-02 |
| IELTS-eval-m3-run-02 | 760afde | eval/m3-run-02 |
| IELTS-eval-m3-run-03 | 2df0749 | eval/m3-run-03 |
| IELTS-eval-m3-run-04 | 8080e1e | eval/m3-run-04 |
| IELTS-eval-m3-special-tools | d3e4edf | eval/m3-special-tools |
| ielts-eval-runner | 782a9e5 | feature/eval-runner-phase0 |
| ielts-eval-runner-current | e91f0ad | eval-runner-current |
| IELTS-integration-m2-01 | 43364c3 | integration/m2-01 |
| IELTS-integration-m3-01 | c189539 | integration/m3-01 |
| IELTS-integration-m3-02 | 083230d | integration/m3-02 |
| IELTS-integration-m3-03 | 9fb1d54 | integration/m3-03 |
| IELTS-m2-debug-console | 011dfbc | feature/m2-debug-console |

不在 registry 中：`ielts-monorepo`（独立空 git 仓库）、`ielts-android`（非 git 目录）。

## 2. 逐目录审计结果

所有 linked worktrees 共享同一 object database 与 remote（`https://github.com/chunfengzhiwoyi/IELTS-practice.git`）。除下述 dirty/untracked 外，其余 worktree 均为 clean、无未跟踪文件、HEAD 均在 object DB 中。

### 需要关注的非干净状态

1. **IELTS-practice（canonical，branch integration/m3-p1 @ f0ac513）**
   - tracked 修改 4：`.gitignore`、`components/assistant/assistant-dock.tsx`、`components/layout/masthead.tsx`、`tsconfig.json`
   - untracked 60：完整 **Dashboard 功能**（`app/dashboard/page.tsx`、`app/api/dashboard/**` 5 个 route、`components/dashboard/**` 11 文件+css、`lib/auth/dashboard-access.ts`）+ 35 份 P4–P7 审计/报告 markdown/json + `docs/ELS_EVALUATION_V1*.json/md` + `generated/dashboard/latest-eval.json` + `REAL_EVENT_MAPPING_FINAL.csv`
   - `.gitignore` 增补了 vercel credential dump / agent workspace / 本地 scratch 规则
   - 结论：canonical 仓库存在**大块未提交的在途 Dashboard/审计工作**。任何人不得假设 main 是干净的。KEEP_CANONICAL，未提交资产必须保留。

2. **IELTS-cap-020（active，fix/eval-020-trace-contract @ 496ae31）**
   - dirty=4（lib/llm/tasks/analyze-speaking.ts、lib/observability/trace-contract.ts、lib/speaking/feedback-quality.ts、package-lock.json），untracked=1（tests/unit/badcase-020-trace-contract.test.ts）
   - = BC-020 在途实现。明确保护任务。KEEP_ACTIVE。

3. **IELTS-eval-m3-run-04（active，eval/m3-run-04 @ 8080e1e）**
   - dirty=8（staged）：compare-section.tsx、demo-service.ts、report-transform.ts、analyze-speaking.ts、evidence-grounding.ts(A)、evidence-sanitizer.ts(A)、feedback-quality.ts、types.ts
   - `git diff 496ae31` = 111 files / +80988 / -1369：Eval System 在途重构（badcase-019/030 单元测试迁入 tests/eval，新增 tests/eval/tools/ui-e2e.ts、tests/eval/vitest.config.ts）
   - 结论：下一 gate EVAL-RUN-M3-04 的 Eval 工作区，含大量 staged 在途状态。KEEP_ACTIVE，禁止触碰。

4. **IELTS-m2-debug-console（已并入 M2-P3A）**
   - dirty=0，untracked=1：`vercel-env-production.txt`（vercel 环境凭据转储，后已被 .gitignore 规则覆盖）
   - 结论：分支内容已在 object DB，但该文件仅存在于磁盘。SAFE_WORKTREE_REMOVE 前必须先人工核验/归档该文件。

### 干净 worktree（branch 内容全部在 object DB，无唯一未提交资产）

IELTS-badcase-008/019/026/030/033/034/035（全部已并入对应 checkpoint 链）、IELTS-eval-m2-run-02、IELTS-eval-m3-run-02、IELTS-eval-m3-run-03、IELTS-eval-m3-special-tools（历史 Eval run worktree）、IELTS-integration-m2-01、IELTS-integration-m3-01、IELTS-integration-m3-02、IELTS-integration-m3-03（checkpoint 链成员）、ielts-eval-runner（1 个独有提交：Eval Runner Phase 0 基础设施）、ielts-eval-runner-current（2 个独有提交：phase 0.1 兼容补丁 + baseline；均为 Eval Runner 实验，已被当前 eval 体系取代）。

## 3. Special Repositories

### ielts-monorepo（独立 git 仓库，PRESERVE_PENDING_MIGRATION）
- 状态：git repo（branch `main`），**0 个 commit**、无 remote、所有内容未跟踪（`.gitignore`、`README.md`、`package.json`、`apps/`、`packages/` 全部 `??`）
- package：`name=ielts-monorepo v0.1.0 private=true`，workspaces=`packages/*,apps/*`
- 内容：
  - `apps/web`：Next.js web（app/components/lib/supabase/middleware/next.config.ts，name=web）——与 canonical web 同源（monorepo 迁移用副本）
  - `apps/mini`：**微信小程序**（project.config.json、src/app.tsx、pages、components、hooks、tests）——**IELTS-practice 中不存在（已确认）→ 唯一资产**
  - `packages/core`：`@ielts/core v0.1.0`（auth/client/learning/review/seed/speaking/storage + wechat-bridge-client.ts、mini-service.ts、plan.ts、server.ts）——**IELTS-practice 中不存在 → 唯一资产**
- 是否 IELTS-practice worktree：**否**。独立仓库。
- 是否含唯一代码：**是**（mini + core）。REPO-ARCH-02 monorepo 迁移的目标物。禁止删除。

### ielts-android（非 git 目录，PRESERVE_PENDING_MIGRATION）
- 状态：**不是 git 仓库**（无 .git），独立 Gradle Android 工程
- 内容：`app/` + `core/`（均含 build.gradle.kts + src）、gradle wrapper、`keystore.properties`、`release-key.jks`（**签名密钥，敏感**）、local.properties、.jdk、install-apk.bat / rebuild-install.bat、repro_learn.py 等调试脚本
- IELTS-practice 中无任何 Android 代码（已确认无 .kt/gradle）→ **全部唯一资产**
- 是否 IELTS-practice worktree：**否**。
- 永久客户端应用 / 待迁入目标结构 `android/`。禁止删除。

### ielts-eval-runner / ielts-eval-runner-current（IELTS-practice linked worktrees，历史 Eval Runner 实验）
- 均为 canonical repo 的注册 worktree（非独立仓库），共享 object DB；HEAD 分别为 782a9e5（feature/eval-runner-phase0）与 e91f0ad（eval-runner-current），各自相对 f0ac513 有 1 / 2 个独有提交（Eval Runner Phase 0 执行基础设施：scripts/eval、tests/eval/cases/*、docs/eval baseline、spec 等）
- 内容已作为 branch ref 保存在 object DB；worktree clean、无未跟踪文件
- 已被当前 eval 体系（f0ac513 / 2df0749 / 8080e1e）取代。SAFE_WORKTREE_REMOVE（分支保留）。

## 4. Classification

| PATH | TYPE | HEAD | BRANCH | DIRTY | UNTRACKED | UNIQUE_ASSETS | RELATION_TO_MAIN | CURRENT_TASK | RECOMMENDATION |
|---|---|---|---|---|---|---|---|---|---|
| IELTS-practice | main repo | f0ac513 | integration/m3-p1 | 4 | 60 | 60 untracked（Dashboard 功能+35 份 P4–P7 报告）+4 修改 | 自身 | 在途 Dashboard 工作 | KEEP_CANONICAL |
| IELTS-cap-020 | linked worktree | 496ae31 | fix/eval-020-trace-contract | 4 | 1 | BC-020 在途实现（3 lib + lock + test） | 同 object DB | ACTIVE BC-020 | KEEP_ACTIVE |
| IELTS-cap-retrieval | linked worktree | 51af1bb | fix/m3-retrieval-contract-closure | 0 | 0 | 无 | 同 object DB | ACTIVE retrieval | KEEP_ACTIVE |
| IELTS-eval-m3-run-04 | linked worktree | 8080e1e | eval/m3-run-04 | 8 | 0 | staged 111 文件（019/030 迁入 tests/eval 重构） | 同 object DB | EVAL-RUN-M3-04（下一 gate） | KEEP_ACTIVE |
| IELTS-badcase-008 | linked worktree | c353425 | fix/eval-008-empty-boundary | 0 | 0 | 无 | 已并入 2a9e383 链 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-badcase-019 | linked worktree | 622ee32 | fix/eval-019-hallucination-gate | 0 | 0 | 无 | 已并入 496ae31 链 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-badcase-026 | linked worktree | 4d33a37 | fix/eval-026-retrieval-conflict | 0 | 0 | 无 | 已并入 55806ba 链 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-badcase-030 | linked worktree | 9940b69 | fix/eval-030-report-baseline | 0 | 0 | 无 | 已并入 496ae31 链 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-badcase-033 | linked worktree | 79537c7 | fix/eval-033-error-contract | 0 | 0 | 无 | 已并入 55806ba 链 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-badcase-034 | linked worktree | 138839d | fix/eval-034-audio-metadata-trace | 0 | 0 | 无 | 已并入 f117d85 链 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-badcase-035 | linked worktree | 7ffdfa4 | fix/eval-035-code-only | 0 | 0 | 无 | 已并入 2a9e383 链 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-eval-m2-run-02 | linked worktree | 7ff7fc1 | eval/m2-run-02 | 0 | 0 | 无 | 历史 run，branch 在 DB | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-eval-m3-run-02 | linked worktree | 760afde | eval/m3-run-02 | 0 | 0 | 无 | 历史 run，branch 在 DB | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-eval-m3-run-03 | linked worktree | 2df0749 | eval/m3-run-03 | 0 | 0 | 无 | 历史 run（EVAL ref），branch 在 DB | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-eval-m3-special-tools | linked worktree | d3e4edf | eval/m3-special-tools | 0 | 0 | 无 | 历史 run，branch 在 DB | 无 | SAFE_WORKTREE_REMOVE |
| ielts-eval-runner | linked worktree | 782a9e5 | feature/eval-runner-phase0 | 0 | 0 | 无（1 独有 commit 在 DB） | 实验分支，已被取代 | 无 | SAFE_WORKTREE_REMOVE |
| ielts-eval-runner-current | linked worktree | e91f0ad | eval-runner-current | 0 | 0 | 无（2 独有 commit 在 DB） | 实验分支，已被取代 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-integration-m2-01 | linked worktree | 43364c3 | integration/m2-01 | 0 | 0 | 无 | checkpoint 链成员 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-integration-m3-01 | linked worktree | c189539 | integration/m3-01 | 0 | 0 | 无 | checkpoint 链成员 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-integration-m3-02 | linked worktree | 083230d | integration/m3-02 | 0 | 0 | 无 | checkpoint 链成员 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-integration-m3-03 | linked worktree | 9fb1d54 | integration/m3-03 | 0 | 0 | 无 | checkpoint 链成员 | 无 | SAFE_WORKTREE_REMOVE |
| IELTS-m2-debug-console | linked worktree | 011dfbc | feature/m2-debug-console | 0 | 1 | vercel-env-production.txt（仅磁盘） | 已并入 M2-P3A | 无 | SAFE_WORKTREE_REMOVE（先归档该文件） |
| ielts-monorepo | independent repo（空 git） | 无 commit | main | — | 全部 | mini 小程序 + @ielts/core（唯一） | 非 worktree | REPO-ARCH-02 迁移 | PRESERVE_PENDING_MIGRATION |
| ielts-android | non-git app 目录 | — | — | — | — | 整个 Android 工程 + 签名密钥（唯一） | 非 worktree | 目标结构 android/ | PRESERVE_PENDING_MIGRATION |

注：`SAFE_WORKTREE_REMOVE` 仅表示分支内容已入 object DB、worktree 无唯一未提交资产（除 m2-debug-console 的 1 个待核验文件），实施清理由 REPO-HYGIENE-02 执行并遵守 §5 目录约定。

## 5. Target Filesystem（规划，不实施）

- 唯一永久项目 repo：`D:\Codex\IELTS-practice`
- 临时 worktree 统一目录：`D:\Codex\_worktrees\IELTS-practice\<TASK_ID>`（如 `M3-CAP-020`、`M3-CAP-RETRIEVAL-01`）
- 任务 merge 后 remove worktree；禁止长期保留历史施工目录

## 6. Target Logical Product Structure（规划，不实施移动）

```
IELTS-practice
  apps/{web,miniapp,android,admin}
  packages/{core,contracts,ai}
  data/
  supabase/
  tests/
  scripts/
  docs/
```
- 当前 `app/ components/ lib/` 本任务不移动
- Monorepo migration（含 ielts-monorepo 的 mini/core 迁入、ielts-android 迁入）等 M3 完成后由 REPO-ARCH-02 单独执行

## 7. 汇总

- TOTAL_IELTS_DIRECTORIES: 24
- MAIN_REPO: 1（IELTS-practice）
- ACTIVE_WORKTREES: 3（IELTS-cap-020、IELTS-cap-retrieval、IELTS-eval-m3-run-04）
- HISTORICAL_WORKTREES: 19
- INDEPENDENT_REPOS: 2（ielts-monorepo=独立空 git 仓库；ielts-android=非 git 工程目录）
- SAFE_TO_REMOVE_COUNT: 19（其中 IELTS-m2-debug-console 需先核验 vercel-env-production.txt）
- PENDING_MIGRATION_COUNT: 2（ielts-monorepo、ielts-android）
- UNKNOWN_COUNT: 0
- DELETION_PERFORMED: NO
- PRODUCT_CODE_MODIFIED: NO
- NEXT_GATE: REPO-HYGIENE-02 SAFE CLEANUP
