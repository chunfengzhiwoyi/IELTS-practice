# MOBILE-04C — Real Speaking Backend Integration Report

Gate: MOBILE-04C（branch = dashboard-only）
开始 HEAD: `7794800`；结束 HEAD: 见 COMMITS。
日期: 2026-09-16

## 结论（先结论）

- SCHEMA_READY = **PASS（代码层）**：远程 schema 缺口已实测确认并 materialize 为幂等 migration `0013`；**远程实际部署依赖用户执行 SQL Editor deploy 脚本**（`docs/audits/MOBILE-04C-speaking-schema-deploy.sql`），本轮环境无 CLI/token，**未伪造为已部署**。
- TRANSCRIBE_AUTH_REQUIRED = YES；TRANSCRIBE_AUTH = **PASS**（401 匿名拒绝已测）。
- STT_CONFIG = VALID（契约修复：STT credential 必须对应 STT provider）；STT_REAL_E2E = **BLOCKED_BY_PROVIDER_CONFIG**（WHISPER_API_KEY / OPENAI_API_KEY 均 ABSENT）。
- CANONICAL_ANALYZER_REUSED = YES（未改 analyzer prompt；只补 session 归属校验）。
- BAND_SCORE_GUARD = PASS（既有契约未改，IELTS_BAND_AVAILABLE=NO）。
- WRITEBACK / APPLICATION_EVIDENCE / ABILITY_OBSERVATIONS = **BLOCKED_BY_SCHEMA_DEPLOY**（代码与 migration 就绪，远程表未 materialize 前不可验证）。
- ANDROID_SPEAKING_API = IMPLEMENTED；MULTIPART_M4A = PASS（MockWebServer 验证 multipart field "audio"）。
- VOICE/TEXT 后端流程 = PASS（Robolectric + MockWebServer 集成路径）。
- RESULT_V2_REAL_DATA = PASS（真实契约 JSON → mapper → UI）。
- AUTH_BACKEND_E2E = BLOCKED_BY_ENV（沿用 MOBILE-04B：无真实 QA 凭据）。
- REAL_DEVICE_AUDIO / AUTH / E2E = DEFERRED。
- NEW_FAIL = 0（Web 基线 31 LLM/env 失败未变；Android 112 tests / 0 failures）。

## Phase 1 — Schema Preflight（只读实测）

probe 通道：`scripts/probe-remote-schema.mjs`（service-role PostgREST 只读，`node --env-file=.env.local`）。

| 对象 | 本地期望（migrations） | 远程实测 | 结论 |
|---|---|---|---|
| ability_observations | 4 列（level/issues/evidence/suggestions） | 缺失（42703） | BLOCKER |
| application_evidence | 整表（0010） | 整表缺失（PGRST205） | BLOCKER |
| speaking_sessions | id=text（代码生成 spk-*） | id=uuid（22P02），缺 5 列 | BLOCKER |
| speaking_evaluations | — | 存在 | OK |
| users | — | 存在（1 行） | OK |

**SPEAKING_SESSION_ID_CONTRACT**：代码 SSOT 为文本 `spk-*`（session route `spk-${Date.now()}-...`、SupabaseSpeakingRepository.insert 直写 id、fixtures/tests 全用 spk-*）。DB 为 uuid 仅是旧 migration 0001 遗留。决策 **B**：`0013` 将 id 转 text（空表 `id::text` 安全转换），保留代码契约，不改代码。

**0013_speaking_writeback_schema.sql**（幂等，新 migration，不篡改旧 migration、不 db push）：
- A. speaking_sessions：id drop default + `alter column id type text using id::text` + 补 question_id/status/first_analysis/second_analysis/updated_at/suggested_expressions + status check + updated_at 触发器。
- B. ability_observations：补 4 列 + level check + evidence_status check（5 值）。
- C. application_evidence：0010 逐字（表+RLS+索引）。
- 用户手工执行版：`docs/audits/MOBILE-04C-speaking-schema-deploy.sql`（幂等，可重跑）。

MIGRATION_HISTORY_DRIFT：保留为独立 debt（未裸修复）。

## Phase 2 — Transcribe Security + STT 契约

- `app/api/speaking/transcribe/route.ts`：加入 `requireUser`；匿名 → 401 AUTH_REQUIRED（audio_metadata 摘要仍在错误路径可见）。
- STT credential 契约修复：`OPENAI_API_KEY ?? DEEPSEEK_API_KEY` → `WHISPER_API_KEY ?? OPENAI_API_KEY`。DeepSeek chat key 不再可能被当作 Whisper key。
- 环境实测：WHISPER_API_KEY ABSENT、OPENAI_API_KEY ABSENT、DEEPSEEK_API_KEY PRESENT、WHISPER_BASE_URL PRESENT → **STT_REAL_E2E = BLOCKED_BY_PROVIDER_CONFIG**。

## Phase 3 — Analyze 链

- canonical Analyzer 未改（prompt/band 契约原样）。
- 新增 owner 检查：`session.userId !== user.id → FORBIDDEN`（与 complete 路由一致）；analyze 错误映射补 FORBIDDEN → 403。

## Phase 4-6 — Android 接线

- `SpeakingBackendClient`：createSession / transcribe(multipart "audio", audio/mp4) / analyze / complete；错误映射（401→SESSION_EXPIRED 等），UI 只显示产品中文。
- `SpeakingResultHolder`：真实结果持有；Result Summary/Detail 默认读取。
- `SpeakingScreen`：生产路径（initialState==null）真实链路（session→transcribe/text→analyze→mapper→complete）；测试注入路径保留 Mock；401 触发 `authVm.onSessionExpired()`。
- `Navigation`：Auth Gate 版 SPEAKING 传 authVm。
- `LingxiApiClient` 复用：全 App 唯一 auth-aware HTTP 栈 + EncryptedCookieJar。

## Phase 8-9 — Tests

- 后端：`tests/unit/mobile-04c-speaking-auth.test.ts`（6 tests）：transcribe 401 / WHISPER key 200 / OPENAI 兼容 / DEEPSEEK-only 503 不调 provider / analyze 403 / complete 403。
- Android：`SpeakingBackendClientTest`（7 tests）：session 解析 + cookie 自动携带（Set-Cookie→下次请求 Cookie 头） / 401→SESSION_EXPIRED / 5xx→TRANSCRIPTION_FAILED / analyze 真实契约解析 + Result V2 mapper / fallback / 5xx→ANALYSIS_FAILED / complete 失败不抛。
- `SpeakingResultAppShellTest.realFlowVoiceSubmitToResult` 改为 MockWebServer 真实链路集成（VOICE 全流程）。

## Regression

- Web `tsc --noEmit` = PASS。
- Web vitest：658 passed / 31 failed（9 文件，均为既有 LLM/env 基线：badcase-019/026/033/035、env、int-m3-01、llm-safety、product-loop-02c/02d）；NEW_FAIL = 0。
- Android `assembleDebug` + `testDebugUnitTest` = PASS（112 tests / 0 failures）。

## 环境阻塞（未伪造）

- 远程 schema 部署：需用户执行 `docs/audits/MOBILE-04C-speaking-schema-deploy.sql`（Supabase Dashboard → SQL Editor）。
- STT 真实 E2E：缺 WHISPER_API_KEY。
- Auth 真实 E2E：缺 QA 凭据（沿用 MOBILE-04B 结论）。
- 真实设备：无 ADB device。

## COMMITS

见 `git log`（本轮 ≤4 commit；不 push）。
