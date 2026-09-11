# REPO-ARCH-03F-RETIRE — Legacy Source Retirement（任务报告）

- 日期：2026-09-11
- Worktree：`D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-03F-RETIRE`
- Branch：`chore/repo-arch-03f-retire`
- Base：`9c3d7dae4f730ae074cdab1d3721f0a3dde0c8c0`
- Mode：PARALLEL_DESTRUCTIVE_CONTROLLED
- 前置依据：REPO-ARCH-03F-AUDIT（豆包b）、SECRET-HYGIENE-01（豆包a）、REPO-ARCH-03E.2、REPO-ARCH-03G-PRECHECK（豆包c）

## 1. Frozen Control Plane Decisions

| 项 | 决策 |
|---|---|
| ielts-monorepo | RETIREMENT_AUTHORIZED |
| ielts-android | RETIREMENT_AUTHORIZED |
| IELTS-m2-debug-console | RETIREMENT_AUTHORIZED |
| assistant-margin.tsx | REBUILDABLE_REFERENCE / DO_NOT_MIGRATE |
| legacy miniapp API key rotation | RECOMMENDED / NOT_BLOCKING_RETIREMENT |
| compat seed doc discrepancy | NOT_BLOCKING_RETIREMENT |

## 2. Preflight — Vault Verification（VAULT_VERIFIED = YES）

- Vault root：`D:\Codex\_secrets\IELTS-practice`（machine-local，Git 外，无 git init）— exists。
- 11 项外置目标 **pre 与 post 两次元数据验证全部 exists + expected size 一致**（未读取任何内容）：

| 类别 | Vault 目标 | 大小（B） |
|---|---|---|
| ANDROID_SIGNING | android\keystore.properties | 95 |
| ANDROID_SIGNING | android\release-key.jks | 2758 |
| ANDROID_LOCAL_CONFIG | android\local.properties | 55 |
| DEPLOYMENT_ENV | vercel\debug-console-vercel-env-production.txt | 1280 |
| LOCAL_ENV | vercel\debug-console-env.local | 1892 |
| DEPLOYMENT_ENV | vercel\canonical-vercel-env-production.txt | 1280 |
| DEPLOYMENT_ENV | vercel\canonical-vercel-upload.env | 1094 |
| LOCAL_ENV | vercel\canonical-env.local | 1892 |
| MINIAPP_PRIVATE_CONFIG | miniapp\project.config.original.json | exists |
| LEGACY_SECRET_BEARING_SNAPSHOT | miniapp\legacy-secret-bearing\run-e2e.original.ts | exists |
| LEGACY_SECRET_BEARING_SNAPSHOT | miniapp\legacy-secret-bearing\e2e.original.cjs | exists |

删除前 source 侧同项复核（仅大小）：keystore 95B / jks 2758B / local.properties 55B 与 Vault 逐项一致。**无缺失 → 未触发 STOP。**

## 3. Preflight — Toolchain Verification（TOOLCHAIN_VERIFIED = YES）

- `D:\Codex\_toolchains\java\jdk-17.0.20+8\bin\java.exe`：exists，可运行，`java -version` = openjdk 17.0.20。
- 独立于 `D:\Codex\ielts-android\.jdk`（03E.2 LOCAL_TOOLCHAIN_SNAPSHOT，机器级）。删除 Android 不依赖旧 .jdk → 未触发 STOP。

## 4. Preflight — Final Unique Asset Recheck（SOURCE_UNIQUE_ASSET_RECHECK = PASS）

基于 03F-AUDIT 结论快速复核（不重做完整审计）：
- 三个目录自 03F audit 时间戳（2026-09-11 20:38）后 **新增普通文件数 = 0 / 0 / 0**（排除 node_modules/.next/dist/build/.gradle/.verify/.npm-cache 等生成物）。
- debug-console git 状态与 audit 一致：tracked clean；untracked 仅 `vercel-env-production.txt`；ignored 仅 `.env.local` / `.next/` / `tsconfig.tsbuildinfo`。
- **MONOREPO_NON_SECRET_UNIQUE_ASSET_COUNT = 0（03F 确认，复核通过）**
- **ANDROID_UNMIGRATED_NON_SECRET_SOURCE_COUNT = 0（03F 确认，复核通过）**
- **DEBUG_CONSOLE_NON_SECRET_UNIQUE_ASSET_COUNT = 0（03F 确认，复核通过）**
- 未发现新源码 → 未触发 STOP。

