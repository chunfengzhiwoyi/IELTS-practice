# 02_CURRENT_STATE.md — 仓库与工作树当前状态

> TIMESTAMP：2026-09-15 21:xx（UTC+8）｜ 全部来自 `git` 与文件系统实时读取。
> v2（HANDOFF-02）：新增 §7 工作树全量分类、§8 canonical commit plan、§9 secret scan 结果；修订 Supabase 状态标记。

## 1. Git 状态

```
CURRENT_BRANCH  = dashboard-only
CURRENT_HEAD    = 69b5517 fix(auth): dashboard auth flow — forgot-password toast,
                  origin-based recovery redirect, reset page polish
UPSTREAM        = origin/dashboard-only（同步，ahead/behind = 0/0）
WORKTREE_STATE  = DIRTY（30 项）
```

## 2. 工作树变更明细（git status --porcelain，30 项）

### Modified（5，均为 Android，来自 MOBILE-03D 系列，未提交）
| 文件 | 内容 |
|---|---|
| `apps/android/app/build.gradle.kts` | PILOT 构建配置（Roborazzi/测试依赖）+13 |
| `apps/android/app/src/main/kotlin/com/ielts/app/nav/Navigation.kt` | BottomNav 五项 + 路由（Today 酒红 active）±20 |
| `apps/android/app/src/main/kotlin/com/ielts/app/screens/SpeakingScreen.kt` | Speaking Shell（PILOT-02）±745 |
| `apps/android/app/src/main/kotlin/com/ielts/app/screens/TodayScreen.kt` | Today R2/R3 视觉 ±478 |
| `apps/android/app/src/main/kotlin/com/ielts/app/theme/Theme.kt` | 暖纸白/酒红/暖铜 Design Tokens +5 |

### Untracked（25，分组）
| 组 | 文件 | 说明 |
|---|---|---|
| Android 截图 | `apps/android/app/*.png`（r2-android-today-* 3 + speaking-* 13 = 16 张） | Robolectric 渲染验收图 |
| Android 新源码 | `SpeakingResultDetailScreen.kt`、`SpeakingResultScreen.kt`、`speaking/`（SpeakingMock/SpeakingState）、`src/test/`（2 个截图测试 + simhei.ttf） | PILOT-02 产物 |
| 安全 | `supabase/migrations/0012_auth_surface_security_hardening.sql`、`tests/unit/auth-surface-security.test.ts`、`scripts/security/` | AUTH-SEC 系列产物 |
| 文档 | `docs/audits/PUBLIC-DASHBOARD-SECURITY-AUDIT-01.md`、`docs/handoff/2026-09-account-migration/`（10 文件） | 审计 + 交接包 |
| 证据 | `docs/evidence/mobile-03d-today-pilot/`（含 8 个证据 json/png + 若干日志/临时脚本） | 见 §7 分类 |
| 历史 | `tests/unit/dashboard-login-v10-handoff.zip` | 旧登录 v10 交接归档 |
| CLI 缓存 | `supabase/.temp/cli-latest`（8 字节 "v2.117.0"） | 不入库 |

## 3. LOCAL_ONLY_COMMITS
无——当前分支与 origin 同步（0/0）。

## 4. REMOTE_RELATIONSHIP
- origin = `https://github.com/chunfengzhiwoyi/IELTS-practice.git`（已推送分支：dashboard-only 同步；另有 main、repo/arch-consolidate）

## 5. 关键环境事实（新账号必须知道）

| 项 | 值 | SOURCE |
|---|---|---|
| Web 测试 | `npm test` = `vitest run`；typecheck = `tsc --noEmit`；lint = `eslint . --max-warnings=0` | `package.json` |
| 环境变量 | `.env.local`（gitignore 第 21-22 行）：NEXT_PUBLIC_SUPABASE_URL/ANON_KEY、SUPABASE_SERVICE_ROLE_KEY、LLM_*、WECHAT_*、AUTH_MODE、DATA_PROVIDER、SECRET_ENCRYPTION_KEY 等 | `git check-ignore -v` + 键名检查 |
| DATA_PROVIDER | `supabase`（生产）/ `memory`（demo） | `lib/repository-factory.ts` |
| AUTH_MODE | `supabase` / `demo` | `lib/auth/session.ts` |
| supabase CLI | 无全局安装；npx 缓存 v2.117.0 可用但**未登录/未 link** | `supabase/.temp/cli-latest` |
| JDK（Android 构建） | **缺失**：JAVA_HOME=`D:\AI-Models\Andorid Studio\jbr`（路径不存在）→ Android 构建当前不可运行（本轮 NOT_RUN / ENVIRONMENT_BLOCKED，不修 JDK） | 本轮实测 |
| Android SDK | `C:\Users\34394\AppData\Local\Android\Sdk`（local.properties） | `apps/android/local.properties` |

