# REPO-HYGIENE-02 — SAFE WORKTREE CLEANUP

> 硬性约束遵守：仅使用 `git worktree remove` 删除；未使用 rm -rf / Remove-Item -Recurse / 资源管理器删除；未执行 git reset --hard / clean / stash / checkout . / restore . / branch -D；未修改 canonical 仓库任何内容；文档写入 canonical docs/handoffs/ 但**故意不提交**（canonical 在途状态保持原样）。

## Pre-Cleanup Inventory（EXACT_INVENTORY，删除前重新生成）

全部 24 个目录逐一实测（存在性 / registry 注册 / HEAD / branch / dirty / untracked / HEAD 是否在 object DB）：

| PATH | EXISTS | REGISTERED | HEAD | BRANCH | DIRTY | UNTRACKED | CLASSIFICATION |
|---|---|---|---|---|---|---|---|
| IELTS-practice | True | True | f0ac513 | integration/m3-p1 | 4 | 60 | MAIN_REPO |
| IELTS-cap-020 | True | True | 27910c2 | fix/eval-020-trace-contract | 0 | 0 | ACTIVE |
| IELTS-cap-retrieval | True | True | 51af1bb | fix/m3-retrieval-contract-closure | 0 | 0 | ACTIVE |
| IELTS-eval-m3-run-04 | True | True | 8080e1e | eval/m3-run-04 | 8 | 0 | ACTIVE |
| IELTS-m2-debug-console | True | True | 011dfbc | feature/m2-debug-console | 0 | 1 | PRESERVE_PENDING_SECRET_REVIEW |
| IELTS-badcase-008 | True | True | c353425 | fix/eval-008-empty-boundary | 0 | 0 | HISTORICAL |
| IELTS-badcase-019 | True | True | 622ee32 | fix/eval-019-hallucination-gate | 0 | 0 | HISTORICAL |
| IELTS-badcase-026 | True | True | 4d33a37 | fix/eval-026-retrieval-conflict | 0 | 0 | HISTORICAL |
| IELTS-badcase-030 | True | True | 9940b69 | fix/eval-030-report-baseline | 0 | 0 | HISTORICAL |
| IELTS-badcase-033 | True | True | 79537c7 | fix/eval-033-error-contract | 0 | 0 | HISTORICAL |
| IELTS-badcase-034 | True | True | 138839d | fix/eval-034-audio-metadata-trace | 0 | 0 | HISTORICAL |
| IELTS-badcase-035 | True | True | 7ffdfa4 | fix/eval-035-code-only | 0 | 0 | HISTORICAL |
| IELTS-eval-m2-run-02 | True | True | 7ff7fc1 | eval/m2-run-02 | 0 | 0 | HISTORICAL |
| IELTS-eval-m3-run-02 | True | True | 760afde | eval/m3-run-02 | 0 | 0 | HISTORICAL |
| IELTS-eval-m3-run-03 | True | True | 2df0749 | eval/m3-run-03 | 0 | 0 | HISTORICAL |
| IELTS-eval-m3-special-tools | True | True | d3e4edf | eval/m3-special-tools | 0 | 0 | HISTORICAL |
| ielts-eval-runner | True | True | 782a9e5 | feature/eval-runner-phase0 | 0 | 0 | HISTORICAL |
| ielts-eval-runner-current | True | True | e91f0ad | eval-runner-current | 0 | 0 | HISTORICAL |
| IELTS-integration-m2-01 | True | True | 43364c3 | integration/m2-01 | 0 | 0 | HISTORICAL |
| IELTS-integration-m3-01 | True | True | c189539 | integration/m3-01 | 0 | 0 | HISTORICAL |
| IELTS-integration-m3-02 | True | True | 083230d | integration/m3-02 | 0 | 0 | HISTORICAL |
| IELTS-integration-m3-03 | True | True | 9fb1d54 | integration/m3-03 | 0 | 0 | HISTORICAL |
| ielts-monorepo | True | False | — | — | — | — | SPECIAL (独立空 git repo) |
| ielts-android | True | False | — | — | — | — | SPECIAL (非 git 工程) |

