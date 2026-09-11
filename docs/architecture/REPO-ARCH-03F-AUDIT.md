# REPO-ARCH-03F-AUDIT — Legacy Source Unique-Asset Final Audit

- Task: REPO-ARCH-03F-AUDIT（SOURCE_RETIREMENT_READ_ONLY_AUDIT）
- Agent: 豆包b
- Mode: PARALLEL_READ_ONLY — **no deletion, no move, no product-code write, no target write**
- Date: 2026-09-11
- Audit branch: `audit/repo-arch-03f`（base `1bdf8fd8561c6b296358764cd786d1a6dcab7719`）
- Audit worktree: `D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-03F-AUDIT`
- Migration target baseline: `D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE` @ `1bdf8fd`（审计期间被豆包a 推进至 `9c3d7da`，唯一增量 = SECRET-HYGIENE-01 secret/docs commit，**不影响源码比较**）

---

## 0. Scope & Method

| Source root | Role |
|---|---|
| `D:\Codex\ielts-monorepo` | Audit A/B/C/D/E（apps/web · apps/mini · packages/core） |
| `D:\Codex\ielts-android` | Audit F（apps/android parity） |
| `D:\Codex\IELTS-m2-debug-console` | Audit G（debug console unique assets） |
| `D:\Codex\IELTS-practice` dirty canonical | NOT in scope（由豆包c 03G PRECHECK 负责） |

方法：所有比对以 **SHA-256 全量哈希** + manifest 双向核验 + canonical git history 追踪为证据。
迁移 manifest 来源：`REPO-ARCH-CONSOLIDATE\docs\architecture\external-source-migration-manifest.json`（175 条目）。

---

## 1. ielts-monorepo 盘点

- Git 状态：仓库存在但 **zero commits**（`main` 无 commit，全部文件 untracked）→ monorepo 自身不携带任何 git history。
- 结构：
  - `apps/web` — Next.js Web（167 个 source-ish 文件，详见 §4）
  - `apps/mini` — Taro 微信小程序（源码 84 个文件入 manifest + 8 个本地工具文件 + 大量 dist/log 产物）
  - `packages/core` — `@ielts/core` 兼容核心（22 个文件，全部入 manifest）
  - 根级：`package.json`（workspaces 脚手架）、`README.md`（脚手架说明）、`.gitignore`；`node_modules` / `.npm-cache` 排除。

---

## 2. Miniapp Migration Parity — **PASS**

比对：`SOURCE=ielts-monorepo/apps/mini` → `TARGET=REPO-ARCH-CONSOLIDATE/apps/miniapp`，参考 manifest。

| 检查项 | 结果 |
|---|---|
| manifest miniapp 条目 | 84 |
| 源磁盘文件命中 manifest | 84 / 84 |
| source hash vs manifest 声称 | **0 mismatch** |
| manifest 条目无对应源文件 | 0 |
| target 文件缺失 | **0** |
| 全量 175 条目 target hash 双向核验 | **0 mismatch** |

**6 条 expected_diff=true 逐项核验（形态符合预期，非资产丢失）：**

| 文件 | 差异 | 分类 |
|---|---|---|
| `project.config.json` | 真实 AppID → `YOUR_WECHAT_APPID` | SECRET_SANITIZED_TARGET |
| `tests/run-e2e.ts` | 硬编码 API key → `YOUR_API_KEY` | SECRET_SANITIZED_TARGET |
| `tests/e2e.cjs` | 硬编码 API key → `YOUR_API_KEY` | SECRET_SANITIZED_TARGET |
| `config/index.ts` | core 路径 `../../../packages/core` → `../core` | EXPECTED_CONFIG_ADAPTATION |
| `package.json` | 依赖/脚本适配（package-lock 新生成） | EXPECTED_CONFIG_ADAPTATION |
| `tsconfig.json` | paths/配置适配 | EXPECTED_CONFIG_ADAPTATION |

**未入 manifest 的 8 个 source-ish 文件（全部 GENERATED_OR_LOCAL，非产品资产）：**
- `preview/index.html`、`preview/profile-redesign.html`、`preview/seal.png` — 本地静态设计预览 mockup（未被 src 引用；产品设计已实现于 `src/pages/**`）
- `scripts/_probe.js`、`scripts/_smoke.js`、`scripts/_smoke2.js` — 本地 jsdom 调试/smoke 脚本（引用 dist 产物）
- `shot-mini.mjs`、`shot-mini-nav.mjs` — 本地截图工具

其余 855 个未入 manifest 文件全部为 `dist*`/`dist_trash*`/`dist-h5*`/`dist-verify*`/日志/构建产物 → GENERATED_OR_LOCAL。

**MINIAPP_UNMIGRATED_UNIQUE_COUNT = 0**

---