## 6. 已知 DRIFT（docs vs 现状）
- `docs/handoffs/CURRENT-PROJECT-STATE.md`（2026-09-12 更新）声称 CANONICAL_BRANCH=`repo/arch-consolidate`——**已过时**：当前在 `dashboard-only`。
- `docs/product/REMOTE_SCHEMA_RECOVERY_PLAN.md` 曾列 `application_evidence` 为远程存在——**实测不存在**（AUTH-SEC-02，2026-09-15）。
- AUTH-SEC-03 报告「0012 BLOCKED」——**已 SUPERSEDED_BY_REMOTE_VERIFICATION**（2026-09-15 外部核验 DEPLOYED_AND_VERIFIED）。
- 以本包 + 实时 `git`/只读探测为准。

## 7. 工作树全量分类（HANDOFF-02，30 项逐项）

> 类别：CANONICAL_CODE / CANONICAL_TEST / CANONICAL_MIGRATION / CANONICAL_DOC / EVIDENCE / TEMPORARY / GENERATED / UNKNOWN

| # | PATH | STATUS | CATEGORY | SHOULD_COMMIT | REASON |
|---|---|---|---|---|---|
| 1 | apps/android/app/build.gradle.kts | M | CANONICAL_CODE | YES | Roborazzi/测试依赖构建配置，PILOT 必需 |
| 2 | apps/android/app/.../nav/Navigation.kt | M | CANONICAL_CODE | YES | BottomNav 五项 + 路由，冻结产品结构 |
| 3 | apps/android/app/.../screens/SpeakingScreen.kt | M | CANONICAL_CODE | YES | Speaking Shell 主屏（PILOT-02 冻结） |
| 4 | apps/android/app/.../screens/TodayScreen.kt | M | CANONICAL_CODE | YES | Today R3 视觉（PILOT-01 冻结） |
| 5 | apps/android/app/.../theme/Theme.kt | M | CANONICAL_CODE | YES | MOBILE_DESIGN_SYSTEM_V1 Tokens |
| 6-8 | apps/android/app/r2-android-today-*.png (3) | ?? | EVIDENCE | YES | Today 视觉验收截图（393/360/滚动） |
| 9-21 | apps/android/app/speaking-*.png (13) | ?? | EVIDENCE | YES | Speaking 六状态+结果页验收截图 |
| 22 | apps/android/app/.../screens/SpeakingResultScreen.kt | ?? | CANONICAL_CODE | YES | 结果摘要页（Mock fixture 消费） |
| 23 | apps/android/app/.../screens/SpeakingResultDetailScreen.kt | ?? | CANONICAL_CODE | YES | 完整分析页（Mock fixture 消费） |
| 24 | apps/android/app/.../speaking/SpeakingState.kt | ?? | CANONICAL_CODE | YES | 状态机（InputMode/RecordingState）冻结 |
| 25 | apps/android/app/.../speaking/SpeakingMock.kt | ?? | CANONICAL_CODE | YES | Mock 隔离层（后续替换为真实 Recorder/AI） |
| 26 | apps/android/app/src/test/（2 测试 + fonts/simhei.ttf） | ?? | CANONICAL_TEST | YES | Today/Speaking Robolectric 截图测试 |
| 27 | supabase/migrations/0012_...hardening.sql | ?? | CANONICAL_MIGRATION | YES | 安全加固（已远程部署，入库保证 canonical） |
| 28 | tests/unit/auth-surface-security.test.ts | ?? | CANONICAL_TEST | YES | 24 断言安全回归 |
| 29 | scripts/security/remote-auth-surface-snapshot.mjs | ?? | CANONICAL_CODE | YES | 只读远程快照工具（无 secret，运行时读 .env.local） |
| 30 | docs/audits/PUBLIC-DASHBOARD-SECURITY-AUDIT-01.md | ?? | CANONICAL_DOC | YES | 既有安全审计交付物 |
| 31 | docs/handoff/2026-09-account-migration/（10 文件） | ?? | CANONICAL_DOC | YES | 本交接包 |
| 32-39 | docs/evidence/.../auth-sec-01/02/03.json + logo-seal.png + r2-canonical-logo.png + r2-reference.png + pilot02-speaking-board.png | ?? | EVIDENCE | YES | 安全/视觉证据与参考图（施工依据） |
| 40-46 | docs/evidence/.../r2-*/speaking-* png 副本 | ?? | EVIDENCE | 可选 | 与 apps/android/app 下截图重复，可去重后只留一处 |
| 47+ | docs/evidence/.../*.log（final_*/spk_*/test_run*/sdk_install） | ?? | TEMPORARY | NO | 构建/测试日志，历史验证证据不属 canonical |
| 47+ | docs/evidence/.../_fix_*.py _patch_*.py _r3_*.py shot.js | ?? | TEMPORARY | NO | 一次性修补脚本，不得入库 |
| 47+ | docs/evidence/.../zoom/（9 张裁剪分析图） | ?? | TEMPORARY | NO | 视觉审查中间裁剪 |
| 47+ | docs/evidence/.../today-page-preview.html/.png | ?? | GENERATED | NO | 早期 HTML mock，非真实产物 |
| — | supabase/.temp/cli-latest | ?? | TEMPORARY | NO | CLI 版本缓存（建议加入 .gitignore） |
| — | tests/unit/dashboard-login-v10-handoff.zip | ?? | TEMPORARY | 可选 | 旧登录交接归档（内容已被 repo 覆盖） |

