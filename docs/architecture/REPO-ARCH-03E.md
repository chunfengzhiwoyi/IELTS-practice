# REPO-ARCH-03E — Repository Integration Acceptance

## Result
**STATUS: BLOCKED_PENDING_EVAL_ASSET_RECONCILIATION** — all product/structure gates PASS; one blocking gap: the Eval System (tests/eval, scripts/eval, docs/eval) is NOT part of the consolidation branch. See EVAL section.
**RESOLVED: EVAL_ASSET_RECONCILIATION = RESOLVED_BY_REPO_ARCH_03E_1** (2026-09-11) — eval assets absorbed from eval/m3-run-04@8080e1e. See REPO-ARCH-03E.1.md. NOTE: repo is NOT SOURCE_RETIREMENT_READY (ANDROID_EXTERNAL_JDK + assistant-margin review + unique-asset audit + secret hygiene remain).

## Structure Acceptance — PASS
- app/, components/, lib/, apps/miniapp/ (+core), apps/android/ (:app+:core), data/, supabase/, docs/, scripts/, tests/ all present at frozen locations.
- No apps/web, apps/admin, apps/eval, packages/* (verified absent).
- Dashboard = WEB_INTERNAL; Eval target = repo-level; Supabase = repo root.

## Web Acceptance — PASS
- WEB_TYPECHECK: PASS (tsc --noEmit exit 0).
- WEB_BUILD: PASS (next build exit 0).
- WEB_REGRESSION: PASS — vitest 398 passed / 1 failed (26 files); the single failure is the historical PRE_EXISTING llm-safety.test.ts (line 158, static violation components/account/ModelSettingsPanel.tsx imports @/lib/llm). No new failures.
- 03B/03C/03D did not alter learning/speaking/review/report/retrieval semantics (critical-path diff = 0 in 03C/03D phases).

## Dashboard Acceptance — PASS
- app/dashboard/page.tsx (528B), components/dashboard/DashboardPage.tsx (5268B), lib/dashboard/* present.
- 3 detail routes IMPLEMENTED (not stubs): lifecycle/[stageId] 1421B, modules/[moduleId] 1369B, traces/[traceId] 669B.
- DURABLE_TRACE_RUNTIME_SIDE_EFFECT: NO — lib/observability/durable-trace-store.ts imported ONLY by tests/unit/dashboard-metrics.correctness.test.ts; no production runtime wiring.

## Miniapp Acceptance — PASS (with known pre-existing debt)
- npm ci (package-lock frozen install): 1176 packages, exit 0.
- MINIAPP_TYPECHECK: FAIL_PREEXISTING_4 (profile-edit MonogramColor TS2724/TS7053 ×3, report useDidShow TS2305 ×1) — identical signature to original source; NOT migration regression. Count/signature unchanged since 03C.
- MINIAPP_WEAPP_BUILD: PASS (exit 0).
- MINIAPP_EXTERNAL_SOURCE_DEPENDENCY_COUNT: 0 (no ielts-monorepo / ../../../packages / absolute-path refs).
- MINIAPP_REAL_APPID_PRESENT: NO (project.config.json appid = YOUR_WECHAT_APPID).
- MINIAPP_HARDCODED_API_KEY_PRESENT: NO (tests contain YOUR_API_KEY placeholders only; repo-wide sk- scan clean).

## Android Acceptance — PASS (build), with environment blocker for retirement
- ANDROID_DEBUG_BUILD: PASS (gradlew :app:assembleDebug, BUILD SUCCESSFUL).
- ANDROID_BUILD_JDK_USED: D:\Codex\ielts-android\.jdk\jdk-17.0.20+8 (bundled source JDK — ONLY JDK 17 found on machine).
- ANDROID_EXTERNAL_JDK_BUILD: BLOCKED_ENVIRONMENT — no source-external JDK 17 found (registry/PATH/common dirs scanned; yuzijiang-light is not a JDK). NOT faked.
- SOURCE_JDK_DEPENDENCY: REMAINS → ANDROID_SOURCE_RETIREMENT_READY: NO.
- ANDROID_EXTERNAL_SOURCE_DEPENDENCY_COUNT: 0 (only intended release-signing reference to gitignored local keystore.properties, guarded by exists()).
- ANDROID_SECRET_FILES_TRACKED: 0; target contains no keystore.properties/release-key.jks/local.properties.

## Eval Acceptance — **BLOCKING FINDING**
- EVAL_SYSTEM_STRUCTURE: FAIL (paths absent) — tests/eval, scripts/eval, docs/eval do NOT exist in consolidation branch.
- Version comparison (tests/eval+scripts/eval+docs/eval files):
  - 496ae31 (product checkpoint base): 0 eval files
  - f0ac513 (canonical current checkout): 82 eval files
  - 8080e1e (eval/m3-run-04): 107 eval files (docs/eval 50, tests/eval 56, scripts/eval 1)
- EVAL_VERSION_IN_CONSOLIDATION: NONE (0 files)
- LATEST_KNOWN_EVAL_VERSION: 8080e1e (107 files)
- EVAL_VERSION_GAP: YES
- EVAL_ASSET_RECONCILIATION_REQUIRED: YES — NOT cherry-picked in this phase; Control Plane to decide REPO-ARCH-03E.1.
- Product-side eval integration (lib/evaluation/*, scripts/eval-context-aware.ts, tests/unit/badcase-*.*) IS present; the Eval Runner system is what is missing.

### REPO-ARCH-03E.1 Resolution (2026-09-11)
- EVAL_ASSET_RECONCILIATION: RESOLVED_BY_REPO_ARCH_03E_1 — tests/eval (56), scripts/eval (1), docs/eval (50) absorbed from eval/m3-run-04@8080e1e (107 files, commit-level selective extraction, git restore --source=8080e1e).
- SOURCE_TARGET_HASH_MATCH: 100% (107/107 git content hash match; worktree CRLF from autocrlf=true, normalized-identical to source blobs).
- PRODUCT_PATH_DIFF: 0 (app/components/lib/data/supabase/apps/miniapp/apps/android unchanged).
- WEB_TYPECHECK: PASS (tsc --noEmit exit 0, eval system resolves in consolidation).
- EVAL_RUNTIME_EXTERNAL_SOURCE_REFERENCES: 0 (tests/scripts); docs/eval references are historical run provenance only.
- NEW_EVAL_RUN_CREATED: NO. BAD_CASE_LIFECYCLE_CHANGED: NO. M3 remains PAUSED.
- Details: docs/architecture/REPO-ARCH-03E.1.md + docs/architecture/eval-asset-manifest.json.

## Supabase Acceptance — PASS
- migrations 0001–0008 present and intact.
- SUPABASE_0009_STATUS: NOT_ABSORBED (0009_p6_instrumentation.sql absent) — BLOCKED_ENV_SUPABASE_01 maintained.

## Data / Knowledge Acceptance — PASS
- data/seed + data/knowledge present. SEED_SSOT = data/seed.
- Miniapp compat seed snapshot remains (NOT_SSOT), not deleted this phase.

## Secrets — PASS
- TRACKED_SECRET_FINDINGS: 0 (no vercel-env, keystore, jks, local.properties, .env, sk- keys tracked).
- Android target: no signing/local files. Miniapp: no real AppID / API key.

## External Source Dependency Scan — PASS
- RUNTIME_EXTERNAL_SOURCE_REFERENCES: 0.
- BUILD_EXTERNAL_SOURCE_REFERENCES: 0.
- Only hits: documentation provenance in docs/handoffs, docs/tools (historical path references — not runtime/build deps).

## Manifest Verification — PASS
- canonical-asset-manifest.json: 109 assets, 45 migrated + 45 verified (P4_P7=61, DASHBOARD=36, ARCH_DOC=2, HANDOFF=3, UNKNOWN(0009)=1, WEB_UI=4, SECRET=2).
- external-source-migration-manifest.json: 175 entries = 106 miniapp + 69 android; 169 identical + 6 expected miniapp diffs. Counts re-verified this phase.
- 03B accounting hygiene: clarification present (46 copied vs 45 manifest = 1 new architecture artifact).

## Known Debt (this phase, NOT fixed)
- TD-MINI-01: 4 pre-existing Miniapp TS errors (profile-edit ×3, report ×1).
- ANDROID_EXTERNAL_JDK: BLOCKED_ENVIRONMENT — no source-external JDK 17; source-retirement blocker.
- EVAL_ASSET_RECONCILIATION_REQUIRED: ~~BLOCKING — consolidation lacks tests/eval+scripts/eval+docs/eval (latest known 8080e1e)~~ **RESOLVED by REPO-ARCH-03E.1 (2026-09-11)**.
- assistant-margin.tsx final review pending (ARCH-03F gate).
- M3 PAUSED: 020/023/025/035 remain UNVERIFIED — not addressed here.
- docs/tools/*.py hardcode old canonical absolute path (provenance only, not runtime).

## Source Retirement Readiness
- MONOREPO_SOURCE_RETIREMENT_READY: NO (eval assets reconciled by 03E.1, but assistant-margin review pending).
- ANDROID_SOURCE_RETIREMENT_READY: NO (external JDK blocker).
- CANONICAL_SWITCH_READY: NO (canonical dirty tree not yet fully switched; retained assets absorbed = 45/109 manifest, remainder is evidence/secret/pending).

## Source Protection — PASS
- Canonical D:\Codex\IELTS-practice: HEAD f0ac513 / branch integration/m3-p1 / 67 dirty entries — unchanged.
- D:\Codex\ielts-monorepo, D:\Codex\ielts-android: untouched (read-only copy semantics).
- Consolidation worktree: CLEAN (build artifacts ignored).

## Product Code Modified
NO — acceptance phase only; no product changes made to pass gates.