### Inventory Reconciliation

- **ACTUAL_TOTAL_DIRECTORIES = 24**
- **ACTUAL_LINKED_WORKTREES_EXCLUDING_MAIN = 21**
- **ACTUAL_ACTIVE_WORKTREES = 3**（cap-020、cap-retrieval、eval-m3-run-04）
- **ACTUAL_HISTORICAL_WORKTREES = 18**（17 clean + 1 secret-pending）
- **ACTUAL_SPECIAL_DIRECTORIES = 2**（ielts-monorepo、ielts-android）

账目闭合：`24 = 1(main) + 21(linked) + 2(special)`；`21 = 3(active) + 18(historical)`。

**INVENTORY_MISMATCH_ROOT_CAUSE（REPO-HYGIENE-01 的偏差）**：
R01 将 HISTORICAL_WORKTREES 与 SAFE_TO_REMOVE_COUNT 报告为 19，正确值为 **18**。根因：m2-debug-console 在 R01 中被重复计数（既出现在“非干净状态”分节，又计入汇总 SAFE_TO_REMOVE_COUNT），多计 1。纠正后 24 目录账目完全一致，无任何无法解释的目录。

注：IELTS-cap-020 在两次盘点之间由 dirty=4/untracked=1 变为 clean（HEAD 496ae31→27910c2，BC-020 在途工作已被该活跃任务提交），不影响分类。

## Preserve Set（本轮无条件保留，7 个）

| PATH | 理由 |
|---|---|
| D:\Codex\IELTS-practice | canonical repo（含 4 tracked 修改 + 60 untracked 在途资产，完整保持） |
| D:\Codex\IELTS-cap-020 | 当前活跃 M3 capability task（已提交至 27910c2） |
| D:\Codex\IELTS-cap-retrieval | 当前活跃 M3 capability task |
| D:\Codex\IELTS-eval-m3-run-04 | Eval 工作区在途 staged 状态（dirty=8），不得触碰 |
| D:\Codex\ielts-monorepo | 含未迁入 canonical 的唯一代码（微信小程序、@ielts/core、wechat bridge） |
| D:\Codex\ielts-android | 完整 Android 工程 + 本地签名资产，未迁入 canonical |
| D:\Codex\IELTS-m2-debug-console | 存在唯一 untracked 敏感文件，PRESERVE_PENDING_SECRET_REVIEW |

## Safe Remove Set（17 个，全部通过 §5 safety gate A–G）

IELTS-badcase-008 / 019 / 026 / 030 / 033 / 034 / 035、IELTS-eval-m2-run-02、IELTS-eval-m3-run-02、IELTS-eval-m3-run-03、IELTS-eval-m3-special-tools、ielts-eval-runner、ielts-eval-runner-current、IELTS-integration-m2-01、IELTS-integration-m3-01、IELTS-integration-m3-02、IELTS-integration-m3-03

Gate 证据（每项在删除前实时复核）：均为 IELTS-practice 注册 linked worktree；不在 Frozen Keep Set；`git status --porcelain` 为空（dirty=0）；无 untracked files（untracked=0）；`git cat-file -e <HEAD>^{commit}` 通过（objdb=YES）；无唯一未提交资产；非 active task。

## Removed Worktrees（17/17 成功，REMOVE_EXIT_CODE=0）

