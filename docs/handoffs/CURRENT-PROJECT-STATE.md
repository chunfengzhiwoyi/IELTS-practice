# CURRENT PROJECT STATE — IELTS Learning Platform Consolidation

> 任何新 Agent 接管时：先读本文件 + `git status` / `git log` / `git worktree list`，再读 `docs/architecture/REPO-ARCH-03F-INTEGRATE.md` 即可恢复当前施工状态。
> 最后更新：2026-09-11（REPO-ARCH-03F-INTEGRATE 完成后）。

## CURRENT_BRANCH
`repo/arch-consolidate`（consolidation worktree：`D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE`）

## CURRENT_HEAD
以 `git rev-parse HEAD` 为准（03F-INTEGRATE 后 = 9c3d7da 之上的 5 个 cherry-pick + 最终 docs commit）。

## CURRENT_PHASE
**FINAL_INTEGRATION_COMPLETE** — 三个最终成果已集成：P4–P7.5 永久 evidence + architecture audits、deferred Supabase 0009、legacy source retirement record。
下一 Gate：**REPO-ARCH-03G-CANONICAL-SWITCH**（canonical switch，READY_PENDING_FINAL_GATE）。

## COMPLETED_REPO_ARCH_PHASES
- REPO-ARCH-02-INVENTORY — PASS
- REPO-ARCH-02-PLAN — PASS
- REPO-ARCH-03A — PASS（base=496ae31，manifest 109 assets）
- REPO-ARCH-03B — PASS（3 个 "0-byte stub" 实为已实现，无 stub 遗留）
- REPO-ARCH-03C — PASS_WITH_PREEXISTING_SOURCE_DEBT（miniapp 迁入；seed 表述已按 git-blob 事实修正）
- REPO-ARCH-03D — PASS（android 迁入，69/69 hash identical）
- REPO-ARCH-03E — PASS；03E.1 — PASS（eval 107 files）；03E.2 — PASS（Android 独立 toolchain）
- SECRET-HYGIENE-01 — PASS（11 项 secret 外部化至 Vault；preservation blockers CLEARED）
- REPO-ARCH-03F-AUDIT — PASS（03F-AUDIT 已吸收；seed 关系断言已按 git-blob 核验修正）
- REPO-ARCH-03G-PRECHECK — PASS（03G-PRECHECK 已吸收；27 项永久证据分类）
- DOC-ABSORB-01 — PASS（27 项 P4–P7.5 evidence + 2 audit 文档吸收，SHA256 27/27）
- REPO-ARCH-03F-INTEGRATE — PASS（cherry-pick 5 commits 集成，无冲突；typecheck PASS）

## CURRENT_BLOCKERS
- **无仓库级 blocker**。Canonical switch 前的最终 gate（03G-CANONICAL-SWITCH）由 Control Plane 指派。
- **M3 PAUSED**：020/023/025/035 仍 UNVERIFIED；未经 Control Plane 明确要求不得恢复。
- **LEGACY_MINIAPP_API_KEY_ROTATION**：Vault 已保留快照，建议 provider 端 ROTATE/REVOKE（未执行，非 blocking）。

## NEXT_GATE
REPO-ARCH-03G-CANONICAL-SWITCH（canonical switch）。

## WEB_STATUS
PASS — `npx tsc --noEmit` 通过（03F-INTEGRATE 复核 exit 0）；unit 398/399（唯一失败为预存在 llm-safety.test.ts line 158）；03B 起全程未改产品行为。

## DASHBOARD_STATUS
IMPLEMENTED（WEB_INTERNAL）— app/dashboard + api/dashboard + components/dashboard + lib/dashboard；P4–P7.5 验收证据已归档至 `docs/evidence/dashboard-v2/`（27 项）。

## MINIAPP_STATUS
MIGRATED — apps/miniapp + apps/miniapp/core；weapp build PASS；typecheck 4 个 PRE_EXISTING errors（**TD-MINI-01**，非迁移回归）。

## ANDROID_STATUS
MIGRATED — apps/android（:app + :core）；DEBUG_BUILD_PASS（独立 toolchain）；ANDROID_BUILD_TOOL_DEPENDENCY CLEARED；ANDROID_SECRET_PRESERVATION CLEARED。
- ANDROID_SOURCE_RETIREMENT: **COMPLETE**（legacy `D:\Codex\ielts-android` 已退休删除，记录见 `REPO-ARCH-03F-RETIRE.md`）
- 69/69 source hash identical；0 Kotlin change。

