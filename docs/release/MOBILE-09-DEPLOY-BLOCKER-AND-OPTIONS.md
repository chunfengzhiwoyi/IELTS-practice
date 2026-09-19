# MOBILE-09 — Release Readiness：部署审计与 HARD-STOP 决策

- 日期：2026-09-19
- 分支：`dashboard-only`
- BASE_HEAD：`7a72291`（= MOBILE-08F 视觉人工批准后）
- 设备：HUAWEI ELI-AN00，Android 16 / API 36，adb `AU7K024621005560`
- 结论先行：**MOBILE_STANDALONE_PRODUCT = BLOCKED**。阻断点是「国内真机可达的公网 HTTPS 后端 + 部署授权 + 真实 STT 云密钥」，均命中本任务预设 HARD-STOP（A/B/C/D/E），不可由我代为购买/注册/改 DNS/索要或编造 secret/改架构。
- 本文件只记录**变量名与 host**，不含任何 secret 值。

---

## 1. Phase 0 基线（完成）

- OS = Windows 本地（`方寸之距`，Windows_NT）；repo = `D:\Codex\IELTS-practice`；branch = `dashboard-only`；HEAD = `7a72291`。
- 必需提交全部在位：`7bcee6a`、MOBILE-07 链、MOBILE-08 链、MOBILE-08F `0b40cd1 / 97679df / ab8318b / 7a72291`。
- 真机在线（Wi-Fi SSID `AI-native`，192.168.100.x；同时插中国移动 5G `cmnet`）。
- 工作区有 19 项历史改动 + 99 项未跟踪（roborazzi 刷新图 / build log / evidence 等），**本任务未触碰、未提交**。

## 2. Phase 1 现有部署审计（完成）

内部判定：

```text
EXISTING_HTTPS_DEPLOYMENT: YES（https://ielts-practice-data.vercel.app，另有旧 ielts-practice-kohl.vercel.app）
EXISTING_BACKEND_REUSABLE: NO（原因见下，两条都致命）
```

- 平台：Vercel（响应头 `Server: Vercel`、`X-Vercel-Id: sfo1::…`，区域为美国 sfo）。
- 仓库内**无任何部署配置/授权**：无 `vercel.json`、无 wrangler/cloudflare/netlify 配置；无 `VERCEL_TOKEN` 等环境变量；无 `~/.vercel` 登录态；`vercel whoami` = 需要重新登录；未安装 `gh`；`git remote` 仅 GitHub，且本任务**禁止 push**。→ 无法自主重新部署或设置服务端环境变量。
- 致命点 A — **线上是旧构建，移动端 API 未上线**：`GET https://ielts-practice-data.vercel.app/api/auth/mobile/session` 现网返回 **404**（部署早于 MOBILE-04B；当前分支的 middleware 已把 `/api/auth/mobile/*` 与 `/api/speaking/*` 加白，需重新部署当前 `dashboard-only` 才会出现）。
- 致命点 B — **国内真机不可达**（见 §3）。

## 3. 真机网络可达性实测（完成，无电脑后端参与）

设备自带 `curl`，在当前国内网络直测：

| 目标 | 真机结果 | 判定 |
|---|---|---|
| `https://ielts-practice-data.vercel.app/api/auth/mobile/session` | **http=000，20s 超时**；DNS 解析到 `199.96.62.21`（污染/非 Vercel 正常地址），ping 100% 丢包 | **不可达** |
| `https://nizjfakkmziwanxdcdxd.supabase.co/auth/v1/health` | **http=401，2.35s**（Cloudflare 172.64.149.246；401 为无 key 正常响应） | **可达** |
| `https://api.deepseek.com` | **http=401，0.4s**（112.49.x，国内） | **可达** |

对照：同一台 Windows 上访问 Vercel「成功」是因为 IE/Edge 代理指向本地 `127.0.0.1:10808`（V2Ray/Clash 类）；WinHTTP 为直连。**PC 走代理可达 ≠ 手机国内直连可达**。历史 `docs/audits/DASHBOARD-ONLINE-FINAL-ACCEPTANCE-01.md` §11 也记录该域名 2026-09-13 本机直连 curl 超时。

> 结论：`*.vercel.app` 在当前真机网络不可用；即便重新部署到 Vercel 默认域名，手机 Wi-Fi/5G 仍连不上。本次在 Wi-Fi 下测得；移动网络为同属国内的运营商网络，未单独切换复测（需你手动切一次），但 DNS 污染是网络层面的共性问题，不影响结论方向。

## 4. Phase 2/3 后端生产就绪与 secret 边界（只读完成）

### 4.1 Android 真实依赖的服务端路由（仓库内全部存在）

