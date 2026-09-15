# 01_PROJECT_HANDOFF.md — 灵犀 IELTS 项目交接总览

> 交接日期：2026-09-15（UTC+8）
> 交接性质：账号迁移（ChatGPT / Agent 账号更换）——PROJECT STATE RECOVERY + HANDOFF
> 原则：仓库事实 > docs > 测试证据 > 历史报告 > 聊天总结
> 版本：v2（HANDOFF-02 修订——写入外部核验 Supabase 状态、重排 Gate）

## 1. 项目身份

| 项 | 值 | SOURCE |
|---|---|---|
| 项目名 | 灵犀 IELTS（英语高效学习助手） | `package.json` name=english-learning-agent |
| 仓库 | github.com/chunfengzhiwoyi/IELTS-practice.git（origin） | `git remote -v` |
| 本地工作区 | `D:\Codex\IELTS-practice` | 本包生成环境 |
| 当前分支 | `dashboard-only` | `git branch --show-current` |
| 当前 HEAD | `69b5517 fix(auth): dashboard auth flow — forgot-password toast, origin-based recovery redirect, reset page polish` | `git log -1 --oneline` |
| 与 origin 关系 | 与 `origin/dashboard-only` 同步（ahead/behind = 0/0） | `git rev-list --left-right --count` |
| 工作树 | **DIRTY（30 项未提交）**——分类表见 02_CURRENT_STATE.md §7 | `git status --porcelain` |
| 其他分支 | `main`、`repo/arch-consolidate`（历史施工分支，当前不在其上） | `git log --decorate` |

## 2. 项目构成（CANONICAL_PATHS）

| 层 | 路径 | 技术栈 | 状态 |
|---|---|---|---|
| Web 全栈 | `app/` `lib/` `components/` `middleware.ts` | Next.js (App Router) + TypeScript | ACTIVE |
| 移动端 | `apps/android/` | Kotlin + Jetpack Compose + Robolectric/Roborazzi | ACTIVE（视觉/UI 施工中） |
| 小程序 | `apps/miniapp/` | Taro (React) | ACTIVE（既有，未在近期主线） |
| 共享核心 | `apps/android/core/` | Kotlin 纯逻辑（learning/speaking 领域模型） | ACTIVE |
| 数据库 | `supabase/migrations/`（0001–0012） | SQL | ACTIVE（0012 已远程部署；schema 仍有缺口） |
| 测试 | `tests/`（unit/eval/e2e/oracle/fixtures/stubs） | Vitest + Playwright | ACTIVE |
| 文档 | `docs/`（architecture/audits/product/evidence/handoffs/v3） | Markdown | ACTIVE |
| 脚本 | `scripts/` | TS/JS/Python | ACTIVE |
| 数据 | `data/knowledge` `data/seed` | JSON 知识库/种子 | ACTIVE |
| 生成物 | `generated/dashboard`、`out/` | dashboard-only 静态导出 | ACTIVE（部署产物） |
| 遗留 | `.next/` `playwright-report/` `test-results/` `node_modules/` | 构建缓存 | IGNORED（.gitignore） |

## 3. 一条主线速览（2026-09 施工史，以 git log 为证）

1. **dashboard-only 分支**（当前）：Dashboard 登录/报告在线化 + 远程 Supabase schema 恢复（RSR-01/RSR-02）→ HEAD=69b5517。
2. **PRODUCT-LOOP-04 系列**（已在 main/repo-arch-consolidate 历史）：Speaking→Vocabulary Evidence 全链（04A–04F）。
3. **MOBILE-03D 系列**（工作树未提交）：Android Today 视觉试制（PILOT-01 R1→R2→R3）+ Speaking 前端 Shell（PILOT-02）。
4. **AUTH-SEC 系列**：00 方案 → 01 实施包 → 02 部署预检 → 03 部署 Gate（原 BLOCKED）→ **0012 已由外部通道部署并验证（DEPLOYED_AND_VERIFIED，2026-09-15）**。

## 4. 当前最重要状态（速览）

| 领域 | 状态 | 详见 |
|---|---|---|
| Web 产品 | IMPLEMENTED/VERIFIED（dashboard-only 部署形态） | 03 |
| Android UI | Today R3 + Speaking Shell 完成（Robolectric 截图已验收） | 04 |
| Android 真实能力 | Recorder/Auth/HTTP/Transcribe/Analyze 均 **NOT_IMPLEMENTED**（仅 Mock） | 04 |
| Speaking 后端 | 全链 IMPLEMENTED；**无 IELTS Band**（BAND_SCORE_LEAK 红线强制安全回退） | 05 |
| Application Evidence | Web 侧写路径 IMPLEMENTED；**远程表未部署**（AUTH-SCHEMA-04 缺口） | 05/06 |
| Supabase 安全 | **0012 DEPLOYED_AND_VERIFIED**（RLS ON、revoke 全生效、函数 search_path=''） | 06 |
| Supabase schema | **REMOTE_BEHIND**（0008§1/§2 + 0010 缺口）→ engineering gate | 07 |
| 当前产品 Gate | **Speaking Result V2 Design Review**（Analyzer 不支持 Band/stable strengths/逐句） | 07 |
| 当前工程 Gate | **AUTH-SCHEMA-04**（补缺口→equality→repair→恢复 workflow） | 07 |
| 测试 | Web 636 PASS/32 PRE-EXISTING FAIL；Android NOT_RUN（缺 JDK，环境阻塞） | 09 |

## 5. 新账号第一步（强制）

先读本包 08_NEW_ACCOUNT_BOOTSTRAP_PROMPT.md，按其中脚本执行：
`git status` / `git log` / 对照 10_MACHINE_STATE.json 逐项核对 → 输出 HANDOFF_DRIFT 后再动任何代码。
**第一轮禁止改代码。**