## SECRET_HYGIENE
COMPLETE — 11 项资产 COPY 至 `D:\Codex\_secrets\IELTS-practice`（Git 外 Vault，无 git init）；size 100% 验证。
- TRACKED_REAL_SECRET_COUNT: 0；CONSOLIDATION_REAL_SECRET_FINDINGS: 0；GIT_SECRET_HISTORY_RISK: NOT_DETECTED
- LEGACY_MINIAPP_API_KEY: PRESERVED_OUTSIDE_GIT + ROTATION_RECOMMENDED
- 详见 `docs/architecture/SECRET-HYGIENE-01.md`

## EVAL_STATUS
REPO_LEVEL_QUALITY_SYSTEM 已迁入（107 files，来源 eval/m3-run-04@8080e1e，hash 100% match）。
- 39 cases；run-04（m3-20260910-125036）artifacts 在；registry 冻结（026/033 VERIFIED_CLOSED；019/030 FIXED_PENDING_REGRESSION 1/3）
- M3 PAUSED；最后 verified run：m3-20260910-125036（35 PASS / 0 FAIL / 4 UNVERIFIED）
- 历史 run 归属 product checkpoint `496ae31`，不重写；Eval 运行时无外部 source 依赖。

## SUPABASE_STATUS
migrations 0001–0008 active；**0009 已 PRESERVED_DEFERRED**（`docs/deferred/supabase/`：SQL + README + manifest；status=DEFERRED，blocker=ENV-SUPABASE-01，do_not_apply_automatically=true）；ACTIVE_0009 = NO。

## P4_P7_PERMANENT_EVIDENCE
ABSORBED — `docs/evidence/dashboard-v2/`：P4=2、P5=4、P6=9、P7=7、P7.5=3、System=2 = **27 项**（+README）；SHA256 27/27 匹配；manifest：`docs/architecture/permanent-evidence-migration-manifest.json`。

## LEGACY_SOURCE_RETIREMENT
**COMPLETE** — `D:\Codex\ielts-monorepo` / `D:\Codex\ielts-android` / `D:\Codex\IELTS-m2-debug-console` 已从 filesystem 退休删除（记录见 `docs/architecture/REPO-ARCH-03F-RETIRE.md`）；`feature/m2-debug-console` branch 仍存在。

## SEED_FINAL_TRUTH
- `data/seed` = **SEED_SSOT**；`apps/miniapp/core/src/seed` = **LEGACY_COMPATIBILITY_SNAPSHOT**
- git-blob 内容与 canonical `data/seed` 一致（hash-object：110b8a61 / c4e7c9b1，三方一致）；字节级 SHA256 差异仅可能由 CRLF/LF 行尾引起
- `core/src/mini-service.ts` 直接引用 compat seed；docs 已无 "compat seed ≠ canonical" 表述

## KNOWN_DEBT
- **TD-MINI-01**：miniapp 4 个预存在 TS errors。
- **LEGACY_MINIAPP_API_KEY_ROTATION**：建议 provider 端 ROTATE/REVOKE（未执行）。
- **M3 UNVERIFIED**：020/023/025/035。
- docs/tools/*.py 硬编码旧 canonical 路径（provenance only）。

## PROTECTED_INFRASTRUCTURE
- `D:\Codex\_secrets\IELTS-practice`（Secret Vault，Git 外，禁止 git init/提交/修改）
- `D:\Codex\_toolchains\java\jdk-17.0.20+8`（本地 JDK toolchain，不入 Git）
- `D:\Codex\IELTS-practice`（canonical worktree，branch `integration/m3-p1` @ f0ac513，switch 前保持只读）

## DO_NOT_DO
- 不恢复/推进 M3（除非 Control Plane 明确要求）。
- 不运行 full 39-case Eval / 不创建新 RUN_ID / 不推进 registry lifecycle。
- 不重写历史 run provenance（仍属 496ae31）。
- 不把 miniapp/android 业务规则反向覆盖 canonical lib（canonical lib = SSOT）。
- 不读取/移动/提交任何 secret；不把 Vault 加入任何 Git repository。
- 不 merge / cherry-pick Eval branch；产品树 authority = repo/arch-consolidate。
- 不建 apps/web、apps/admin、apps/eval、packages/*。
- 不把 `D:\Codex\_toolchains` 加入任何 Git repository。
- 不改动 seed 数据本身 / `mini-service.ts`（seed 关系已冻结为 SEED_FINAL_TRUTH）。
- Canonical switch（03G）前不修改 `D:\Codex\IELTS-practice`（只读保留）。