- Auth：`/api/auth/mobile/login`（POST）、`/session`（GET）、`/logout`、`/register`、`/recovery`、`/magic-link`、`/change-password`
- Speaking：`/api/speaking/session`、`/transcribe`、`/analyze`、`/complete`（另有 `/sessions`）
- 数据：`/api/dashboard/*`、`/api/report`、`/api/goal`、`/api/learning/stats`
- 这些路径已在 `middleware.ts` 的 dashboard-only 白名单内；**重新部署当前分支即可对外**，无需改后端代码或 IA。

### 4.2 真实 provider 形态（与任务假设有一处出入，已据实修正）

- `DATA_PROVIDER=supabase`、`AUTH_MODE=supabase`、`LLM_PRIMARY_PROVIDER=deepseek`（本地 `.env.local`，仅记录取值类别）。
- Analyzer：DeepSeek 官方云 `DEEPSEEK_BASE_URL=https://api.deepseek.com`，真机国内可达；密钥仅服务端。
- **STT（重点出入）**：`app/api/speaking/transcribe` 经 `lib/stt/provider.ts` 选择：
  - `STT_PROVIDER=dashscope` → `DASHSCOPE_API_KEY` + `DASHSCOPE_BASE_URL`(默认 `https://dashscope.aliyuncs.com`) + `DASHSCOPE_ASR_MODEL`(默认 `qwen-audio-3.0-asr-flash`)。
  - 未设置/`openai` → OpenAI 兼容 Whisper：`WHISPER_API_KEY ?? OPENAI_API_KEY` + `WHISPER_BASE_URL`。
  - 当前本地：`STT_PROVIDER` **未设**；`WHISPER_BASE_URL=https://api.openai.com/v1`；**无** `WHISPER_API_KEY/OPENAI_API_KEY`；**无** `DASHSCOPE_API_KEY`（`BAILIAN_API_KEY` 也为空）。且 `api.openai.com` 在国内不可达。
  - 含义：要在国内生产跑通**真实语音**，服务端必须设 `STT_PROVIDER=dashscope` 并提供 **`DASHSCOPE_API_KEY`（当前缺失的新密钥）**。这是 HARD-STOP E（需要你提供新 secret）。

### 4.3 PRODUCTION_ENV_CONTRACT（仅变量名；值由部署平台 secret 管理，绝不入 Git/APK/日志）

服务端必需：
`DATA_PROVIDER=supabase`、`AUTH_MODE=supabase`、`LLM_PRIMARY_PROVIDER=deepseek`、
`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`（publishable，可公开）、
`SUPABASE_SERVICE_ROLE_KEY`（仅服务端）、`SECRET_ENCRYPTION_KEY`（KEK，64 hex，仅服务端）、
`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_FAST_MODEL`、`DEEPSEEK_MAIN_MODEL`、
`STT_PROVIDER=dashscope`、`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`DASHSCOPE_ASR_MODEL`、
`NEXT_PUBLIC_APP_URL=https://<生产域名>`、`DASHBOARD_ALLOWED_EMAILS`、`LOG_LEVEL`。
Android 端只允许持有：公开 backend HTTPS URL 与必要 public/anon config；不得持有任何 service_role / 模型 key / KEK。

> 注：现网 Vercel 项目是否已配置上述服务端变量——**无授权无法核查（UNKNOWN）**；即便已配置，也因 §2/§3 不可复用。

## 5. Phase 9–12 Android 发布管线（只读审计，现状良好）

- `app/build.gradle.kts`：
  - `BuildConfig.LINGXI_BACKEND_BASE_URL`，debug 默认 `http://10.0.2.2:3000`，由 `-PLINGXI_BACKEND_BASE_URL=` 覆盖。
  - **MOBILE-04E guard 在位**：任何含 `Release` 的任务，若未提供 `https://` 前缀的 URL 直接 `throw GradleException`。未删除、应保留。
  - release `signingConfig` 读 `apps/android/keystore.properties`；当前该文件**不存在**（仅有 `keystore.properties.example`），故现在 assembleRelease 产物将是 unsigned。
