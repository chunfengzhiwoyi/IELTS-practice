# IELTS Learning Platform — Current Repository Map

## User Clients
| Client | Location | Semantics |
|---|---|---|
| Web | app/ + components/ + lib/ (root Next app) | CURRENT CANONICAL PRODUCT — business-rule SSOT lives in lib/ |
| WeChat Miniapp | apps/miniapp/ | migrated from ielts-monorepo/apps/mini; self-contained (package-lock committed) |
| Android | apps/android/ (:app + :core) | migrated from ielts-android; source-parity (69/69 hash identical) |

## Internal
| Surface | Location | Semantics |
|---|---|---|
| Dashboard | app/dashboard + app/api/dashboard + components/dashboard + lib/dashboard | WEB_INTERNAL (no apps/admin); 3 detail routes IMPLEMENTED (1421/1369/669 B) |

## Shared Infrastructure
| Asset | Location | Semantics |
|---|---|---|
| Supabase | supabase/ (migrations 0001–0008) | REPO_ROOT; 0009 NOT absorbed (ENV-SUPABASE-01 BLOCKED) |
| Data / Knowledge | data/seed + data/knowledge | data/seed = SEED_SSOT; miniapp core seed = COMPATIBILITY_SNAPSHOT (hash-identical, NOT_SSOT) |
| Eval System | NOT YET IN CONSOLIDATION — lives on eval/m3-run-04@8080e1e (107 files) | EVAL_ASSET_RECONCILIATION_REQUIRED |

## Rule Authority
- canonical lib/ = CURRENT WEB BUSINESS RULE SSOT
- apps/miniapp/core = MINIAPP_COMPATIBILITY_CORE (legacy client compat, NOT global SSOT)
- apps/android/core = ANDROID_CLIENT_IMPLEMENTATION (client-local, NOT global SSOT)
- Cross-client contract reconciliation is a future task (CROSS-CLIENT-CONTRACT-RECONCILIATION).