# ARCH-03B Allowlist — 下一阶段允许吸收资产

> 依据 `canonical-asset-manifest.json`（REPO-ARCH-03A 生成，109 条目）导出。
> 仅列出 ARCH-03B 允许从 dirty canonical 吸收到 consolidation branch（base 496ae31）的资产。
> 任何 `CONFLICTS_WITH_VERIFIED_BASE` 的 tracked 文件**不得**进入 WEB_UI_CHANGE_SAFE（本轮不存在此类文件）。

## 1. DASHBOARD_PRODUCT（36，COPY_AS_PRODUCT）

### app/api/dashboard（5）
```
app/api/dashboard/bad-cases/route.ts
app/api/dashboard/lifecycle/[stageId]/route.ts   [ZERO_BYTE, INCOMPLETE]
app/api/dashboard/modules/[moduleId]/route.ts    [ZERO_BYTE, INCOMPLETE]
app/api/dashboard/route.ts
app/api/dashboard/traces/[traceId]/route.ts      [ZERO_BYTE, INCOMPLETE]
```
### app/dashboard（1）
```
app/dashboard/page.tsx
```
### components/dashboard（11）
```
components/dashboard/DashboardPage.tsx
components/dashboard/components/DashboardHeader.tsx
components/dashboard/components/DashboardIcon.tsx
components/dashboard/components/LearningImpactSection.tsx
components/dashboard/components/LifecycleSection.tsx
components/dashboard/components/MetricValue.tsx
components/dashboard/components/OverlayHost.tsx
components/dashboard/components/ProductDiagnosisSection.tsx
components/dashboard/components/ProductHealthSection.tsx
components/dashboard/components/SystemKnowledgeSection.tsx
components/dashboard/dashboard.css
```
### lib/dashboard（14）
```
lib/dashboard/aggregate.ts
lib/dashboard/api-repository.ts
lib/dashboard/dashboard.repository.ts
lib/dashboard/eval-reader.ts
lib/dashboard/layer-labels.ts
lib/dashboard/real-repository.ts
lib/dashboard/types.ts
lib/dashboard/mock/factory.ts
lib/dashboard/mock/index.ts
lib/dashboard/mock/mock-repository.ts
lib/dashboard/mock/ready-30d.ts
lib/dashboard/mock/ready-7d.ts
lib/dashboard/mock/ready-all.ts
lib/dashboard/mock/states.ts
```
### 关联资产（5）
```
lib/auth/dashboard-access.ts
lib/observability/durable-trace-store.ts   [被 dashboard-metrics 测试引用，运行时未接线]
generated/dashboard/latest-eval.json
tests/unit/dashboard-metrics.correctness.test.ts
tests/oracle/dashboard/oracle.ts
```

**验证（每个 DASHBOARD 文件复制后）**：typecheck；build；`vitest run tests/unit/dashboard-metrics.correctness.test.ts`。3 个 0 字节 stub 复制后**保持原样**（IMPLEMENTATION_STATUS=INCOMPLETE），禁止补实现。

## 2. WEB_UI_CHANGE_SAFE（4，COPY_AS_PRODUCT，A 类增量）

已三方比对（working vs 496ae31 vs f0ac513）：496ae31 与 f0ac513 在这 4 个路径上**内容一致**；working 修改为相对 verified base 的纯增量（MODIFIES_VERIFIED_BASE），非 Eval-tree artifact、非旧版本冲突。
```
.gitignore                              [+16：vercel dumps / .workbuddy / scratch / dashboard kit]
components/assistant/assistant-dock.tsx  [+dashboard 遮罩避让 C2]
components/layout/masthead.tsx           [+dashboard 返回 null，C2]
tsconfig.json                            [+exclude scripts/_dashboard_kit_extracted]
```
**验证**：typecheck；build；existing unit suite。

## 3. DOCS（5，COPY_AS_DOC；3 个 handoff 本轮 03B docs commit 吸收）

```
docs/handoffs/M3-PAUSED-STATE.md     [HANDOFF_DOC]
docs/handoffs/REPO-HYGIENE-01.md     [HANDOFF_DOC]
docs/handoffs/REPO-HYGIENE-02.md     [HANDOFF_DOC]
docs/architecture/REPO-ARCH-02-INVENTORY.md  [ARCHITECTURE_DOC — 已随 ARCH-03A commit]
docs/architecture/REPO-ARCH-02-PLAN.md       [ARCHITECTURE_DOC — 已随 ARCH-03A commit]
```
**验证**：file presence + sha256 match。

## 4. REVIEW_REQUIRED（62，暂不自动吸收）

- P4_P7_EVIDENCE=61：根级 P4–P7 审计文档（36）、docs/ELS_EVALUATION_V1*.json/md + docs/v2-system-audit.md（5）、reports/**（12）、scripts/LINGXI_*.zip + scripts/_p21_*.js + 根级 shot-*.mjs（7）→ 目标 `docs/evidence/p4-p7/`（部分保持原路径）；ARCH-03B 内需逐项 review 后 COPY_AS_DOC（单独 docs commit）。
- UNKNOWN=1：`supabase/migrations/0009_p6_instrumentation.sql` → **BLOCKED_ENV-SUPABASE-01**，不得自动吸收；待 Supabase gate 解除后单独评审。

## 5. SECRET_EXCLUDED（2，DO_NOT_COPY_SECRET）

```
vercel-env-production.txt  (1280 B, ignored)  → 不复制，SECRET-HYGIENE-01
vercel-upload.env          (1094 B, ignored)  → 不复制，SECRET-HYGIENE-01
```
（外部 secret 另计：IELTS-m2-debug-console/vercel-env-production.txt、ielts-android/keystore.properties、ielts-android/release-key.jks —— 均不进入 repo。）

## 6. GENERATED_EXCLUDED（8 类，IGNORE_GENERATED）

`.next`、`out`、`playwright-report`、`test-results`、`node_modules`、`.workbuddy`、`scripts/_dashboard_kit_extracted`、`tsconfig.tsbuildinfo` —— 已由 .gitignore 覆盖；不复制、不删除。

## 7. 执行纪律

- Dashboard 与 docs 分 commit（§11 计划）：`feat(dashboard)` + `chore(docs)` 各自独立。
- 本 allowlist 只约束 ARCH-03B；REVIEW_REQUIRED 项未经 review 不得进入 03B 产品 commit。