## 3. Compatibility Core Audit — **PASS**

比对：`SOURCE=ielts-monorepo/packages/core` → `TARGET=apps/miniapp/core`。

| 检查项 | 结果 |
|---|---|
| core 源文件 | 22 |
| manifest core 条目 | 22 |
| source hash vs manifest | **0 mismatch** |
| target 缺失 | **0** |

所有 Miniapp 实际依赖的 core source（src/auth · client · config · learning · llm-catalog · mini-service · plan · review · seed · server · speaking · storage）已全部迁入 `apps/miniapp/core`。

**Seed 关系精确核验（发现 manifest 头部表述不精确，记录为文档准确性提示）：**
- `apps/miniapp/core/src/seed/*.json` == `packages/core/src/seed/*.json`（**hash-identical，迁移精确**）
- git-blob 核验（03F-INTEGRATE 阶段，git hash-object）：compat seed == `data/seed/*.json`（**git-normalized/blob content 一致**；byte-level working-tree SHA256 差异由 CRLF/LF 行尾引起，非内容差异）
- manifest 头部 "hash-identical to canonical data/seed" 在 git-blob 层成立；"unreferenced by app runtime bundle" 不精确 —— `apps/miniapp/core/src/mini-service.ts` L5/L6 直接 import seed JSON，且 `config/index.ts` alias 使 Taro 构建会拉入 compat core。
- 影响：compat 快照与 canonical SEED_SSOT 内容一致（git-blob 层），不存在数据新鲜度分叉；compat seed 与源 1:1 一致 ⇒ 不算唯一资产。

**CORE_UNMIGRATED_UNIQUE_COUNT = 0**

---

## 4. apps/web 历史分类 — **STALE_PARTIAL_COPY（确认）**

- 167 个 source-ish 文件：164 个在 target 根级同路径存在但为**旧版本**（抽查 `lib/speaking/types.ts` +42/-1、`app/api/agent/message/route.ts` +124/-36、`components/home/today-zone.tsx` +26/-25 → target 全部为演进超集）。
- 3 个 target 根级缺席文件：

| 缺席文件 | 处置 |
|---|---|
| `components/home/assistant-margin.tsx` | 现行等价实现 `components/assistant/assistant-dock.tsx`（详见 §5） |
| `docs/implementation-status.md` | stale 文档；内容已在 canonical git history（`ec78581` 起） |
| `docs/ui-design-handoff.md` | stale 文档；内容已在 canonical git history（`d29f75a`） |

- 无任何 target/canonical 中不存在的唯一产品资产。
- 原则确认：**DO_NOT_MIGRATE**。

---

## 5. assistant-margin.tsx Final Review

- 真实路径：`D:\Codex\ielts-monorepo\apps\web\components\home\assistant-margin.tsx`（17 行，普通源码，非 secret）
- 内容：静态 wrapper —— `section.companion`（灵 monogram + 「学习助手」 + status-dot + 「随时在」）内嵌 `<ChatSection />`；无 state、无 handler、无自身交互语义。
- 使用位置：仅旧首页 `apps/web/app/page.tsx`。
- 对比 canonical/consolidation：
  - `components/assistant/assistant-dock.tsx`（layout.tsx 全站接线）：右下角悬浮气泡 + 展开 dialog 面板 + ChatSection（fill）+ **真实 LLM 在线状态**（offline/online/检查中）+ Escape 收起 + 路由隐藏 + `role="dialog"` a11y —— 覆盖并超越旧组件全部价值。
  - `components/home/llm-home-status.tsx`（首页）：替代旧「随时在」静态状态为真实 LLM 状态。
- 逐项结论：

| 维度 | 结论 |
|---|---|
| FUNCTION | 首页 margin 区 chat 助手头部 wrapper（静态） |
| CURRENT_EQUIVALENT | AssistantDock（assistant-dock.tsx）+ LlmHomeStatus（llm-home-status.tsx）；ChatSection 本身已在 target 演进 |
| UNIQUE_BEHAVIOR | **无** —— 旧组件零交互/零状态；唯一静态文案「随时在」已被真实状态取代 |
| RECOMMENDED_DISPOSITION | DO_NOT_MIGRATE（REBUILDABLE_REFERENCE） |
| EVIDENCE | 旧组件源码（17 行，无逻辑）+ target 两份等价组件源码 + 接线位置（layout.tsx / page.tsx） |

**A = REBUILDABLE_REFERENCE**（非 B，无 CONTROL_PLANE_DECISION_REQUIRED）

---

## 6. Monorepo 唯一资产穷尽

排除：node_modules / .npm-cache / .next / dist* / build / logs / Git metadata / generated / stale web duplicate / secret-bearing。

