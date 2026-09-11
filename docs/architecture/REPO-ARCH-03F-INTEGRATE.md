# REPO-ARCH-03F-INTEGRATE — Final Consolidation Integration

- Status: **COMPLETE**
- Date: 2026-09-11
- Branch: `repo/arch-consolidate`

## Summary

Integrated the three independently-completed final artifacts into
`repo/arch-consolidate`, forming the single final HEAD before canonical switch.
No feature development; no re-audit; no M3 activity.

## Integration record

- START_HEAD: `9c3d7dae4f730ae074cdab1d3721f0a3dde0c8c`（SECRET-HYGIENE-01）
- Method: sequential cherry-pick (all sources forked from 9c3d7da; clean, no conflicts)

| # | Source commit | Integrated as | Content |
|---|---|---|---|
| 1 | `e1fcbc6` (docs/p4p7-absorb) | `607207ee` | Permanent P4–P7.5 evidence (27 files) + evidence README |
| 2 | `1adc620` (docs/p4p7-absorb) | `849d1ad6` | REPO-ARCH-03F-AUDIT.md + 03G-PRECHECK.md + permanent-evidence manifest |
| 3 | `81e6d21` (docs/p4p7-absorb) | `015ea84b` | Compatibility seed documentation correction (REPO-MAP / manifest / 03C) |
| 4 | `61c1b3a` (chore/preserve-supabase-0009) | `9df85134` | Deferred Supabase 0009 preservation (docs/deferred/supabase/*) |
| 5 | `2888ccf` (chore/repo-arch-03f-retire) | `1adf3d63` | REPO-ARCH-03F-RETIRE.md (legacy source retirement record) |

- Post-cherry-pick doc correction: `REPO-ARCH-03F-AUDIT.md` seed-relation statements
  aligned to git-blob truth (see Seed truth below). Included in final commit.

## Final HEAD

`1adf3d63` + final doc commit (CURRENT-PROJECT-STATE + INTEGRATE record + 03F-AUDIT correction).

## Gates verified

- Permanent evidence: P4=2, P5=4, P6=9, P7=7, P7.5=3, System=2 → **27/27**（+README）
- REPO-ARCH-03F-AUDIT.md / REPO-ARCH-03G-PRECHECK.md / REPO-ARCH-03F-RETIRE.md present
- Supabase 0009: preserved at `docs/deferred/supabase/`（manifest: status=DEFERRED,
  blocker=ENV-SUPABASE-01, do_not_apply_automatically=true）；`supabase/migrations/` =
  0001–0008 only → **ACTIVE_0009 = NO**
- Legacy sources retired: `D:\Codex\ielts-monorepo` / `ielts-android` / `IELTS-m2-debug-console`
  ABSENT on filesystem; `feature/m2-debug-console` branch still exists
- Repo structure: app/, components/, lib/, apps/miniapp/, apps/android/, data/, supabase/,
  tests/eval/, scripts/eval/, docs/eval/, docs/evidence/, docs/deferred/ all present;
  no apps/web, apps/admin, apps/eval, packages/core, packages/ai
- Product behavior diff vs START_HEAD: **0**（app/ components/ lib/ apps/ data/
  supabase/migrations/ tests/eval/ scripts/eval/ unchanged）
- Protected infra intact: `D:\Codex\_secrets\IELTS-practice`, `D:\Codex\_toolchains\java\jdk-17.0.20+8`
- Typecheck: `npx tsc --noEmit` → **PASS**（exit 0）

## Seed truth (final)

- `data/seed` = **SEED_SSOT**
- `apps/miniapp/core/src/seed` = **LEGACY_COMPATIBILITY_SNAPSHOT**
- Git-normalized/blob content identical to canonical `data/seed`（git hash-object verified:
  ielts-learning-items.json `110b8a61`、speaking-questions.json `c4e7c9b1`，三方一致）
- byte-level working-tree SHA256 difference may result from CRLF/LF line endings only
- `core/src/mini-service.ts` imports the compatibility seed（source-level runtime-required）
- No architecture doc still claims "compat seed ≠ canonical data/seed"（grep verified 0 hits）

## Notes

- Eval / M3 untouched: M3 PAUSED; last verified run `m3-20260910-125036`
  (35 PASS / 0 FAIL / 4 UNVERIFIED 020/023/025/035); run provenance remains bound to 496ae31.
- No new eval run, no lifecycle change.
