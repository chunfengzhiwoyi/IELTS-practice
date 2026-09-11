# CURRENT PROJECT STATE — IELTS Learning Platform Consolidation

> 任何新 Agent 接管时：先读本文件 + `git status` / `git log` / `git worktree list`，再读 `docs/architecture/SECRET-HYGIENE-01.md` 及 `docs/architecture/REPO-ARCH-03E*.md` 即可恢复当前施工状态。
> 最后更新：2026-09-11（SECRET-HYGIENE-01 完成后）。

## CURRENT_BRANCH
`repo/arch-consolidate`（consolidation worktree：`D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE`）

## CURRENT_HEAD
以 `git rev-parse HEAD` 为准（SECRET-HYGIENE-01 后 = 1bdf8fd 之上的 docs commit）。

## CURRENT_PHASE
SECRET-HYGIENE-01（LOCAL_SECRET_EXTERNALIZATION_AND_RETIREMENT_PREPARATION）— 已完成，PASS。
下一 Gate：**PARALLEL_AUDITS_PENDING**（REPO-ARCH-03F-AUDIT / REPO-ARCH-03G-PRECHECK，由 Control Plane 指派）。

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
- SECRET-HYGIENE-01 — PASS（11 项 secret/敏感本地资产 COPY 至 Git 外 Vault `D:\Codex\_secrets\IELTS-practice`，size 100% 验证；Android/Monorepo/Debug-console secret preservation blocker 全部 CLEARED）

## CURRENT_BLOCKERS
- **REPO-ARCH-03F-AUDIT / REPO-ARCH-03G-PRECHECK**（PARALLEL_AUDITS_PENDING）：03F 前需完成 assistant-margin review 与 source unique-asset audit。
- **ASSISTANT_MARGIN_FINAL_REVIEW**：`ielts-monorepo/apps/web/components/home/assistant-margin.tsx` 待 ARCH-03F 前 review gate。
- **M3 PAUSED**：020/023/025/035 仍 UNVERIFIED；未经 Control Plane 明确要求不得恢复。

## NEXT_GATE
PARALLEL_AUDITS_PENDING：**REPO-ARCH-03F-AUDIT** / **REPO-ARCH-03G-PRECHECK**（由 Control Plane 指派；不得在审计完成前宣称 03F 已完成）。

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
- ANDROID_SECRET_PRESERVATION: **CLEARED**（keystore.properties + release-key.jks + local.properties 已 COPY 至 Vault，source 原位保留）
- ANDROID_SOURCE_RETIREMENT: **READY_FOR_ARCH_03F_UNIQUE_ASSET_AUDIT**（secret 与 toolchain 均不再是 blocker；仍须 03F 最终审计，不可直接删除）
- 69/69 source hash identical；0 Kotlin change；0 secret copied。

## SECRET_HYGIENE
EXTERNALIZED_COPY_VERIFIED — 11 项资产 COPY 至 `D:\Codex\_secrets\IELTS-practice`（android 3 + vercel 5 + miniapp 3），全部 source==target size。
- ANDROID_SECRET_PRESERVATION: CLEARED
- MONOREPO_SECRET_PRESERVATION: CLEARED
- DEBUG_CONSOLE_SECRET_PRESERVATION: CLEARED
- LEGACY_MINIAPP_API_KEY: PRESERVED_OUTSIDE_GIT + ROTATION_RECOMMENDED（rotation 未执行）
- TRACKED_REAL_SECRET_COUNT: 0；CONSOLIDATION_REAL_SECRET_FINDINGS: 0；GIT_SECRET_HISTORY_RISK: NOT_DETECTED
- 模板：`apps/android/keystore.properties.example` 已建；.gitignore 已覆盖（无需改动）
- 源目录零删除、零移动；详见 `docs/architecture/SECRET-HYGIENE-01.md`

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
- ~~SECRET-HYGIENE-01~~ → **RESOLVED by SECRET-HYGIENE-01**（Vault 外部化完成；保留项：legacy miniapp API key 建议 provider 端 ROTATE/REVOKE，未执行）。
- ASSISTANT_MARGIN_FINAL_REVIEW：待 ARCH-03F。
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
- 不把 `D:\Codex\_secrets\IELTS-practice`（Secret Vault）加入任何 Git repository / 不在其内 git init / 不提交其任何文件。
- 不 merge / cherry-pick Eval branch；产品树 authority = repo/arch-consolidate。
- 不建 apps/web、apps/admin、apps/eval、packages/*。
- 不把 `D:\Codex\_toolchains`（本地 toolchain）加入任何 Git repository。
