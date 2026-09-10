# REPO-ARCH-03B — Absorb Canonical Uncommitted Assets（任务报告）

- 日期：2026-09-10
- Worktree：`D:\Codex\_worktrees\IELTS-practice\REPO-ARCH-CONSOLIDATE`（branch `repo/arch-consolidate`）
- Start commit：`5fc0f92`（ARCH-03A 基线）

## 1. 复制结果

| 组 | 数量 | 说明 |
|---|---|---|
| DASHBOARD_PRODUCT | 36 + 3 | 36 项首批复制 + 3 项 detail route（见 §2 修正） |
| WEB_UI_CHANGE_SAFE | 4 | .gitignore / tsconfig.json / assistant-dock.tsx / masthead.tsx |
| HANDOFF_DOC | 3 | M3-PAUSED-STATE / REPO-HYGIENE-01 / REPO-HYGIENE-02 |
| **合计** | **46** | 全部 SOURCE_SHA256 = TARGET_SHA256（hash 逐项校验通过） |

未复制：secret（2，仅元数据）、P4_P7_EVIDENCE（61，保持 REVIEW）、0009 migration（1，ENV-SUPABASE-01 门禁）、generated（8 类，gitignore 覆盖）。

## 2. ⚠ 前提修正：3 个 "0-byte stub" 实际为已实现

- **事实**：`app/api/dashboard/lifecycle/[stageId]/route.ts`（1421B）、`modules/[moduleId]/route.ts`（1369B）、`traces/[traceId]/route.ts`（669B）在 canonical 中**含真实实现**，LastWriteTime 2026-09-10 20:53–20:54（早于本会话）。
- **根因**：ARCH-03A 用 `Get-Item`/`Get-FileHash` 的 `-Path` 通配符语义读取含 `[stageId]` 的路径 → 括号被当作字符类，读取失败被当作 0 字节/无 hash；03B 复制循环同因静默跳过这 3 个文件（`fail=0` 是假阴性）。
- **处置**：用 `-LiteralPath` 正确复制（hash 匹配），typecheck + build + dashboard 测试全部 PASS，路由已进入 `.next` app-paths-manifest（5 个 dashboard API 路由齐全）。manifest 3 条目已修正（真实 size/hash，migrated/verified=true）。
- **结论**：AC-03 中 "3 个 0-byte stub → INCOMPLETE" 的记录不成立；当前实现 = `IMPLEMENTED`（既有 canonical 资产吸收，非本任务新增代码）。**无 0 字节 stub 遗留**。
- **上报**：NEW_CONTROL_PLANE_DECISIONS_REQUIRED = 1（stub premise correction；0-byte stub 后续是否仍需正式实现评审由 Control Plane 定）。

## 3. Durable Trace Store Safety Audit

- A. 496ae31 无此文件 ✓
- B. 唯一 import：`tests/unit/dashboard-metrics.correctness.test.ts`（SupabaseTraceStore）✓
- C. 无 production runtime（app/lib/components/middleware）import ✓
- D. 独立类（自带 TraceStore 接口），仅 import trace-contract 类型；不替换/覆盖现有 trace-store / trace context / request tracing ✓
- E. 不改 M2 product behavior ✓
- **判定**：DASHBOARD-ONLY → SAFE，允许复制（已复制，90 行）。

## 4. Zero-Byte Stub 处理

- 3 个 detail route 均已实现且验证通过 → **ZERO_BYTE_DASHBOARD_STUBS = 0**（原 3 个记录经核实为通配符读取假象）。
- 无 blocking build 情形；未补写任何代码（实现为 canonical 既有内容）。

## 5. Validation

| 项 | 结果 |
|---|---|
| typecheck（tsc --noEmit） | PASS（exit 0，含 3 detail routes） |
| next build | PASS（exit 0；/dashboard 5.95 kB；5 个 dashboard API routes + /dashboard/page 在 app-paths-manifest） |
| dashboard-metrics.correctness.test.ts | 38/38 PASS |
| 全量 unit suite | 398/399 PASS；唯一失败 = **预存在 llm-safety.test.ts**（line 158，静态检查 violation：components/account/ModelSettingsPanel.tsx import @/lib/llm——与 INT-M3-03 历史签名一致，非新增） |
| BEHAVIOR_CRITICAL_DIFF_AUDIT | `git diff 496ae31 HEAD -- lib/llm lib/speaking lib/review lib/agent lib/knowledge lib/client/report-transform.ts components/report` = **0 行** |
| 全量 diff（496ae31..HEAD） | 46 文件 +5734/-3（dashboard + web UI + docs） |

## 6. Commit Map（repo/arch-consolidate）

```
5fc0f92 chore(repo): establish consolidation base and asset manifest   [ARCH-03A]
1bfa8bb feat(dashboard): absorb existing dashboard assets             (36 文件)
9002df4 chore(web): absorb verified dashboard integration changes     (4 文件)
90e25f3 chore(docs): absorb approved repository architecture docs     (3 文件)
???      feat(dashboard): absorb dashboard detail routes (lifecycle/modules/traces)
???      chore(repo): update asset manifest migration status
```

## 7. Manifest 状态

- 总资产 109：**migrated=45 / verified=45**（40 product + 3 detail routes + 2 architecture docs）；未迁移保持 false（secret 2、0009 1、P4_P7 61、BUILD_ARTIFACT 类不列入资产表）。
- 3 个 detail route 条目已修正 source_size/source_sha256/target_sha256。

## 8. Canonical Integrity

- 前后：HEAD f0ac513 不变 / branch integration/m3-p1 不变 / tracked modified 4 不变 / untracked 63 不变。
- 全程未读 secret 内容；未移动/删除任何 canonical 文件；未修改 496ae31 已验证产品行为。