| PATH | HEAD | BRANCH | REMOVE_EXIT_CODE |
|---|---|---|---|
| IELTS-badcase-008 | c353425 | fix/eval-008-empty-boundary | 0 |
| IELTS-badcase-019 | 622ee32 | fix/eval-019-hallucination-gate | 0 |
| IELTS-badcase-026 | 4d33a37 | fix/eval-026-retrieval-conflict | 0 |
| IELTS-badcase-030 | 9940b69 | fix/eval-030-report-baseline | 0 |
| IELTS-badcase-033 | 79537c7 | fix/eval-033-error-contract | 0 |
| IELTS-badcase-034 | 138839d | fix/eval-034-audio-metadata-trace | 0 |
| IELTS-badcase-035 | 7ffdfa4 | fix/eval-035-code-only | 0 |
| IELTS-eval-m2-run-02 | 7ff7fc1 | eval/m2-run-02 | 0 |
| IELTS-eval-m3-run-02 | 760afde | eval/m3-run-02 | 0 |
| IELTS-eval-m3-run-03 | 2df0749 | eval/m3-run-03 | 0 |
| IELTS-eval-m3-special-tools | d3e4edf | eval/m3-special-tools | 0 |
| ielts-eval-runner | 782a9e5 | feature/eval-runner-phase0 | 0 |
| ielts-eval-runner-current | e91f0ad | eval-runner-current | 0 |
| IELTS-integration-m2-01 | 43364c3 | integration/m2-01 | 0 |
| IELTS-integration-m3-01 | c189539 | integration/m3-01 | 0 |
| IELTS-integration-m3-02 | 083230d | integration/m3-02 | 0 |
| IELTS-integration-m3-03 | 9fb1d54 | integration/m3-03 | 0 |

删除后逐一确认目录已不存在。所有相关 branch ref 保留在 canonical object DB（未执行 branch -D），历史 commit 未丢失。

## Failed / Skipped Removes

- REMOVE_FAILED_COUNT = 0
- Skipped（按规则不删）：IELTS-m2-debug-console（敏感文件在途，PRESERVE_PENDING_SECRET_REVIEW）

## Sensitive File Metadata（未读取内容）

- PATH：`D:\Codex\IELTS-m2-debug-console\vercel-env-production.txt`
- exists=True；size_bytes=1280；last_modified=2026-08-20 11:40:01
- SHA256：`996F9C444E52EF63EDFA9AB32743FE2137296699B7B0897B215BE142E9024D45`
- 内容未读取、未写入任何文档、未提交。处置（归档/销毁）由 Control Plane 决定。

## Post-Cleanup Registry（worktree list --porcelain，共 5 项）

```
worktree D:/Codex/IELTS-practice            HEAD f0ac513   branch integration/m3-p1
worktree D:/Codex/IELTS-cap-020             HEAD 27910c2   branch fix/eval-020-trace-contract
worktree D:/Codex/IELTS-cap-retrieval       HEAD 51af1bb   branch fix/m3-retrieval-contract-closure
worktree D:/Codex/IELTS-eval-m3-run-04      HEAD 8080e1e   branch eval/m3-run-04
worktree D:/Codex/IELTS-m2-debug-console    HEAD 011dfbc   branch feature/m2-debug-console
```

## Canonical Integrity Check（清理前后比对，完全一致）

| 项目 | Before | After | 状态 |
|---|---|---|---|
| HEAD | f0ac5131828ddddadf5231779ed262319f1f034b | 同 | unchanged |
| branch | integration/m3-p1 | 同 | unchanged |
| tracked changes | 4 | 4 | unchanged |
| untracked | 60 | 60 | unchanged |

未触碰：Dashboard、P4–P7 docs、现有 UI 修改、tsconfig、.gitignore。

## Future Worktree Convention

- 已创建：`D:\Codex\_worktrees\IELTS-practice`（空目录结构）
- 今后新 worktree 统一创建于 `D:\Codex\_worktrees\IELTS-practice\<TASK_ID>`（如 `M3-CAP-020`）
- 禁止继续生成 `D:\Codex\IELTS-badcase-xxx` / `IELTS-eval-xxx` / `IELTS-integration-xxx` 根目录 sibling
- 当前 3 个 active worktree 不移动，任务完成后由各自 Integration/cleanup task 按同一规范删除
- 独立永久资产（ielts-monorepo、ielts-android）本轮仅确认保留，未 git init / add / commit / 移动 / 复制 / 合并；归属 REPO-ARCH-02

## Next Gate

REPO-ARCH-02（monorepo / android / 小程序迁移规划与实施）
