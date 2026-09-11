# REPO-ARCH-03D — Migrate Android Client

## Summary
Migrated the only Android client (`D:\Codex\ielts-android`) into `apps/android` preserving `:app` + `:core` module structure.
Source-parity migration: 69 files copied, ALL hash-identical (0 adaptations). Signing secrets/local config/build artifacts excluded.
Debug build PASS from the canonical repo. Source NOT deleted (retirement gated by ARCH-03E/F).

## Source Inventory / Allowlist
- Root config: settings.gradle.kts (rootProject IELTSStudy, :app + :core), build.gradle.kts (AGP 8.2.2 / Kotlin 1.9.22 / serialization), gradle.properties, gradlew, gradlew.bat, gradle/wrapper/* (Gradle 8.6).
- app/: build.gradle.kts + src/main/** (46 files: AndroidManifest, 21 Kotlin, 11 drawable, 3 font, 10 mipmap, 1 values).
- core/: build.gradle.kts + src/main/** (14 files: 12 Kotlin + 2 resource JSON seeds).

## Excluded (Local / Secret / Build)
- keystore.properties (95B), release-key.jks (2758B), local.properties (55B, sdk.dir) — verified NOT copied.
- .gradle/, app/build/, core/build/, .jdk/ + .jdk.zip + .jdk_home (bundled JDK 17 build tool), .verify/, andrun*.log, build.log, capture_crash.bat, install-apk.bat, rebuild-install.bat, repro_learn.py, repro_out.txt.
- No .env, no google-services.json, no .idea, no other jks/keystore/p12/pem (verified recursively).

## Gradle Structure
apps/android/
  settings.gradle.kts / build.gradle.kts / gradle.properties / gradlew(.bat) / gradle/wrapper/
  app/  (com.android.application, namespace com.ielts.app)
  core/ (org.jetbrains.kotlin.jvm + serialization)

## Signing Boundary
- app/build.gradle.kts: `signingConfigs.create("release")` loads keystore.properties ONLY `if (keystorePropsFile.exists())` → configuration phase does NOT require secrets.
- Debug build unaffected. SIGNING_PORTABILITY_ADAPTATION = NO (no build config change needed).
- Release build keeps original signing path when the developer provides real local keystore.properties + release-key.jks (not in repo).
- No keystore.properties.example created (not needed: no config fields required for Debug; release signing is opt-in local).

## Build Environment Facts (recorded only, no upgrades)
- Gradle wrapper: 8.6 (bin). AGP: 8.2.2. Kotlin: 1.9.22. Compose compiler ext: 1.5.10.
- compileSdk 34 / targetSdk 34 / minSdk 24. Java: 17 (jvmTarget 17; bundled JDK 17.0.20+8 used for build).
- Android SDK used: C:\Users\34394\AppData\Local\Android\Sdk (platforms/android-34 + build-tools 34.0.0 present).

## Dependency Audit (recorded)
- app: Compose BOM 2024.02.02 (ui, ui-graphics, material3, material-icons-extended), activity-compose 1.8.2, lifecycle-viewmodel-compose + runtime-ktx 2.7.0, navigation-compose 2.7.7, datastore-preferences 1.0.0, kotlinx-serialization-json 1.6.2, project(:core).
- core: kotlinx-serialization-json 1.6.2, kotlinx-coroutines-core 1.7.3.
- No Supabase, no network library (LLM via BYOK in core/llm). No dependency added.

## Android Current Capability Map (recorded as-is)
- Screens: Login, Goal, Identity, Profile, ProfileEdit, Today, Learn, Review, Speaking, Report, ApiConfig (BYOK), Privacy. Compose UI + DataStore storage + ViewModel.
- Core: StudyModels, Schedule, StudyService, SeedData (2 JSON), StorageAdapter, client (IdAndDate/Progress/ReportNarrative), llm (ApiConfig/LlmCatalog/LlmClient/NarrativeLlm).
- No tests dirs present (app/src has only main; core/src only main).

## Build / Tests Result
- `.\gradlew.bat :app:assembleDebug` (JAVA_HOME=bundled JDK 17, ANDROID_HOME=local SDK): BUILD SUCCESSFUL in 47s → app-debug.apk 17,783,219 B. ANDROID_DEBUG_BUILD = PASS.
- ANDROID_CORE_TESTS: NO_TESTS_PRESENT. ANDROID_APP_TESTS: NO_TESTS_PRESENT. INSTRUMENTED_TESTS: NONE (no androidTest dirs).
- WEB_TYPECHECK: PASS. WEB_BUILD (next build): PASS. WEB_PRODUCT_DIFF vs 03C HEAD: 0 (only .gitignore build-hygiene). MINIAPP_SOURCE_UNCHANGED: YES.

## Hash Verification
- 69/69 copied files hash-identical to source (verified in copy loop AND independent full-tree re-check excluding generated build artifacts).
- KOTLIN_APPLICATION_SOURCE_CHANGED: 0. CONFIG_FILES_CHANGED: 0 (source-side). Root .gitignore extended only.
- No source escape (no D:\Codex / C:\Users / ielts-android references).

## Pre-existing Failures / Regressions
- PRE_EXISTING_ANDROID_FAILURES: none observed (build PASS).
- MIGRATION_REGRESSIONS: 0.

## Cross-Client Reconciliation Debt (recorded, NOT resolved)
- Android StudyModels vs Web types; Android Schedule vs canonical review schedule; Android storage vs server SSOT; Android BYOK vs Web model/provider architecture.
- Future: CROSS-CLIENT-CONTRACT-RECONCILIATION.

## Source Retirement
- D:\Codex\ielts-android NOT deleted. Still required: ARCH-03E integration acceptance + ARCH-03F source-retirement audit.