- 明文流量：`app/src/main/AndroidManifest.xml` **未**设置 `usesCleartextTraffic`、**无** networkSecurityConfig 引用，targetSdk=34 → release **默认禁止明文**；仅 `app/src/debug/AndroidManifest.xml` 为 QA 设 `usesCleartextTraffic=true`。满足「release 仅 HTTPS」。
- 结论：选定可用 HTTPS 域名后，仅需 ①在 repo 外（如 `D:\Codex\_secrets\`）生成 INTERNAL keystore + 本地 `keystore.properties`（不提交、不打印密码）②用真实 HTTPS URL 跑 `assembleRelease`，管线即可产出可安装签名包。**在后端落地前不生成 release APK，避免伪造可达性 / 指向不可达域名。**

## 6. HARD-STOP 判定

按本任务 §2，下列条件被实际命中，必须停下由你决策，我不得代行：

- **A 需购买付费云资源**：要国内稳定可达的 Node 主机（支持 Next route handlers + 服务端 env）。
- **B 需购买域名** + **C 需改真实 DNS**：摆脱被封的 `*.vercel.app` 需要自有域名。
- **D 需创建新的生产收费/实名账号**：当前本机无任何已登录的云平台授权。
- **E 需提供新 secret**：真实国内 STT 需要 `DASHSCOPE_API_KEY`（当前缺失）。
- （备选）**H 核心架构变更**：唯一在真机已验证可达的免费面是 `*.supabase.co`，若改用 Supabase Edge Functions 承载，需把 mobile cookie 会话与 speaking(m4a 多跳) 从 Next 重写为 Deno Edge，属架构重写，不允许我自主进行。

## 7. 候选方案与成本（请你选一档）

| 方案 | 做法 | 成本/门槛 | 国内真机可用性 | 主要权衡 |
|---|---|---|---|---|
| **① 国内 Node 主机 + 备案域名（推荐，最稳）** | 阿里云 ECS/FC 或腾讯云跑 `next build && next start`（Node server），域名 CNAME/A 指入并完成 ICP 备案；服务端按 §4.3 配 env（STT 用 DashScope） | 域名约 ¥55–70/年；ECS 入门约 ¥300–1000/年（FC 有免费额度但仍需实名+备案）；**ICP 备案免费但约 1–3 周**；需实名账号 | 高（备案后直连稳定） | 等待备案；账号/付费/备案必须你本人完成；给我部署机访问后我可全权配置 |
| **② Vercel + 自有域名（不备案，快但不稳）** | 你登录 Vercel 重新部署当前分支并配 env，购买域名 CNAME 到 Vercel | 域名费；Vercel Hobby 可免费；无需备案 | **不保证**：Vercel 自有域名在大陆也常被 SNI 干扰/阻断，手机 5G 尤其可能间歇失败 | 最省事但可能「时通时断」，不满足"作品随时真机演示"的确定性；且要你完成 Vercel 登录 |
| **③ Supabase Edge Functions 重写（无域名/不花钱）** | 把 mobile/speaking API 迁到 `*.supabase.co`（已验证可达）上的 Deno Edge | 无域名/主机费 | 高（supabase.co 当前可达） | 命中架构变更 H：cookie 会话、m4a 多跳、体积/时长限制都要重做与回归；仍需 `DASHSCOPE_API_KEY`；工期与回归风险最大 |
| **④ APK 指 Vercel + 手机挂代理（仅演示，不达标）** | 手机装 VPN/代理访问 vercel | 0 | 依赖代理，**违反 Wi-Fi/5G 直连要求** | 不算独立产品，仅作临时演示；不建议作为发布口径 |

## 8. 需要你提供/决定的输入（解阻塞最小集合）

1. 选档（① / ② / ③ / ④），并由你完成对应的**购买 / 实名 / 备案 / 平台登录**（A/B/C/D）。
2. 部署通道二选一：你在本机登录对应平台 CLI（Vercel/云厂商），或提供受控的临时部署授权（我不会把它写进仓库/报告）。
3. **`DASHSCOPE_API_KEY`**（阿里云百炼/DashScope）用于真实国内 STT；或明确接受方案④的 OpenAI+代理（非独立）。
4. 生产最终访问域名（用于 release base URL、Supabase Site/redirect allowlist、`NEXT_PUBLIC_APP_URL`）。
5. 授权我在生产 Supabase 创建并在结束后清理 **ephemeral QA 用户**（仅其自身数据），用于真实 E2E 与验收。

## 9. 解阻塞后我的执行计划（无需你再逐步确认）

部署可达后：按原任务 Phase 5→8 部署/服务端 probe/HTTPS Secure·HttpOnly·SameSite cookie/邮件回调；Phase 9→13 注入 HTTPS URL、repo 外 INTERNAL keystore、`assembleRelease`、APK 字符串与 secret audit、`adb reverse --remove-all` 后装机；Phase 14→23 真机无电脑登录/session 恢复/真实 voice(DashScope)+text/Analyzer/写回/Report/失败态/logcat 与 APK secret 审计/无电脑 QA；Phase 24→29 QA 清理、`release/` APK + SHA256SUMS、release README、debug+release+单测+tsc 回归（NEW_FAIL=0）、按逻辑提交（**不 push**）、最终报告。视觉冻结页保持零改动（除非发布链路暴露纯功能 bug，做最小修复）。

## 10. 当前 Gate 状态（据实）

```text
ANDROID 发布管线（guard/明文/路由）: READY（仅差真实 HTTPS URL + INTERNAL keystore）
公网 HTTPS 后端（国内可达）:          BLOCKED（HARD-STOP A/B/C/D）
部署授权:                            BLOCKED（本机无任何平台登录/token）
真实 STT 云密钥:                     BLOCKED（HARD-STOP E，需 DASHSCOPE_API_KEY）
RELEASE_BUILD / RELEASE_E2E:         NOT STARTED（后端未落地，不伪造）
MOBILE_STANDALONE_PRODUCT:           BLOCKED
```