| 候选 | 判定 |
|---|---|
| apps/mini 全部源码 + config + scripts + tests + assets | 84/84 已迁移 hash 一致 |
| packages/core 全部源码 | 22/22 已迁移 hash 一致 |
| apps/web 全部 | STALE_PARTIAL_COPY，lineage 全在 canonical git history |
| apps/mini 8 个本地工具文件（preview/_probe/shot-mini） | GENERATED_OR_LOCAL，非产品资产 |
| monorepo 根 scaffold（package.json/README/.gitignore） | 已被 target 结构取代，非产品资产 |

**MONOREPO_NON_SECRET_UNIQUE_ASSET_COUNT = 0**

---

## 7. Android Source Parity — **PASS**

比对：`SOURCE=D:\Codex\ielts-android`（**非 git 仓库**）→ `TARGET=apps/android`。

| 检查项 | 结果 |
|---|---|
| 磁盘文件（排除构建产物） | 173 |
| manifest android 条目（allowlist） | 69 |
| source hash vs manifest 声称 | **69/69 一致（0 mismatch）** |
| target 缺失 | **0** |
| 全量 target hash 双向核验 | 0 mismatch |

**104 个未入 manifest 文件全部命中排除类**：`.verify/**`（验证截图/脚本 = temporary tooling）、`.jdk.zip`/`.jdk_home`（toolchain，已由 03E.2 迁为机器级 `D:\Codex\_toolchains\java\jdk-17.0.20+8`，路径已验证存在）、`keystore.properties`+`release-key.jks`（SECRET）、`local.properties`（本地配置）、`*.log`、`*.bat`（临时工具）、`repro_learn.py`/`repro_out.txt`（临时工具）。

**03D 后新增普通源码检查**：源文件 mtime 最晚 2026-08-19，manifest 生成于 2026-09-11，且当前 source hash 与 manifest 声称完全一致 → **迁移后无新增普通源码**。

**ANDROID_UNMIGRATED_NON_SECRET_SOURCE_COUNT = 0**
**ANDROID_JDK_SOURCE_BLOCKER = CLEARED**（03E.2 toolchain 就位）

---

## 8. Debug Console Audit

`D:\Codex\IELTS-m2-debug-console` = canonical 仓库的 git worktree，branch `feature/m2-debug-console` @ `011dfbc`。

- 工作区状态：tracked 树干净；untracked 仅 `vercel-env-production.txt`（SECRET）；ignored 含 `.env.local`（LOCAL_ENV）、`.next/`、`tsconfig.tsbuildinfo`。
- **consolidation 覆盖核验**：debug 专属内容（`app/debug`、`lib/debug`、`components/debug`、`tests/unit/m2-console-*` + `m2-trace-*`、`supabase/migrations/0003-0008`、`lib/ability`、`lib/evaluation`、`lib/auth/wechat*`、`app/api/secrets*`、`app/api/debug*`、`trace-store.ts` 等）**全部存在于 target @ 1bdf8fd**。
- `git diff 011dfbc 1bdf8fd`（debug 专属路径）：仅 4 文件 +61/-3，全部为 consolidation 侧演进（canonicalKey 字段、BC-034 trace contract、retention 注释）→ consolidation 为超集，**无 debug 独有内容丢失**。
- **Git history 核验**：`011dfbc` 未 merge 进 mainline（main / integration/m3-p1 / repo/arch-consolidate 均不含该 commit 为祖先），但：
  1. branch `feature/m2-debug-console` + commits 完整保留于 canonical 仓库；
  2. 同内容已以 `cb05778`（同名 commit message "Phase 3A minimal debug console"）重新落入 mainline 历史。

**DEBUG_CONSOLE_NON_SECRET_UNIQUE_ASSET_COUNT = 0**

---

## 9. Secret Assets（SECRET_ASSET 记录 — 仅路径/存在/大小，无内容）

| SECRET_ASSET | PATH | EXISTS | SIZE |
|---|---|---|---|
| Android signing properties | `D:\Codex\ielts-android\keystore.properties` | YES | 95 B |
| Android release keystore | `D:\Codex\ielts-android\release-key.jks` | YES | 2758 B |
| Debug-console prod env dump | `D:\Codex\IELTS-m2-debug-console\vercel-env-production.txt` | YES | 1280 B |
| Debug-console local env | `D:\Codex\IELTS-m2-debug-console\.env.local` | YES | 1892 B |
| Miniapp 真实 AppID config | `D:\Codex\ielts-monorepo\apps\mini\project.config.json` | YES | — |
| Miniapp secret-bearing E2E (ts) | `D:\Codex\ielts-monorepo\apps\mini\tests\run-e2e.ts` | YES | — |
| Miniapp secret-bearing E2E (cjs) | `D:\Codex\ielts-monorepo\apps\mini\tests\e2e.cjs` | YES | — |

