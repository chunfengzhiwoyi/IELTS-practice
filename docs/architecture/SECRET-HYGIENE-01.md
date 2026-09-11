# SECRET-HYGIENE-01 — Local Secret Externalization & Retirement Preparation

- Status: **RESOLVED**
- Task: SECRET-HYGIENE-01（LOCAL_SECRET_EXTERNALIZATION_AND_RETIREMENT_PREPARATION）
- Date: 2026-09-11
- Vault root: `D:\Codex\_secrets\IELTS-practice`（machine-local, outside Git, no `git init`）

## Scope

Copy（COPY only, no MOVE / no DELETE / no content read）of machine-local secret /
sensitive assets scattered across the legacy source directories into a Git-external
vault, so that future source retirement cannot lose the only copy of a secret.

## Assets externalized（logical identifiers only — no values recorded）

| Logical ID | Source | Vault target | Category | Git exposure |
|---|---|---|---|---|
| Android signing properties | `D:\Codex\ielts-android\keystore.properties` | `android\keystore.properties` | ANDROID_SIGNING | NOT_IN_GIT_REPO |
| Android release keystore | `D:\Codex\ielts-android\release-key.jks` | `android\release-key.jks` | ANDROID_SIGNING | NOT_IN_GIT_REPO |
| Android machine-local sdk path | `D:\Codex\ielts-android\local.properties` | `android\local.properties` | ANDROID_LOCAL_CONFIG | NOT_IN_GIT_REPO |
| Debug-console prod env dump | `D:\Codex\IELTS-m2-debug-console\vercel-env-production.txt` | `vercel\debug-console-vercel-env-production.txt` | DEPLOYMENT_ENV | UNTRACKED |
| Debug-console local env | `D:\Codex\IELTS-m2-debug-console\.env.local` | `vercel\debug-console-env.local` | LOCAL_ENV | UNTRACKED + IGNORED |
| Canonical prod env dump | `D:\Codex\IELTS-practice\vercel-env-production.txt` | `vercel\canonical-vercel-env-production.txt` | DEPLOYMENT_ENV | UNTRACKED + IGNORED |
| Canonical upload env | `D:\Codex\IELTS-practice\vercel-upload.env` | `vercel\canonical-vercel-upload.env` | DEPLOYMENT_ENV | UNTRACKED + IGNORED |
| Canonical local env | `D:\Codex\IELTS-practice\.env.local` | `vercel\canonical-env.local` | LOCAL_ENV | UNTRACKED + IGNORED |
| Miniapp real project config | `D:\Codex\ielts-monorepo\apps\mini\project.config.json` | `miniapp\project.config.original.json` | MINIAPP_PRIVATE_CONFIG | UNTRACKED |
| Miniapp secret-bearing e2e (ts) | `D:\Codex\ielts-monorepo\apps\mini\tests\run-e2e.ts` | `miniapp\legacy-secret-bearing\run-e2e.original.ts` | LEGACY_SECRET_BEARING_SNAPSHOT | UNTRACKED |
| Miniapp secret-bearing e2e (cjs) | `D:\Codex\ielts-monorepo\apps\mini\tests\e2e.cjs` | `miniapp\legacy-secret-bearing\e2e.original.cjs` | LEGACY_SECRET_BEARING_SNAPSHOT | UNTRACKED |

All 11 items: `SOURCE_SIZE == TARGET_SIZE` verified. No content was read or printed.

## Git exposure findings

- Consolidation repo tracked real secret count: **0**（only `.env.example` tracked, allowed）
- Canonical sensitive files: UNTRACKED + IGNORED（`.gitignore` L22/L53/L54）
- Monorepo `apps/mini/` is entirely UNTRACKED（never entered Git history）
- `ielts-android` is not a Git repo
- Debug-console `vercel-env-production.txt`: UNTRACKED; `.env.local`: UNTRACKED + IGNORED
- `GIT_SECRET_HISTORY_RISK = NOT_DETECTED`（no rewrite performed; none required）

## Consolidation repo safety

- Hardcoded credential-pattern scan of consolidation tree (excl. build/deps): **0 matches**
- `apps/android`: no `keystore.properties` / `release-key.jks` / `local.properties` present
- `apps/miniapp/project.config.json`: placeholder AppID（no real wx id）
- `apps/miniapp/tests/run-e2e.ts` / `e2e.cjs`: 0 credential-pattern matches

## Template / gitignore

- Created `apps/android/keystore.properties.example`（sanitized, field names only:
  `storeFile`, `storePassword`, `keyAlias`, `keyPassword`; values empty; safe to commit）
- `.gitignore`: already covers `.env`/`.env.local`/`.env.*.local`/`.env.production`（L20–26）、
  `/vercel-env-production.txt`、`/vercel-upload.env`（L52–54）、
  `apps/android/local.properties` / `keystore.properties` / `*.jks` / `*.keystore`（L75–81）.
  No change required. `*.example` / `.env.example` remain committable.

## Retirement flags

- `ANDROID_SECRET_PRESERVATION_BLOCKER = CLEARED`（signing assets externalized; combined with
  REPO-ARCH-03E.2 build-tool decoupling → Android source ready for 03F unique-asset audit,
  not yet delete-ready）
- `MONOREPO_SECRET_PRESERVATION_BLOCKER = CLEARED`
- `DEBUG_CONSOLE_SECRET_PRESERVATION = CLEARED`
- `LEGACY_MINIAPP_API_KEY = PRESERVED_OUTSIDE_GIT` + `ROTATION_RECOMMENDED`（rotation not executed in this task）

## Source integrity

- `SOURCE_FILES_DELETED = 0`，`SOURCE_FILES_MOVED = 0`
- All four legacy source directories unchanged and fully preserved.

## Remaining secret actions

- Provider-side ROTATION / REVOCATION of the legacy miniapp API keys（recommended, not executed）
- Final secret hygiene sweep before any source-directory deletion（SECRET-HYGIENE-01 follow-up if needed）
