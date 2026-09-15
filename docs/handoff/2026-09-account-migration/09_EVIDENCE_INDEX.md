# 09_EVIDENCE_INDEX.md — 证据索引

> 本包引用的可验证证据位置。SORTED BY 领域。
> v2（HANDOFF-02）：新增 Superseded 标记、工作树分类引用。

## A. Android 视觉证据（`docs/evidence/mobile-03d-today-pilot/` + `apps/android/app/`）
| 证据 | 说明 |
|---|---|
| `apps/android/app/r2-android-today-pixel5.png` | Today 393dp 验收截图 |
| `apps/android/app/r2-android-today-narrow.png` | Today 360dp 窄屏 |
| `apps/android/app/r2-android-today-narrow-scrolled.png` | Today 360dp 滚动到底（BottomNav 不遮挡验证） |
| `apps/android/app/speaking-idle/recording/recorded/submitting/error/text.png` | Speaking 六状态 393dp |
| `apps/android/app/speaking-idle-narrow.png` / `speaking-recording-narrow.png` / `speaking-result-summary-narrow.png` | Speaking 360dp 抽查 |
| `apps/android/app/speaking-result-summary.png` / `speaking-result-detail.png` | 结果页（简化/完整） |
| `logo-seal.png` / `r2-canonical-logo.png` | canonical 印章 Logo 对照 |
| `r2-reference.png` / `pilot02-speaking-board.png` | 视觉参考图（施工依据） |
| `final_build.log` / `final_r3_build.log` | Android assembleDebug 历史成功日志（含 JAVA_HOME=JDK 17.0.20+8）——**历史证据，非本轮运行** |

## B. 安全证据（`docs/evidence/mobile-03d-today-pilot/`）
| 证据 | 说明 |
|---|---|
| `auth-sec-01-remote-before-snapshot.json` | 0012 部署前远程快照（历史基线）2026-09-15 |
| `auth-sec-02-remote-inventory.json` | 远程表/列清单 + 探测结果 2026-09-15 |
| `auth-sec-03-before-state.json` | AUTH-SEC-03 BEFORE 状态——**SUPERSEDED_BY_REMOTE_VERIFICATION**（0012 已由外部通道部署并验证，2026-09-15） |

## C. 审计文档（`docs/audits/`）
| 证据 | 说明 |
|---|---|
| `REMOTE-SCHEMA-RECOVERY-01.md` / `-01-deploy.sql` | 远程 schema 恢复包（用户 SQL Editor 通道依据） |
| `REMOTE-SCHEMA-RECOVERY-02.md` | 恢复后验证 |
| `PUBLIC-DASHBOARD-SECURITY-AUDIT-01.md` | 既有 Dashboard 安全审计（工作树未提交，建议入 Commit C） |

## D. 产品文档（`docs/product/`）
| 证据 | 说明 |
|---|---|
| `REMOTE_SCHEMA_RECOVERY_PLAN.md` | 恢复计划（注意其 application_evidence 表述已被 AUTH-SEC-02 实测推翻） |
| `DASHBOARD-RECOVERY-01-CURRENT-STATE.md` | Dashboard 恢复现状 |

## E. 架构/历史交接（`docs/`）
| 证据 | 说明 |
|---|---|
| `docs/architecture/REPO-ARCH-03G-CANONICAL-SWITCH.md` | 旧 canonical 切换记录（分支 repo/arch-consolidate，已非当前） |
| `docs/handoffs/CURRENT-PROJECT-STATE.md` | 旧状态文档（2026-09-12，**已过时**，以本包为准） |
| `docs/implementation-status.md` | 实现状态总览 |
| `docs/v3/` | M1/M2 里程碑文档 |
| `docs/ui-design-handoff.md` | UI 设计交接 |

## F. 测试证据（实时可复跑）
| 证据 | 命令/位置 | 状态 |
|---|---|---|
| Security 24 断言 | `npx vitest run tests/unit/auth-surface-security.test.ts` | PASS（24/24） |
| Web 全量 | `npx vitest run` | 636 PASS / 32 PRE-EXISTING FAIL（9 文件：badcase-019/026/033、product-loop-02d、int-m3-01） |
| Web typecheck | `npm run typecheck` | PASS |
| Android 截图测试 | `apps/android/app/src/test/.../TodayScreenScreenshotTest.kt`、`SpeakingScreenshotTest.kt` | 本轮 NOT_RUN / ENVIRONMENT_BLOCKED（缺 JDK）；历史截图证据见 A |

## G. 代码内证据锚点（给新账号 grep）
- `BAND_SCORE_LEAK` → `lib/llm/tasks/analyze-speaking.ts`、`lib/speaking/feedback-quality.ts`（红线强制回退）
- `IeltsSpeakingAnalysis` → `lib/speaking/types.ts`（无 band 字段）
- `recordApplicationEvidenceFromAnalysis` → `lib/learning/application-evidence.ts`（SSOT 写路径）
- `createServiceRoleClient` → `lib/db/server.ts`（service_role 客户端）
- `requireUser` → `lib/auth/session.ts`（cookie/demo 鉴权）
- `seal.png` → `apps/android/app/src/main/res/drawable/seal.png` + `apps/miniapp/src/assets/seal.png`（canonical Logo）
- `SpeakingMock` → `apps/android/app/src/main/kotlin/com/ielts/app/speaking/SpeakingMock.kt`（Mock 隔离层）

## H. HANDOFF-02 工作树分类
- 全量 30 项分类表：`02_CURRENT_STATE.md` §7
- Canonical commit plan：`02_CURRENT_STATE.md` §8
- Secret scan：`02_CURRENT_STATE.md` §9（PASS）
- Machine state（v1.1）：`10_MACHINE_STATE.json`