**SECRET-HYGIENE-01 状态：RESOLVED**（豆包a 已提交 `9c3d7da`；11 项敏感资产已 COPY 至 Git 外 vault `D:\Codex\_secrets\IELTS-practice`，本审计已做元数据级核实：vault 存在、11 个文件大小与记录一致、未读取内容）。
- `ANDROID_SECRET_PRESERVATION_BLOCKER = CLEARED`
- `MONOREPO_SECRET_PRESERVATION_BLOCKER = CLEARED`
- `DEBUG_CONSOLE_SECRET_PRESERVATION = CLEARED`
- 遗留动作（SECRET-HYGIENE-01 §Remaining）：legacy miniapp API key **provider 侧轮换/吊销（ROTATION_RECOMMENDED，未执行）**；删除前最终 secret sweep。

---

## 10. History Preservation

| 源 | 自身 git | 内容在 canonical/consolidation 的保留 |
|---|---|---|
| ielts-monorepo | zero commits（无历史） | YES —— web lineage 在 canonical（`ec78581` MVP 0.1 起）；mini/core 已 commit 于 `repo/arch-consolidate@1bdf8fd` |
| ielts-android | 非 git 仓库 | YES —— 69/69 已 commit 于 consolidation |
| IELTS-m2-debug-console | canonical worktree，branch `feature/m2-debug-console` | YES —— branch+commits 保留；同内容经 `cb05778` 在 mainline 历史 |

**HISTORY_PRESERVED_IN_GIT = YES**（建议：目录退休时不得删除 branch/history，只清 filesystem）。

---

## 11. Retirement Classification

| 目录 | 分类 | 依据 |
|---|---|---|
| `ielts-monorepo` | **READY_FOR_RETIREMENT_DECISION** | 0 唯一资产；secret 已外置（vault 核实）；删除前需最终 sweep + key 轮换 |
| `ielts-android` | **READY_FOR_RETIREMENT_DECISION** | 0 漏迁源码；.jdk 已由 03E.2 解耦；signing secret 已外置 |
| `IELTS-m2-debug-console` | **READY_FOR_RETIREMENT_DECISION** | 0 非 secret 唯一资产；env secret 已外置；branch/history 保留于 canonical |

（无 KEEP / BLOCKED_UNIQUE_ASSET；本任务不给 DELETED —— 未执行删除。）

---

## 12. Source Directory Deletion Plan（仅设计，NOT_EXECUTED）

> 本任务未执行任何 destructive command；以下为未来安全删除顺序建议。

1. **前置**：SECRET-HYGIENE-01 follow-up 最终 sweep（确认 vault 完整 + 无残余 secret 副本）；执行 legacy miniapp API key 轮换。
2. `IELTS-m2-debug-console`（git worktree）→ `git worktree remove`（先 `git worktree list` 确认；branch `feature/m2-debug-console` 保留于 canonical，不清 branch/commits）。**NOT_EXECUTED**
3. `ielts-android`（非 git 普通目录）→ filesystem delete（或先归档压缩再删）。**NOT_EXECUTED**
4. `ielts-monorepo`（zero-commit 普通目录）→ filesystem delete（内容已全部保留于 canonical/consolidation）。**NOT_EXECUTED**

---

## 13. Consolidation Integrity

- **SOURCE_DIRS_UNCHANGED = YES**（审计全程对三个源目录零写入；hash/mtime 复核一致）
- **TARGET_UNCHANGED = YES**（源码比较基线 `1bdf8fd`；期间 target 唯一推进为 `9c3d7da` secret/docs commit：`apps/android/keystore.properties.example` + `SECRET-HYGIENE-01.md` + `CURRENT-PROJECT-STATE.md`，不触及产品源码路径）
- **PRODUCT_CODE_MODIFIED = NO**
- **FILES_DELETED = 0**

---

## 14. Control Plane Notes（非阻塞）

1. **manifest/REPO-MAP 文档准确性**：`external-source-migration-manifest.json` 头部与 `CURRENT-REPO-MAP.md` 关于 compat seed 的表述已修订（03F-INTEGRATE / DOC-ABSORB-01）—— git-blob 核验显示 compat seed == canonical `data/seed`（内容一致；字节 SHA256 差异仅由 CRLF/LF 行尾引起），且被 `mini-service.ts` 直接引用（"unreferenced" 表述不精确）。修订不影响源目录退休判定。
2. **legacy miniapp API key 轮换**：SECRET-HYGIENE-01 已保留快照并建议轮换；轮换属 provider 侧动作，未执行。

---

## 15. Audit Commit

- `docs/architecture/REPO-ARCH-03F-AUDIT.md` 提交于 `audit/repo-arch-03f`（base 1bdf8fd）。
- 未 merge，未触碰产品代码。
