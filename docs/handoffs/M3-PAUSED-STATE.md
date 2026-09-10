# M3 PAUSED STATE — STOPPED-WORKTREE-CLOSE-01

> 用户已明确停止 M3 相关任务，不恢复、不继续施工。本文件只记录暂停事实，不修改 Bad Case Registry，不推进任何 Eval lifecycle。文档写入 canonical docs/handoffs/ 但故意不提交（canonical 在途状态保持原样）。

## STATUS

PAUSED

## Frozen Verified State

- **LAST_VERIFIED_PRODUCT_CHECKPOINT**: `496ae3104c1731b0b30b5ae3acd41ca8d1ff1e6c`（checkpoint: integrate M3 S1 fixes 019 and 030）
- **LAST_VERIFIED_EVAL_RUN**: `m3-20260910-125036`
- **FINAL_VERIFIED_STATUS**: 35 PASS / 0 FAIL / 4 UNVERIFIED / 0 MANUAL_REVIEW
- **REMAINING UNVERIFIED**: 020、023、025、035（本轮及后续暂停期间不处理）

## Paused Branches（branch / commit 已保留在 canonical object DB，worktree 目录已移除）

| Task | Branch | HEAD Commit | Worktree |
|---|---|---|---|
| M3-CAP-020 | `fix/eval-020-trace-contract` | `27910c2273aa910141e4dfd532153c8516432c9e` | D:\Codex\IELTS-cap-020（已安全移除） |
| M3-CAP-RETRIEVAL-01 | `fix/m3-retrieval-contract-closure` | `51af1bbac9ba5280a8ef6bb2d735f09ff2890a1a` | D:\Codex\IELTS-cap-retrieval（已安全移除） |
| EVAL-RUN-M3-04 在途 | `eval/m3-run-04` | `8080e1ed048809d9c9907149ca037303f42fc200` | D:\Codex\IELTS-eval-m3-run-04（SUT overlay 已恢复至 branch HEAD 后安全移除） |

审计结论（移除前逐项实时复核）：
- cap-020：clean，唯一提交 = 27910c2（BC-020 trace contract 修复），无唯一未提交资产。
- cap-retrieval：clean，唯一提交 = 51af1bb（023/025/035 retrieval closure），无唯一未提交资产。
- eval-m3-run-04：Eval 自身资产（tests/eval、scripts/eval、docs/eval、run artifacts）已全部提交于 7ed2f15 → f651580 → d58a196 → 8080e1e 链（ahead of 496ae31 = 8）；工作树中仅存在 SUT overlay（app/components/lib/supabase 产品树与 496ae31 逐字节一致，staged 内容与 496ae31 一致，无 unstaged、无 untracked）。overlay 已恢复至 branch HEAD，无唯一未提交资产。

## Resume Rule

未来若恢复 M3：
- 从保留的 branch / commit（27910c2、51af1bb、8080e1e）与 496ae31 基线继续，**不得重新从头做**。
- 恢复施工时按 Future Worktree Rule 新建 worktree：`D:\Codex\_worktrees\IELTS-practice\<TASK_ID>`。
- 020/023/025/035 仍为 UNVERIFIED，须由独立 Eval Agent 在恢复后判定。

## Notes

- 未删除任何 branch（全部保留于 object DB）。
- 未读取/移动/提交 `vercel-env-production.txt`（IELTS-m2-debug-console，PRESERVE_PENDING_SECRET_REVIEW，处置由 Control Plane 决定）。
- 未触碰 ielts-monorepo / ielts-android（归属 REPO-ARCH-02）。
- 未修改任何产品代码；canonical HEAD/branch/tracked/untracked 前后一致。
