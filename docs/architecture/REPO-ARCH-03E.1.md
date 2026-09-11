# REPO-ARCH-03E.1 — EVAL_ASSET_RECONCILIATION（任务报告）

- 日期：2026-09-11
- Worktree：`D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE`（branch `repo/arch-consolidate`）
- Start HEAD：`acdd905da9f2b88d2940eebd2d88039056dcc22f`
- Eval source：`eval/m3-run-04` @ `8080e1ed048809d9c9907149ca037303f42fc200`（107 files）
- Authoritative M3-04 eval commit：`d58a196`；runner-adapter commit：`7ed2f15`；run-artifact commit：`f651580`

## 1. 结果摘要

| 项 | 值 |
|---|---|
| TESTS_EVAL_PRESENT | YES（56 files） |
| SCRIPTS_EVAL_PRESENT | YES（1 file） |
| DOCS_EVAL_PRESENT | YES（50 files） |
| TOTAL_EVAL_ASSETS | 107 |
| REGISTERED_CASE_COUNT | 39（ELS-EVAL-001..039，case files 41 含 helpers/index） |
| RUN_04_RESULTS_PRESENT | YES（docs/eval/runs/m3-20260910-125036/results.json，run_id 核对一致） |
| BAD_CASE_REGISTRY_PRESENT | YES（docs/eval/bad-case-registry.json） |
| MANUAL_REVIEW_ASSETS_PRESENT | YES（7：006/016/017/018/019/023/030） |
| CASE_019_REGRESSION_ADAPTER_PRESENT | YES（tests/eval/cases/els-eval-019.eval.ts，human-gold-backed regression adapter） |
| CASE_030_REGRESSION_ADAPTER_PRESENT | YES（tests/eval/cases/els-eval-030.eval.ts） |
| SPECIAL_TOOL_ASSETS_PRESENT | YES（docs/eval/special-tool/ 6 + tests/eval/tools/ 3） |
| SOURCE_TARGET_HASH_MATCH | 100%（107/107 git content hash match；eol 说明见 §3） |
| FROZEN_GOLD_INTEGRITY | PASS（0 diff，未修改任何 case/spec/registry/manual-review 文件） |
| EVAL_RUNTIME_EXTERNAL_SOURCE_REFERENCES | 0（tests/scripts）；docs/eval 引用均为历史 run provenance |
| NEW_EVAL_RUN_CREATED | NO |
| BAD_CASE_LIFECYCLE_CHANGED | NO |
| PRODUCT_PATH_DIFF | 0 |
| WEB_TYPECHECK | PASS（tsc --noEmit exit 0） |

## 2. 提取方式

- Commit-level selective extraction：`git restore --source=8080e1e -- tests/eval scripts/eval docs/eval`。
- 未 merge、未 cherry-pick、未 checkout Eval branch 产品树；app/components/lib/supabase 零接触。
- 提取后 `git status --short` 仅含 tests/eval、scripts/eval、docs/eval（untracked 目录级）+ 本任务文档（docs/architecture、docs/handoffs）。

## 3. Hash 完整性（eol 说明）

- 仓库 `core.autocrlf=true`：checkout 将 LF blob 转为 CRLF worktree 文件（源 worktree 同机同配置同为 CRLF，迁移前后工作树字节级一致）。
- 权威内容验证：逐文件 `git hash-object <worktree>` vs `git rev-parse 8080e1e:<path>`（归一化 eol 后比较）→ **107/107 MATCH**。
- manifest 记录双 SHA256：`source_sha256`（源 blob 原始字节）、`target_sha256`（worktree 实际字节，CRLF），每条目 `content_match=true`。
- 产物：`docs/architecture/eval-asset-manifest.json`（107 条，字段含 source_commit/source_path/source_sha256/target_path/target_sha256/category/migrated/verified；category 覆盖 EVAL_CASE/EVAL_RUNNER/EVAL_TOOL/EVAL_DOC/EVAL_RUN_ARTIFACT/EVAL_REGISTRY/EVAL_MANUAL_REVIEW/OTHER_EVAL）。

## 4. 内容完整性核验（只读，未运行 Eval）

- Case 定义：`tests/eval/cases/els-eval-001..039.eval.ts` 全量存在；m3-case-inventory.md：TOTAL_GOLD_CASES 39、REGISTERED 39/39。
- Frozen Gold / human judgment：manual-review 覆盖 006/016/017/018/019/023/030（含任务点名的 006/016/018/019 history）。
- 019/030 regression adapter：由 `7ed2f15`（RUNNER_ADAPTER_COMMIT）引入，已随迁移进入（content 核验：019 为 human-gold-backed，验证矩阵 A–F）。
- Run-04 artifacts：`docs/eval/runs/m3-20260910-125036/results.json`（manifest.run_id=m3-20260910-125036、spec_case_count=39、39 cases、metrics case_level/row_level/coverage/evals）。
- Bad Case Registry：4 条 BC 状态与冻结一致（见 §5）。
- special-tool infra：docs/eval/special-tool/{013,034,039} + tests/eval/tools/{replay-harness,speaking-e2e,ui-e2e}。
- runner coverage doc：docs/eval/m3-runner-coverage.md。
- 结构化验证：spec（ELS_EVALUATION_V1_1.json）、registry、run-04 results、manifest 全部 JSON 可解析；`npx tsc --noEmit` exit 0（eval 系统在 consolidation 产品树上 import 全可解析）。

## 5. Bad Case Registry 状态（与冻结一致，未修改）

| BC | CASE | STATUS | REGRESSION_RUNS |
|---|---|---|---|
| BC-M3-001 | ELS-EVAL-026 | VERIFIED_CLOSED | 4（含 m3-20260910-125036） |
| BC-M3-002 | ELS-EVAL-033 | VERIFIED_CLOSED | 4 |
| BC-M3-003 | ELS-EVAL-030 | FIXED_PENDING_REGRESSION | 1/3（m3-20260910-125036） |
| BC-M3-004 | ELS-EVAL-019 | FIXED_PENDING_REGRESSION | 1/3（m3-20260910-125036） |

REGISTRY_STATE_CONFLICT = NONE。

## 6. 产品边界与历史语义

- PRODUCT_PATH_DIFF = 0（`git diff acdd905 -- app components lib data supabase apps/miniapp apps/android` 为空）。
- 历史 run provenance 保留：run 结果仍归属 product checkpoint `496ae31`；docs/eval 中的历史 worktree 路径（IELTS-eval-m3-run-02/04 等）原样保留，不重写。
- M3 仍 PAUSED；020/023/025/035 保持 UNVERIFIED；未创建新 RUN_ID、未推进 registry lifecycle。

## 7. Commit Map

```
??? chore(eval): absorb repository-level eval system      [COMMIT 1: tests/eval + scripts/eval + docs/eval]
??? chore(repo): record eval asset reconciliation          [COMMIT 2: docs/architecture/* + docs/handoffs/CURRENT-PROJECT-STATE.md]
```

## 8. 未执行（明确禁止项）

- 未运行 full 39-case Eval；未创建新 run/result/lifecycle state。
- 未修改任何 case/spec/registry/manual-review/gold 内容；未改产品代码。
- 未触碰 canonical `D:\Codex\IELTS-practice`、`ielts-monorepo`、`ielts-android`、`IELTS-m2-debug-console`。
- 未读取任何 secret 内容。
