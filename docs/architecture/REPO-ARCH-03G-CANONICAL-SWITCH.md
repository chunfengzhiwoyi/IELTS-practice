# REPO-ARCH-03G-CANONICAL-SWITCH — Final Canonical Worktree Switch

- Status: **COMPLETE**
- Date: 2026-09-11
- Repo consolidation: **COMPLETE**

## Switch record

- OLD_CANONICAL_BRANCH: `integration/m3-p1`
- OLD_CANONICAL_HEAD: `f0ac5131828ddddadf5231779ed262319f1f034b`
- NEW_CANONICAL_BRANCH: `repo/arch-consolidate`
- NEW_CANONICAL_HEAD (pre-switch): `6a0ccb1fa8ab2b6591c8de34c3c2e3f8f9c60b2f`
- Canonical path: `D:\Codex\IELTS-practice`（正式唯一项目工作区）

## Old dirty tree cleanup

- Tracked modifications (4 files) restored to HEAD: cleared (0 remaining).
- Untracked assets (69 items) cleaned via `git clean -fd` after dry-run review —
  all belonged to previously dispositioned sets: P4–P7.5 permanent evidence
  (absorbed to `docs/evidence/dashboard-v2/`), dashboard increments (absorbed),
  eval docs (superseded/absorbed), temporary working notes, build/tool scratch,
  and the two deployment dumps (externalized to Secret Vault).
- `git clean -fdx` NOT used: `.env.local` and machine-local ignored config preserved.
- `.env.local` kept in place as ignored local runtime config (not read, not committed).
- `vercel-env-production.txt` / `vercel-upload.env` removed by exact path (already in Vault).

## Preserved history

- `integration/m3-p1` → f0ac513 (kept)
- `feature/m2-debug-console` → 011dfbc (kept)
- `repo/arch-consolidate` → 6a0ccb1+ (current canonical)
- Plus audit/defer/absorb branch refs all preserved: docs/p4p7-absorb (81e6d21),
  audit/repo-arch-03f (b7e0ca4), chore/repo-arch-03f-retire (2888ccf),
  audit/repo-arch-03g-precheck (4b1f9b2), chore/preserve-supabase-0009 (61c1b3a).
- No Git history deleted; no merge of integration/m3-p1 into consolidation.

## Permanent state (post-switch gates)

- Permanent evidence: `docs/evidence/dashboard-v2/` 27/27（P4=2, P5=4, P6=9, P7=7, P7.5=3, System=2）
- Architecture audits: REPO-ARCH-03F-AUDIT.md / 03G-PRECHECK.md / 03F-RETIRE.md / 03F-INTEGRATE.md present
- Supabase 0009: `docs/deferred/supabase/`（DEFERRED, blocker ENV-SUPABASE-01, do_not_apply=true）;
  active migrations = 0001–0008 only (ACTIVE_0009 = NO)
- Secret vault: `D:\Codex\_secrets\IELTS-practice` present (untouched)
- Android toolchain: `D:\Codex\_toolchains\java\jdk-17.0.20+8` present (untouched)
- Legacy sources: `D:\Codex\ielts-monorepo` / `ielts-android` / `IELTS-m2-debug-console` ABSENT (retired)
- Repo structure: app/ components/ lib/ apps/miniapp/ apps/android/ data/ supabase/
  tests/eval/ scripts/eval/ docs/eval/ docs/evidence/ docs/deferred/ present;
  no apps/web, apps/admin, apps/eval, packages/core, packages/ai

## Validation

- `npm run typecheck`（tsc --noEmit）: **PASS**（exit 0；依赖经 npm install 补齐 506 packages）
- `npm run build`（next build）: **PASS**（exit 0；full route table incl. /dashboard）
- Note: dependency installation was required because the switched-in branch's
  node_modules lacked dev tooling (typescript). Not a product regression.

## Temporary worktrees retired

- Removed (clean, no --force): REPO-ARCH-CONSOLIDATE（先释放 branch 注册）,
  DOC-ABSORB-01, REPO-ARCH-03F-AUDIT, REPO-ARCH-03F-RETIRE, REPO-ARCH-03G-PRECHECK,
  SUPABASE-0009-DEFER-01.
- `git worktree prune` executed. Final worktree registry = canonical only:
  `D:/Codex/IELTS-practice` [repo/arch-consolidate].
- Worktree root `D:\Codex\_worktrees\IELTS-practice` kept (now empty) for future work.

## Final filesystem topology (project areas)

- `D:\Codex\IELTS-practice` — canonical project (branch repo/arch-consolidate)
- `D:\Codex\_secrets\IELTS-practice` — Secret Vault (Git-external)
- `D:\Codex\_toolchains\java\jdk-17.0.20+8` — local JDK17 toolchain (Git-external)
- `D:\Codex\_worktrees\IELTS-practice` — empty worktree root (kept)

## Product checkpoint semantics

- The consolidated HEAD is the integration result, NOT a new independently
  evaluated product checkpoint. Historical eval run remains bound to product
  checkpoint `496ae31`; last verified eval run `m3-20260910-125036`
  (35 PASS / 0 FAIL / 4 UNVERIFIED 020/023/025/035). M3 remains PAUSED.
