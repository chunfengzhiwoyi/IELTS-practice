# REPO-ARCH-03A — Create Consolidation Base & Asset Manifest（任务报告）

- 日期：2026-09-10
- Base：`496ae3104c1731b0b30b5ae3acd41ca8d1ff1e6c`（LAST VERIFIED PRODUCT CHECKPOINT）
- Worktree：`D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE`
- Branch：`repo/arch-consolidate`

## 1. 结果摘要

| 项 | 值 |
|---|---|
| CONSOLIDATION_HEAD | 496ae31（创建后确认，clean） |
| PRODUCT_DIFF_FROM_496AE31 | 0（`git diff 496ae31 -- app components lib data supabase` 为空） |
| CANONICAL 快照（前/后） | HEAD f0ac513 / branch integration/m3-p1 / tracked modified 4 / untracked 63（`??` 行粒度）——保持未变 |
| MANIFEST 条目 | 109（untracked 89 + tracked modified 4 + secret 2 + 结构 = 95 assets + 说明字段） |
| 分类 | DASHBOARD_PRODUCT=36、P4_P7_EVIDENCE=61、WEB_UI_CHANGE=4、HANDOFF_DOC=3、ARCHITECTURE_DOC=2、UNKNOWN=1（0009）、LOCAL_ENV_OR_SECRET=2 |
| 关系 | ABSENT_IN_VERIFIED_BASE=103、MODIFIES_VERIFIED_BASE=4、NOT_APPLICABLE=2；**无 CONFLICTS、无 IDENTICAL** |
| 0 字节 stub | 3（lifecycle/[stageId]、modules/[moduleId]、traces/[traceId]）→ COPY_AS_PRODUCT + INCOMPLETE |
| Ignored generated | 8 类（.next/out/playwright-report/test-results/node_modules/.workbuddy/scripts/_dashboard_kit_extracted/tsbuildinfo） |

## 2. 关键判定

1. **4 个 tracked modified = A 类有效增量**：`.gitignore`、`components/assistant/assistant-dock.tsx`、`components/layout/masthead.tsx`、`tsconfig.json` 三方比对（working vs 496ae31 vs f0ac513）显示 496ae31 与 f0ac513 在这 4 个路径上内容一致、working 修改为纯增量（Dashboard C2 遮罩避让 + gitignore 卫生 + tsconfig exclude）→ 全部进入 WEB_UI_CHANGE_SAFE。
2. **durable-trace-store.ts**（lib/observability，未跟踪、496ae31 无此文件）被 `tests/unit/dashboard-metrics.correctness.test.ts` import（SupabaseTraceStore）→ 归 DASHBOARD_PRODUCT 组；运行时未接线，复制后不得宣称已启用。
3. **0009_p6_instrumentation.sql**：496ae31 无 0009（基线 0001–0008）→ ABSENT_IN_VERIFIED_BASE；受 ENV-SUPABASE-01 门禁 → UNKNOWN / REVIEW_BEFORE_COPY / BLOCKED_ENV-SUPABASE-01，不自动吸收。
4. **Secret 仅元数据**：vercel-env-production.txt（1280B）、vercel-upload.env（1094B），均 ignored；未读内容、未记 SHA256，DO_NOT_COPY_SECRET。
5. 冻结决策 AC-01..AC-04 已生效，不重新讨论；无新 Control Plane 决策需求。

## 3. 产出（本 commit）

- `docs/architecture/canonical-asset-manifest.json`（109 条目，schema：source_path/source_state/category/source_sha256/source_size/exists_in_verified_base/verified_base_path/relationship_to_496ae31/proposed_action/target_path/migration_phase/validation_after_copy/migrated/verified）
- `docs/architecture/repo-migration-source-map.md`（外部来源映射，只读）
- `docs/architecture/ARCH-03B-ALLOWLIST.md`（下一阶段 allowlist）
- `docs/architecture/REPO-ARCH-03A.md`（本文）
- `docs/architecture/REPO-ARCH-02-INVENTORY.md`、`REPO-ARCH-02-PLAN.md`（既有架构文档并入）

## 4. 未执行（明确禁止）

- 未复制任何 Dashboard / Miniapp / Android 源码；未移动/删除文件；未修改产品代码/import/package.json；未触碰 canonical dirty tree（严格只读）；未读取 secret 内容。
- ARCH-03B 允许复制清单见 allowlist；0009 与 P4–P7 证据未自动吸收。
