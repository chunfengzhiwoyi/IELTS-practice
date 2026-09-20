# MOBILE-09A — Android Standalone Release（Vercel 复用）

- 日期：2026-09-20
- 分支：`dashboard-only`
- 任务：MOBILE-09A（Vercel 免费优先续作；REUSE_EXISTING_VERCEL）
- 设备：HUAWEI ELI-AN00（Android 16 / API 36）
- 视觉：MOBILE_VISUAL_SYSTEM_V3 = FROZEN（本轮零视觉改动）

---

## 1. 结论速览（据实）

```text
MOBILE_STANDALONE_PRODUCT: PARTIAL（文字/登录/会话/导航全通；语音 STT 卡 Vercel env，见 VERCEL_STT_ENV_REQUIRED）
PERSONAL_DEMO_RELEASE:     PARTIAL（同上；语音 STT env 配置后即可 VERIFIED）
MAINLAND_PUBLIC_PRODUCTION: NO（本产品不定义、不冒充）
```

## 2. Backend

- 平台：**Vercel**（GitHub integration，免费 Hobby）
- 项目：`ielts-practice-data`
- URL：`https://ielts-practice-data.vercel.app`
- 部署性质：**个人作品 / 演示环境（PERSONAL DEMO）**，非中国大陆正式生产环境。
- 移动端 backend 路由：`/api/auth/mobile/*`、`/api/speaking/*`（middleware 白名单，MOBILE-04B 起）。
- 部署触发：`git push origin dashboard-only` → Vercel GitHub integration 自动 production 部署（若 project 的 Production Branch = `dashboard-only`）。

## 3. Android Release

- APK：`release/Lingxi-IELTS-android-1.0-release.apk`
- SHA256：见 `release/SHA256SUMS.txt`
- Backend URL（BuildConfig）：`https://ielts-practice-data.vercel.app`
- 签名：INTERNAL keystore（repo 外 `D:\Codex\_secrets\...`，不提交、不打印密码）
- 明文/本机地址：release 禁止（MOBILE-04E guard 在位；Manifest release 无 cleartext）
- Debug：仍允许 localhost QA（`10.0.2.2:3000` 仅 debug）

## 4. 大陆直连限制（如实记录）

```text
MAINLAND_DIRECT_LIMITATION: YES
```

- `*.vercel.app` 域名在当前中国大陆网络环境存在 SNI/DNS 干扰风险（本机直连实测：TLS 被重置；真机实测见 §9）。
- 本 Release 面向「个人自用 + 面试演示」；如用户日常设备环境（含代理/VPN）可稳定访问，则
  `PERSONAL_DEMO_RELEASE` 成立；**不构成中国大陆公开生产可达性承诺**。

## 5. 安全边界

- APK 不含：service role key、DashScope/DeepSeek/Bailian key、密码、cookie、JWT。
- APK 不含 runtime localhost 连接；唯一 localhost 字符串为 BYOK「本地 Ollama」用户自选 provider
  目录条目（`LlmProvider`，需用户显式配置才连接，非默认目标）。
- 服务端 env：变量名见 Phase 3 审计；值由 Vercel secret 管理，不入 Git / APK / 日志。

## 6. 测试与回归

- `npx tsc --noEmit`：PASS
- Android `:app:testDebugUnitTest`：135 tests / 0 failures
- `assembleDebug` / `assembleRelease`：BUILD SUCCESSFUL
- Web vitest：679 passed / 33 failed（**全部为既有 LLM/env 基线失败**：MODEL_SCHEMA_MISMATCH /
  实调 provider 输出漂移 / env 依赖；本任务零源码改动，NEW_FAIL = 0）

## 7. 真机验收（Phase 17-22）

见 §9 Gate 表。

## 8. 变更

- 无源码改动（视觉冻结）。
- 新增：`docs/release/MOBILE-09-ANDROID-RELEASE.md`、`release/` APK + SHA256SUMS。
- 部署触发：`git push origin dashboard-only`（MOBILE-09A 明确授权；禁止 force push / push main / 改历史）。

## 9. 最终 Gate 表（由 Phase 8-24 实测回填）

```text
VERCEL_DEPLOYMENT:             PASS
MOBILE_SESSION_ROUTE:          401（{"authenticated":false}）
VERCEL_PRODUCTION_ENV:         PASS（auth/DeepSeek/Supabase 齐全且实测可用；STT 见下）
DASHSCOPE_SECRET_SOURCE:       EXISTING_EXTERNAL_SECRET（外部 secret 目录有 BAILIAN_API_KEY 素材，
                               需用户复制为 Vercel 的 DASHSCOPE_API_KEY → VERCEL_STT_ENV_REQUIRED）
AUTH_VERCEL_E2E:               PASS
VERCEL_SPEAKING_BACKEND_E2E:   PARTIAL（session/analyze/DeepSeek/Supabase 写回全 PASS；
                               transcribe=503 CONFIG_ERROR，STT env 缺失）
VERCEL_DEVICE_DIRECT:          FAIL（Wi-Fi 裸连 + 蜂窝裸连均 DNS 污染/超时）
VERCEL_DEVICE_USER_ENV:        PASS（真机 Wi-Fi + 用户 VPN：DNS 正常、401、TOTAL 5.5s）
MAINLAND_DIRECT_LIMITATION:    YES
REAL_RELEASE_LOGIN:            PASS
REAL_RELEASE_SESSION_RESTORE:  PASS
REAL_RELEASE_VOICE_E2E:        BLOCKED（VERCEL_STT_ENV_REQUIRED：STT_PROVIDER=dashscope +
                               DASHSCOPE_API_KEY 未配置；配置并 Redeploy 后重跑）
REAL_RELEASE_TEXT_E2E:         PASS（文字回答 → Vercel analyze → DeepSeek → Supabase → Result V2）
CORE_RELEASE_SMOKE:            PASS（今日/学习/复习/口语/我的 + 学习手记/学习报告 全部无 crash）
ADB_REVERSE_REQUIRED:          NO
LOCAL_NEXT_REQUIRED:           NO
NO_COMPUTER_PRODUCT_QA:        PASS（cold start + session restore + 全部页面走 Vercel HTTPS；
                               语音待 STT env）
SECRET_LOG_LEAK:               NO（logcat 132 处关键词命中均为系统噪音；0 真实密钥/密码/JWT/cookie）
QA_CLEANUP:                    PASS（speaking_sessions 2、ability_observations 6、users、auth 用户全删）
NEW_FAIL:                      0
VISUAL_REGRESSION:             NONE
```

## 10. 待办（STT 门禁，与网络/部署 Gate 分离）

- 用户需在 Vercel 项目 `ielts-practice-data-dashboard` 的 Production Environment Variables 配置：
  - `STT_PROVIDER` = `dashscope`
  - `DASHSCOPE_API_KEY` = `D:\Codex\_secrets\IELTS-practice\vercel\canonical-env.local` 中 `BAILIAN_API_KEY` 的值
- 保存后对最新部署 Redeploy。
- 配置完成后继续：Phase 19 真机语音 E2E → Phase 29 最终报告（REAL_RELEASE_VOICE_E2E）。