## 5. Preflight — Reparse/Symlink Safety

| 目标 | dir | reparse point | linkType | 判定 |
|---|---|---|---|---|
| D:\Codex\ielts-monorepo | True | False | — | 普通目录，安全 |
| D:\Codex\ielts-android | True | False | — | 普通目录，安全 |
| D:\Codex\IELTS-m2-debug-console | True | False | — | 普通目录，安全 |

精确全路径（无 wildcard）删除。无异常 → 未触发 STOP。

## 6. Retirement Execution

### 6.1 IELTS-m2-debug-console（git worktree）— REMOVED

- `git worktree list --porcelain` 确认注册（branch `feature/m2-debug-console` @ 011dfbc）。
- 首次正常 `git worktree remove` → exit 128（含 untracked/ignored 文件），**未使用 --force**。
- 按授权清理该 worktree 内已明确分类的 4 项（前提全部满足：secret 已在 Vault 验证、generated 非唯一）：
  - `vercel-env-production.txt`（SECRET，Vault `vercel\debug-console-vercel-env-production.txt` 1280B ✓）
  - `.env.local`（LOCAL_ENV，Vault `vercel\debug-console-env.local` 1892B ✓）
  - `.next/`（GENERATED，非唯一）
  - `tsconfig.tsbuildinfo`（GENERATED，非唯一）
- 再次 `git worktree remove` → exit 0，路径不再存在。
- **未使用 --force；未 `git branch -D`。**
- **DEBUG_CONSOLE_BRANCH_PRESERVED = YES**：`git show-ref --verify refs/heads/feature/m2-debug-console` → `011dfbc96ba482693b2836a02c3d2c3867cb4ba6`。

### 6.2 ielts-android（非 Git 普通目录）— REMOVED

- 前置：69/69 migrated source evidence（03F）+ Vault signing assets exists（95/2758/55 逐项匹配）+ external toolchain exists。
- 删除精确路径 `D:\Codex\ielts-android`（-LiteralPath，无 wildcard）→ exit 0，**Test-Path = False**。
- ANDROID_SOURCE_REMOVED = YES。

### 6.3 ielts-monorepo（zero-commit 普通目录）— REMOVED

- 前置：84 miniapp + 22 core migrated（03F）；assistant-margin = DO_NOT_MIGRATE；0 unique asset；3 个 miniapp secret 快照（project.config.original.json / run-e2e.original.ts / e2e.original.cjs）Vault 存在 ✓。
- zero-commit 仓库，无独立 Git history 需保留。
- 删除精确路径 `D:\Codex\ielts-monorepo`（-LiteralPath，无 wildcard）→ exit 0，**Test-Path = False**。
- MONOREPO_SOURCE_REMOVED = YES。

## 7. Protected Paths Hard Gate（删除前后）

| 受保护路径 | pre | post |
|---|---|---|
| D:\Codex\IELTS-practice | True | True |
| D:\Codex\_secrets\IELTS-practice | True | True（11/11 复验） |
| D:\Codex\_toolchains\java\jdk-17.0.20+8 | True | True |
| D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE | True | True（HEAD 9c3d7da，clean） |

**全部存在，无变化 → 未触发 FAIL。**

## 8. Worktree Registry

- `git worktree prune`（exit 0）——仅清理 stale metadata。
- 注册表（post）：IELTS-m2-debug-console **已不存在**；剩余 7 个 worktree（canonical / 03F-AUDIT / 03F-RETIRE / 03G-PRECHECK / CONSOLIDATE / DOC-ABSORB-01 / SUPABASE-0009-DEFER-01，后两者为并行 Control-Plane 任务）。
- `feature/m2-debug-console` branch 保留（ref 存在，011dfbc）。

