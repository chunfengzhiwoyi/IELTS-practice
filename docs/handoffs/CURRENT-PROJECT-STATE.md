# CURRENT PROJECT STATE — IELTS Learning Platform Consolidation

> 任何新 Agent 接管时：先读本文件 + `git status` / `git log` / `git worktree list`，再读 `docs/architecture/REPO-ARCH-03G-CANONICAL-SWITCH.md` 即可恢复当前施工状态。
> 最后更新：2026-09-11（REPO-ARCH-03G-CANONICAL-SWITCH 完成后）。

## REPO_CONSOLIDATION
**COMPLETE**

## CANONICAL_PATH
`D:\Codex\IELTS-practice`（唯一正式项目工作区）

## CANONICAL_BRANCH
`repo/arch-consolidate`

## CURRENT_HEAD
以 `git rev-parse HEAD` 为准（canonical switch 后 = 6a0ccb1 之上的 final switch docs commit）。

## CURRENT_PHASE
**CANONICAL_SWITCH_COMPLETE** — 正式路径已从 `integration/m3-p1@f0ac513` 切换至 `repo/arch-consolidate@6a0ccb1`。
REPO CONSOLIDATION COMPLETE。下一 Gate：**RETURN_TO_PRODUCT_AND_CAREER_MAINLINE**（回到产品/业务主线）。

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
RETURN_TO_PRODUCT_AND_CAREER_MAINLINE（产品/职业主线；仓库整合施工结束，禁止再发明新的 repo hygiene 阶段）。

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

## LAST_VERIFIED_EVAL_RUN
`m3-20260910-125036` — 35 PASS / 0 FAIL / 4 UNVERIFIED（020/023/025/035）

## KNOWN_DEBT
- **TD-MINI-01**：miniapp 4 个 pre-existing TS errors。
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