> 注：表格第 32-47+ 行按 `docs/evidence/mobile-03d-today-pilot/` 内文件逐项归类；30 项 = 5 M + 25 ??（git 层面），evidence 目录内部逐文件再细分为可提交证据与临时文件。

## 8. 建议 canonical commit plan（未执行，待批准）

### Commit A — Android Today/Speaking UI + tests
- FILES：Modified 5 + SpeakingResult/SpeakingResultDetail/SpeakingState/SpeakingMock + src/test/ + 16 张截图（或截图并入 evidence 保留在 docs）
- WHY：MOBILE-03D 完整视觉交付（Today R3 + Speaking Shell），一条主线
- DEPENDENCIES：无（纯 Android 侧）

### Commit B — Auth surface security migration + tests + tooling
- FILES：0012 migration + auth-surface-security.test.ts + scripts/security/ + docs/evidence/mobile-03d-today-pilot/auth-sec-*.json
- WHY：AUTH-SEC 安全包（0012 已远程部署，入库保证 canonical + 可审计）
- DEPENDENCIES：先于/独立于 Commit A

### Commit C — Account migration handoff docs
- FILES：docs/handoff/2026-09-account-migration/（10 文件）+ docs/audits/PUBLIC-DASHBOARD-SECURITY-AUDIT-01.md
- WHY：交接包 + 既有审计文档归档
- DEPENDENCIES：A/B 之后（包内引用其状态）

### 不提交
- supabase/.temp/（建议追加 .gitignore 条目）、*.log、_fix_*.py 等临时脚本、zoom/、today-page-preview.*、dashboard-login-v10-handoff.zip（可选）

## 9. Secret scan（HANDOFF-02）
- 扫描范围：全部 Modified + Untracked（含 scripts/security、evidence、migration、测试、handoff）
- 模式：JWT (eyJ…)、sbp_*、DATABASE_URL/postgresql://、sk-*、BEGIN PRIVATE KEY
- 结果：**PASS——未发现真实凭据**（auth-sec-02 中 2 处 "DATABASE_URL" 仅为叙述性文字「Agent 无 CLI token / DATABASE_URL」）
- `.env` / `.env.local` 确认 gitignore（第 21-22 行）
- 结论：无 BLOCKER；无 secret 需清除。
