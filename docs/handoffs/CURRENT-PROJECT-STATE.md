# CURRENT PROJECT STATE — IELTS Learning Platform Consolidation

> 任何新 Agent 接管时：先读本文件 + `git status` / `git log` / `git worktree list`，再读 `docs/architecture/REPO-ARCH-03E.1.md` / `REPO-ARCH-03E.2.md` 即可恢复当前施工状态。
> 最后更新：2026-09-11（REPO-ARCH-03E.2 完成后）。

## CURRENT_BRANCH
`repo/arch-consolidate`（consolidation worktree：`D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE`）

## CURRENT_HEAD
以 `git rev-parse HEAD` 为准（03E.2 后 = 8b6ae14 之上一个 docs commit）。

## CURRENT_PHASE
REPO-ARCH-03E.2（ANDROID_BUILD_ENVIRONMENT_DECOUPLING）— 已完成，PASS。
下一 Gate：**SECRET-HYGIENE-01**（由 Control Plane 指派）。

## COMPLETED_REPO_ARCH_PHASES
- REPO-ARCH-02-INVENTORY — PASS
- REPO-ARCH-02-PLAN — PASS
- REPO-ARCH-03A — PASS（base=496ae31，manifest 109 assets）
- REPO-ARCH-03B — PASS（3 个 "0-byte stub" 实为已实现，无 stub 遗留）
- REPO-ARCH-03C — PASS_WITH_PREEXISTING_SOURCE_DEBT（miniapp 迁入）
- REPO-ARCH-03D — PASS（android 迁入，69/69 hash identical）
- REPO-ARCH-03E — PASS（blocking eval gap 由 03E.1 清除后闭环）
- REPO-ARCH-03E.1 — PASS（eval 资产 107 files 迁入，hash 100% match）
- REPO-ARCH-03E.2 — PASS（Android 独立 toolchain：D:\Codex\_toolchains\java\jdk-17.0.20+8，Debug build 全量重建 PASS）

## CURRENT_BLOCKERS
- **SECRET-HYGIENE-01**：canonical 根级 vercel env dump ×2、debug-console vercel env、Android signing assets（keystore.properties / release-key.jks）处置未做 → `ANDROID_SOURCE_RETIREMENT_READY = NO`。
- **ASSISTANT_MARGIN_FINAL_REVIEW**：`ielts-monorepo/apps/web/components/home/assistant-margin.tsx` 待 ARCH-03F 前 review gate。
- **M3 PAUSED**：020/023/025/035 仍 UNVERIFIED；未经 Control Plane 明确要求不得恢复。

## NEXT_GATE
SECRET-HYGIENE-01（由 Control Plane 指派）。

## WEB_STATUS
PASS — typecheck/build 通过；unit 398/399（唯一失败为预存在 llm-safety.test.ts line 158）；03B–03E.2 未改产品行为（critical-path diff = 0）。

## DASHBOARD_STATUS
IMPLEMENTED（WEB_INTERNAL）— app/dashboard + api/dashboard（5 routes，detail routes 1421/1369/669 B 均已实现）+ components/dashboard + lib/dashboard；durable-trace-store 仅测试引用，无生产 runtime 接线。

## MINIAPP_STATUS
MIGRATED — apps/miniapp + apps/miniapp/core；weapp build PASS；typecheck 4 个 PRE_EXISTING errors（TD-MINI-01，非迁移回归）。

## ANDROID_STATUS
MIGRATED — apps/android（:app + :core）。
- DEBUG_BUILD_PASS（独立 JDK 全量重建 1m42s，37/37 tasks；APK 17,783,183 B）
- SOURCE_EXTERNAL_JDK_PASS（Gradle daemon javaHome = `D:\Codex\_toolchains\java\jdk-17.0.20+8`，铁证）
- ANDROID_BUILD_TOOL_DEPENDENCY: **CLEARED**（不再依赖 `D:\Codex\ielts-android\.jdk`）
- ANDROID_SOURCE_RETIREMENT: **BLOCKED_BY_SECRET_HYGIENE**（signing assets 处置未完）
- 69/69 source hash identical；0 Kotlin change；0 secret copied。

## EVAL_STATUS
REPO_LEVEL_QUALITY_SYSTEM 已迁入（tests/eval 56 + scripts/eval 1 + docs/eval 50 = 107，来源 eval/m3-run-04@8080e1e，hash 100% match）。
- 39 cases 注册；run-04 artifacts（m3-20260910-125036）在；registry 4 条 BC 状态冻结（026/033 VERIFIED_CLOSED；019/030 FIXED_PENDING_REGRESSION 1/3）。
- M3 PAUSED；最后 verified run：m3-20260910-125036（35 PASS / 0 FAIL / 4 UNVERIFIED）。
- 历史 run 归属 product checkpoint `496ae31`，不重写。
- Eval 运行时无外部 source 依赖（docs 中历史 worktree 路径为 provenance）。

## SUPABASE_STATUS
migrations 0001–0008 在；0009_p6_instrumentation.sql 未吸收（BLOCKED_ENV_SUPABASE_01 保持）。

## KNOWN_DEBT
- TD-MINI-01：miniapp 4 个预存在 TS errors。
- ~~ANDROID_EXTERNAL_JDK~~ → **RESOLVED by REPO-ARCH-03E.2**（独立 toolchain：D:\Codex\_toolchains\java\jdk-17.0.20+8）。
- ASSISTANT_MARGIN_FINAL_REVIEW：待 ARCH-03F。
- SECRET-HYGIENE-01：待处理（Android source retirement 阻塞项）。
- M3 UNVERIFIED：020/023/025/035。
- docs/tools/*.py 硬编码旧 canonical 路径（provenance only）。

## PRESERVED_SOURCE_DIRS
- `D:\Codex\IELTS-practice`（canonical，branch `integration/m3-p1` @ f0ac513，4 modified + 63 untracked 保持原样）
- `D:\Codex\ielts-monorepo`（apps/mini、apps/web、packages/core）
- `D:\Codex\ielts-android`（app/core/.jdk，含 signing secrets 本地文件；.jdk 暂时保留）
- `D:\Codex\IELTS-m2-debug-console`
- 全部只读保留，禁止修改/删除（ARCH-03F/G 前）。

## DO_NOT_DO
- 不恢复/推进 M3（除非 Control Plane 明确要求）。
- 不运行 full 39-case Eval / 不创建新 RUN_ID / 不推进 registry lifecycle。
- 不重写历史 run provenance（仍属 496ae31）。
- 不把 miniapp/android 业务规则反向覆盖 canonical lib（canonical lib = SSOT）。
- 不读取/移动/提交任何 secret（vercel env dumps、keystore.properties、release-key.jks）。
- 不 merge / cherry-pick Eval branch；产品树 authority = repo/arch-consolidate。
- 不建 apps/web、apps/admin、apps/eval、packages/*。
- 不把 `D:\Codex\_toolchains`（本地 toolchain）加入任何 Git repository。