## 9. Canonical / Vault / Toolchain / Consolidation Integrity

| 项 | 值 |
|---|---|
| CANONICAL_SOURCE_UNCHANGED | YES（HEAD f0ac513 / branch integration/m3-p1 / 4 modified + 63 untracked，前后一致） |
| SECRET_VAULT_UNCHANGED | YES（11/11 pre/post 元数据一致） |
| TOOLCHAIN_UNCHANGED | YES（外部 JDK 未触碰） |
| CONSOLIDATION_UNCHANGED | YES（HEAD 9c3d7da，status clean；本任务零写入 consolidation） |
| PRODUCT_CODE_MODIFIED | NO |
| FILESYSTEM_RETIREMENT_ERRORS | 0 |

## 10. assistant-margin.tsx Disposition

- 处置：DO_NOT_MIGRATE / REBUILDABLE_REFERENCE（03F-AUDIT §5 终审：17 行静态 wrapper，零交互；现行等价 = `components/assistant/assistant-dock.tsx` + `components/home/llm-home-status.tsx`，覆盖并超越）。
- 源目录已删；重建依据在 consolidation（assistant-dock.tsx + llm-home-status.tsx + layout.tsx 接线）。

## 11. Remaining（NOT executed，记录）

- Legacy miniapp API key **provider 侧轮换/吊销**：RECOMMENDED，NOT_BLOCKING_RETIREMENT，未执行。
- compat seed doc 准确性修订（03F Control-Plane Note 1）：NOT_BLOCKING。

## 12. 输出与提交

- 本文件：`docs/architecture/REPO-ARCH-03F-RETIRE.md`
- 提交：`chore/repo-arch-03f-retire`（仅本文件，未 merge）
- 未触碰：IELTS-practice / _secrets / _toolchains / 任何 audit·consolidation·parallel worktree。

---

## AGENT_HANDOFF

| 字段 | 值 |
|---|---|
| AGENT | 豆包c |
| TASK_ID | REPO-ARCH-03F-RETIRE |
| STATUS | COMPLETED |
| VAULT_VERIFIED | YES（11/11，pre+post 元数据） |
| TOOLCHAIN_VERIFIED | YES（OpenJDK 17.0.20，外部 toolchain） |
| DEBUG_CONSOLE_PATH | D:\Codex\IELTS-m2-debug-console |
| DEBUG_CONSOLE_REMOVED | YES |
| DEBUG_CONSOLE_BRANCH_PRESERVED | YES（refs/heads/feature/m2-debug-console @ 011dfbc） |
| ANDROID_SOURCE_PATH | D:\Codex\ielts-android |
| ANDROID_SOURCE_REMOVED | YES |
| MONOREPO_SOURCE_PATH | D:\Codex\ielts-monorepo |
| MONOREPO_SOURCE_REMOVED | YES |
| ASSISTANT_MARGIN_DISPOSITION | DO_NOT_MIGRATE_REBUILDABLE_REFERENCE |
| SOURCE_UNIQUE_ASSET_RECHECK | PASS（3 目录 0 unique；audit 后 0 新增普通文件） |
| PROTECTED_CANONICAL_PRESENT | YES |
| PROTECTED_VAULT_PRESENT | YES |
| PROTECTED_TOOLCHAIN_PRESENT | YES |
| PROTECTED_CONSOLIDATION_PRESENT | YES |
| WORKTREE_REGISTRY_AFTER | 7 worktrees（IELTS-m2-debug-console 已注销） |
| FILESYSTEM_RETIREMENT_ERRORS | 0 |
| CANONICAL_SOURCE_UNCHANGED | YES |
| PRODUCT_CODE_MODIFIED | NO |
| RETIREMENT_DOC | docs/architecture/REPO-ARCH-03F-RETIRE.md |
| RETIREMENT_COMMIT | chore/repo-arch-03f-retire |
| READY_FOR_FINAL_INTEGRATION | YES |
