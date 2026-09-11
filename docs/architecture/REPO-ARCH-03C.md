# REPO-ARCH-03C — Migrate Miniapp Client & Compatibility Core

## Summary
Migrated the only WeChat miniapp source (`D:\Codex\ielts-monorepo\apps\mini`) and its runtime-required core
(`D:\Codex\ielts-monorepo\packages\core`) into the consolidation worktree as `apps/miniapp` (+ `apps/miniapp/core`).
Path/config adaptations only. No business behavior changed. Source monorepo NOT deleted (retirement gated by ARCH-03E/F).

## Miniapp Source
- Source: `ielts-monorepo/apps/miniapp` (13 pages: goal, identity, ima-config, index, learn, model-settings, privacy, profile, profile-edit, report, review, speaking, wechat-scan-login)
- Target: `apps/miniapp/`
- Files migrated: 84 (src 69 + config 3 + types 1 + tests 3 + scripts 4 + package.json / tsconfig.json / babel.config.js / project.config.json)
- All migrated files hash-verified against source except 6 intentional adaptations (see Config Changes).

## Dependency Graph
- `apps/miniapp` resolves `@ielts/core` and `@ielts/core/mini` through:
  1. tsconfig paths → `./core/src/index.ts` / `./core/src/storage/mini.ts` (TS + TsconfigPathsPlugin)
  2. Taro webpack alias (config/index.ts) → `../core/src/...`
  3. package.json dependency `@ielts/core: file:./core` (node resolution fallback, exports map intact)
- Taro webpackChain keeps babel compile rule for `../core` (renamed from `../../../packages/core`).
- Core import consumers (application): src/lib/auth.ts (TaroStorageAdapter + storage/profile + MonogramColor), src/lib/ima.ts (type), src/lib/llm-client.ts (type), src/lib/speaking-llm.ts (values), src/components/NavBar.tsx (formatCNDate).
- `core/src/mini-service.ts` imports `./seed/*.json` internally → seeds migrated (see Seed Decision).
- MONOREPO_ROOT_RUNTIME_DEPENDENCY = YES (source relied on root workspaces + root node_modules symlink; no lockfile anywhere).
  → Migrated to self-contained nested project; root workspace NOT changed.

## Compatibility Core Semantics
- `apps/miniapp/core` = MINIAPP_COMPATIBILITY_CORE (legacy client compatibility implementation).
- canonical `lib/` remains CURRENT BUSINESS RULE SSOT.
- Core files copied verbatim (22 files incl. 2 seeds), all hash-identical to source.
- NO new global `packages/core` created.

## Core Classification
| Area | Classification |
|---|---|
| auth/wechat-bridge-client, storage/{adapter,mini}, mini-service, client/* | MINIAPP_SPECIFIC |
| review/{answer-judge,initial-schedule,review-schedule}, learning/types, speaking/types | DUPLICATED_DIVERGED_RULE (legacy compat; canonical lib is authority) |
| config, llm-catalog, plan, server | OTHER_COMPAT |
| seed/*.json (2) | IDENTICAL_DUPLICATE → COMPATIBILITY_SNAPSHOT (hash-identical to canonical data/seed) |

## Config Changes (6 expected diffs)
1. `config/index.ts` — webpack alias + babel include: `../../../packages/core` → `../core` (3 lines).
2. `tsconfig.json` (miniapp) — paths: `@ielts/core` → `./core/src/index.ts`; added `@ielts/core/mini` → `./core/src/storage/mini.ts`; added `@ielts/core/*` → `./core/src/*`.
3. `package.json` (miniapp) — added dependency `@ielts/core: file:./core`.
4. `project.config.json` — real WeChat AppID replaced with `YOUR_WECHAT_APPID` template (secret/local config gate).
5. `tests/run-e2e.ts` — hardcoded API key replaced with `YOUR_API_KEY` (secret gate).
6. `tests/e2e.cjs` — hardcoded API key replaced with `YOUR_API_KEY` (secret gate).
Root adaptations (build hygiene, not external source): root `tsconfig.json` excludes `apps/miniapp` (miniapp has its own tsconfig/typecheck); root `.gitignore` ignores miniapp build artifacts (dist*, .swc, preview).

## Seed Decision
- `core/src/mini-service.ts` imports `./seed/ielts-learning-items.json` + `./seed/speaking-questions.json` → seeds ARE runtime-required at source level (typecheck), so copied as COMPATIBILITY_SNAPSHOT.
- Both seeds hash-IDENTICAL to canonical `data/seed` (verified).
- Not reachable by the app bundle (mini-service not imported by any page) → not present in dist.
- canonical `data/seed` remains SEED_SSOT; the miniapp copy is NOT a second editable authority.

## Secret / Local Exclusions
- project.config.json AppID → templated (source retains real AppID).
- tests hardcoded API keys → sanitized to YOUR_API_KEY (source retains keys; flagged for SECRET-HYGIENE-01).
- Excluded from migration: dist*, preview, .swc, *.log, build_clean.txt / build_log.txt, shot-mini*.mjs QA scripts, scripts/_probe.js / _smoke.js / _smoke2.js scratch.

## Install / Build / Test Result
- Install: `npm install` in apps/miniapp (NO_SOURCE_LOCKFILE; fresh install, 1176 packages, exit 0). node_modules/@ielts/core resolves via file: dep.
- Miniapp typecheck (`tsc --noEmit`): FAILS with 4 pre-existing source errors (identical to original monorepo run; original had 5 incl. @ielts/core/mini resolution error which migration FIXED):
  - src/pages/profile-edit/index.tsx (MonogramColor missing export, TS2724/TS7053 ×3)
  - src/pages/report/index.tsx (useDidShow imported from 'react', TS2305)
  → PRE_EXISTING_MINIAPP_FAILURES (not fixed per task discipline).
- Taro weapp build (`npm run build:weapp`): PASS (exit 0, 80 dist files, app.json/app.wxss, 13 pages). Only Sass deprecation warnings.
- Miniapp tests: tests/ are LLM/playwright e2e requiring live API key → E2E_ONLY_NOT_RUN in migration context; no deterministic unit tests present.
- Core tests: none present (core has typecheck script only; covered by typecheck above).
- Web root typecheck: PASS (exit 0) after root tsconfig excludes apps/miniapp.
- Web next build: PASS (exit 0).
- WEB_CRITICAL_PATH_DIFF (app/components/lib/data/supabase/tests-eval/scripts-eval vs 03B HEAD 55ae0a2): 0.

## Behavior Preservation
- No business logic modified. Hash-identical: 100/106 files. 6 expected diffs are path/config/secret adaptations only.
- Application imports unchanged (`@ielts/core`, `@ielts/core/mini` only; resolved via alias/paths, zero import rewrites in src/**).
- NO_SOURCE_ESCAPE verified (no ielts-monorepo / ../../../packages / absolute-path references remain).

## Remaining Reconciliation Debt (NOT this phase)
- Miniapp legacy review schedule / answer judge / learning types vs canonical lib: CROSS-CLIENT-CONTRACT-RECONCILIATION (future).
- Source monorepo still contains: hardcoded API keys in tests, apps/web stale copy, assistant-margin.tsx (ARCH-03F review gate).
- Source retirement only after ARCH-03E acceptance + ARCH-03F unique-asset audit.

## Accounting
- Copied source assets this phase: 106 (84 miniapp client + 22 compat core) per docs/architecture/external-source-migration-manifest.json (100 identical + 6 expected diff).
- canonical-asset-manifest.json (109 items, 45 migrated+verified) untouched — external migration tracked separately.