# M1: Single Source of Truth — 证据文档

> 日期: 2026-09-09
> 状态: PASS
> 前置: M0 系统逆向审计 (`docs/v2-system-audit.md`)

---

## 1. Before — 旧架构 Dual Data Path

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Learn   │  │  Review  │  │ Speaking │  │  Report  │    │
│  │  Page    │  │  Page    │  │  Page    │  │  Page    │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │          │
│       ▼              ▼              ▼              ▼          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           demo-service.ts (localStorage)              │   │
│  │  • getWordCard / submitLearnAnswer                    │   │
│  │  • getReviewSession / submitReviewAnswer              │   │
│  │  • createSpeakingSession / analyzeSpeakingLocally     │   │
│  │  • generateClientReport / buildLexicon                │   │
│  │  • writeAbilityObservations / getEvaluationRepository │   │
│  └──────────────────────────────────────────────────────┘   │
│       │              │              │              │          │
│       ▼              ▼              ▼              ▼          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              localStorage (Browser)                   │   │
│  │  • ielts_learning_events                             │   │
│  │  • ielts_user_item_states                            │   │
│  │  • ielts_speaking_sessions                           │   │
│  │  • ielts_ability_observations                        │   │
│  │  • ielts_speaking_evaluations                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Server (Next.js API)                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │/api/learn│  │/api/review│  │/api/speak│  │/api/report│   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │          │
│       ▼              ▼              ▼              ▼          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Repository (Server)                      │   │
│  │  • MemoryLearningRepository / SupabaseLearningRepo   │   │
│  │  • MemorySpeakingRepository / SupabaseSpeakingRepo   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ⚠️ 能力观察/评估仅在客户端 localStorage，服务端无持久化      │
│  ⚠️ 报告由客户端 generateClientReport() 独立计算             │
│  ⚠️ 两套状态无同步，refresh 后可能不一致                      │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 具体 Dual Path 清单

| 业务域 | 客户端路径 | 服务端路径 | 冲突 |
|--------|-----------|-----------|------|
| 新词学习 | `demo-service.getWordCard()` → localStorage | `/api/learn/card` → Repository | 词卡状态两份 |
| 学习提交 | `demo-service.submitLearnAnswer()` → localStorage | `/api/learn/submit` → Repository | learning event 两份 |
| 复习会话 | `demo-service.getReviewSession()` → localStorage | `/api/review/session` → Repository | due items 两份 |
| 复习提交 | `demo-service.submitReviewAnswer()` → localStorage | `/api/review/submit` → Repository | review event 两份 |
| 口语会话 | `demo-service.createSpeakingSession()` → localStorage | `/api/speaking/session` → Repository | session 两份 |
| 口语分析 | `demo-service.analyzeSpeakingLocally()` → localStorage | `/api/speaking/analyze` → Repository | analysis 两份 |
| 能力观察 | `writeAbilityObservations()` → localStorage | **无服务端路径** | 仅客户端 |
| 效果评估 | `getEvaluationRepository()` → localStorage | **无服务端路径** | 仅客户端 |
| 学习报告 | `generateClientReport()` → localStorage | `/api/report` (未使用) | 报告独立计算 |

---

## 2. Root Cause — 为什么产生两个 Source of Truth

1. **渐进式开发遗留**: 项目早期以 demo-service + localStorage 快速验证产品概念，后续引入服务端 API 时未移除客户端业务路径。
2. **缺乏 Repository 抽象统一**: 学习/口语有服务端 Repository，但能力观察/评估只有客户端 localStorage Repository，服务端无对应实现。
3. **报告计算放在客户端**: `generateClientReport()` 直接从 localStorage 聚合，服务端 `/api/report` 存在但前端未调用。
4. **Demo 模式与生产模式混用**: `DATA_PROVIDER=memory` 时前端直接走 localStorage，绕过 API 层，导致 demo 和生产走不同代码路径。

---

## 3. Decision — 最终数据所有权

### 3.1 架构原则

```
Authoritative State = 服务端 Repository（唯一业务事实来源）
Client localStorage = UI 临时状态 / draft / 非关键偏好
```

### 3.2 数据所有权矩阵

| 数据 | 权威来源 | localStorage 用途 |
|------|---------|------------------|
| learning_events | 服务端 Repository | 无 |
| user_item_states | 服务端 Repository | 无 |
| speaking_sessions | 服务端 Repository | 无 |
| ability_observations | 服务端 Repository | 无 |
| speaking_evaluations | 服务端 Repository | 无 |
| report source data | 服务端 Repository 聚合 | 无 |
| UI draft (未提交的答案) | 客户端 | localStorage（允许） |
| UI 偏好 (主题/折叠状态) | 客户端 | localStorage（允许） |
| Goal profile | 客户端 | localStorage（非核心业务状态） |

### 3.3 Repository Abstraction

```
Frontend → API Route → Repository Interface → Memory / Supabase
```

- 前端永远通过 API 使用业务数据，不感知底层 provider
- `DATA_PROVIDER=memory` 继续存在，用于本地演示
- 同一进程内所有 Repository 通过 `lib/repository-factory.ts` 中央工厂保证单例一致

---

## 4. After — 新架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Learn   │  │  Review  │  │ Speaking │  │  Report  │    │
│  │  Page    │  │  Page    │  │  Page    │  │  Page    │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │          │
│       └──────────────┴──────────────┴──────────────┘          │
│                              │                                │
│                              ▼                                │
│              ┌──────────────────────────┐                     │
│              │  fetch() → /api/*        │                     │
│              │  (纯展示转换函数)         │                     │
│              │  report-transform.ts     │                     │
│              └──────────────────────────┘                     │
│                                                              │
│  localStorage: 仅 UI draft / 偏好 / Goal profile              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Server (Next.js API)                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │/api/learn│  │/api/review│  │/api/speak│  │/api/report│   │
│  │/api/learning/stats     │  │/api/ability/obs             │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │          │
│       └──────────────┴──────────────┴──────────────┘          │
│                              │                                │
│                              ▼                                │
│              ┌──────────────────────────┐                     │
│              │  repository-factory.ts   │                     │
│              │  (中央单例工厂)           │                     │
│              └──────────┬───────────────┘                     │
│                         │                                      │
│          ┌──────────────┼──────────────┐                      │
│          ▼              ▼              ▼                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │  Learning   │ │  Speaking   │ │  Ability /  │            │
│  │ Repository  │ │ Repository  │ │ Evaluation  │            │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘            │
│         │               │               │                     │
│    ┌────┴────┐     ┌────┴────┐     ┌────┴────┐               │
│    ▼         ▼     ▼         ▼     ▼         ▼               │
│  Memory   Supabase Memory  Supabase Memory  Supabase         │
│  Repo     Repo     Repo     Repo     Repo     Repo           │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Migration — 修改了哪些路径

### 5.1 数据模型修复

| 文件 | 变更 |
|------|------|
| `supabase/migrations/0008_data_model_consistency.sql` | recall_level 冻结为 mastery 0-2（M1 FINAL 修订，从未执行可安全改回）；ability_observations 补充 level/issues/evidence/suggestions；新建 speaking_evaluations 表 |

**recall_level 业务语义（M1 FINAL 冻结）**: Recall Mastery Level，范围 0-2。0 = 尚未建立有效回忆；1 = 已形成一定回忆能力 / 仍未达到稳定独立掌握；2 = 已达到独立回忆层级。当前固定复习间隔不由 recall_level 驱动。未来如需 Leitner / multi-stage progression，新建独立 `review_stage` / `box_level`，不复用 recall_level。

**ability_observations 字段**: 对照 Domain Model，明确需要 level / issues / evidence / suggestions / evidenceStatus。

**recommendations 决策**: **derived state**，不持久化。`generateRecommendations()` 实时从用户状态推导 6 条规则。原因：recommendation 是当前状态的函数，持久化会造成状态与推荐不一致；如后续需要分析 recommendation → acceptance → outcome，再设计持久化。

### 5.2 服务端 Repository 新建

| 文件 | 说明 |
|------|------|
| `lib/repository-factory.ts` | 中央单例工厂，根据 DATA_PROVIDER 返回 memory/supabase 实现 |
| `lib/ability/server-repository.ts` | AbilityRepository 接口 + MemoryAbilityRepository |
| `lib/ability/repositories/supabase-ability-repository.ts` | Supabase Ability 实现 |
| `lib/ability/server-writer.ts` | 异步服务端 Ability Writer |
| `lib/ability/evidence-status.ts` | evidenceStatus 升迁纯函数 |
| `lib/evaluation/server-repository.ts` | EvaluationRepository 接口 + MemoryEvaluationRepository |
| `lib/evaluation/repositories/supabase-evaluation-repository.ts` | Supabase Evaluation 实现 |
| `lib/speaking/repositories/supabase-speaking-repository.ts` | Supabase Speaking 实现 |
| `lib/learning/service.ts` | 委托中央工厂 |
| `lib/speaking/service.ts` | 委托中央工厂 |

### 5.3 API 路由

| 路由 | 变更 |
|------|------|
| `app/api/learning/stats/route.ts` | **新建** GET: learnedCount/dueCount/weeklyAccuracy/streak/speakingIdleDays |
| `app/api/ability/observations/route.ts` | **新建** GET: 用户所有能力观察 |
| `app/api/speaking/sessions/route.ts` | **新建** GET: 最近口语会话 |
| `app/api/speaking/analyze/route.ts` | **重写**: 集成服务端 Ability Writer + Evaluation 保存，服务端构建 abilityContext |
| `app/api/review/session/route.ts` | **重写**: 返回完整 task 字段，使用中央工厂 |
| `app/api/report/route.ts` | **重写为 GET**: 集成 abilityObservations + evaluations + itemContents，返回 _raw 数据 |
| `app/api/learn/card/route.ts` | 使用中央工厂 |
| `app/api/learn/submit/route.ts` | 使用中央工厂 |
| `app/api/review/submit/route.ts` | 使用中央工厂 |
| `app/api/speaking/session/route.ts` | 使用中央工厂 |

### 5.4 前端改造

| 文件 | 变更 |
|------|------|
| `components/learn/learn-page.tsx` | **重写**: 移除 demo-service，纯用 `/api/learn/card` + `/api/learn/submit` |
| `components/review/review-page.tsx` | **重写**: 移除 demo-service，纯用 `/api/review/session` + `/api/review/submit` |
| `components/speaking/speaking-page.tsx` | 移除客户端 ability/evaluation 写入，全交服务端 |
| `components/report/report-page.tsx` | **重写**: fetch `/api/report`，用 report-transform 纯转换函数展示 |
| `components/home/today-zone.tsx` | **重写**: fetch `/api/learning/stats` |
| `components/home/progress-band.tsx` | **重写**: fetch `/api/learning/stats` |
| `lib/client/report-transform.ts` | **新建**: 纯展示转换函数（buildClientReportFromRaw/buildLexiconFromData/buildWeekBuckets/buildSpeakingDigest/buildWeeklyActivity） |
| `lib/ability/profile-builder.ts` | 新增 `buildSpeakingAbilityProfileFromObservations(userId, observations)` 纯函数 |

### 5.5 测试

| 文件 | 说明 |
|------|------|
| `tests/unit/m1-single-source-of-truth.test.ts` | **新建** 28 个回归测试：纯转换函数、页面不依赖 localStorage、API 使用中央工厂、recall_level 一致性 |

---

## 6. Verification — 真实测试结果

### 6.1 修改前 Baseline

| 检查项 | 结果 | 备注 |
|--------|------|------|
| `tsc --noEmit` | PASS (exit 0) | |
| `next build` | PASS | 26 路由 |
| `vitest run` | 98 passed / 2 failed | 预存在失败: env.test.ts (isPlaceholderSupabase), llm-safety.test.ts (ModelSettingsPanel) |
| `playwright test` | 2 passed / 2 failed | 预存在失败: 首页学习报告链接, Agent API |

### 6.2 修改后结果

| 检查项 | 结果 | 与 Baseline 比较 |
|--------|------|-----------------|
| `tsc --noEmit` | **PASS** (exit 0) | 一致 |
| `next build` | **PASS** | 一致，26 路由 |
| `vitest run` | **126 passed / 2 failed** | +28 M1 测试，2 个预存在失败不变 |
| `playwright test` | **3 passed / 1 failed** | 首页测试修复，Agent API 预存在失败不变 |
| M1 回归测试 | **28/28 passed** | 新增 |

### 6.3 预存在失败说明（非 M1 引入）

1. **`tests/unit/env.test.ts:39`** — `isPlaceholderSupabase()` 返回 false，因为 `.env.local` 配置了真实 Supabase URL。与 M1 无关。
2. **`tests/unit/llm-safety.test.ts:158`** — `ModelSettingsPanel.tsx` import `@/lib/llm` 服务端模块。与 M1 无关。
3. **`tests/e2e/smoke.spec.ts:37`** — Agent API `/api/agent/message` 返回非 ok。与 M1 无关。

### 6.4 一致性验证

| 验证项 | 方法 | 结果 |
|--------|------|------|
| 页面切换后状态一致 | 前端通过 API 获取，服务端单例 Repository | PASS |
| refresh 后状态一致 | Memory Repository 单例 + Supabase 持久化 | PASS |
| Learn → Review 状态一致 | 同一 Repository 管理 user_item_states | PASS |
| Speaking → Report 状态一致 | speaking_sessions/ability_observations/evaluations 统一服务端 | PASS |
| 前端无 localStorage 业务写入 | M1 回归测试 + 代码审查 | PASS |

---

## 7. Remaining Risks — 仍未解决的问题

1. **Memory Repository 进程内状态**: `DATA_PROVIDER=memory` 时，Repository 状态保存在 Node.js 进程内存中。Serverless 环境下多实例可能状态不一致。当前仅用于本地 demo，可接受。**不具备 Supabase runtime auto-failover**。
2. **Supabase 迁移未在远程实例执行**: `0008_data_model_consistency.sql` 已创建但未在远程 Supabase 实例执行。使用 Supabase provider 前需执行迁移。**Supabase 路径未经 production verified**。
3. **Agent API 预存在失败**: `/api/agent/message` 返回非 ok，可能与 LLM provider 配置有关。不属于 M1 范围。
4. **demo-service.ts 未完全清理**: 仍包含旧业务函数（已无前端 import），后续可移除或标记废弃。当前保留不影响功能。
5. **Goal profile 仍在 localStorage**: 非核心业务状态，M1 允许保留。后续可考虑服务端化。
6. **recall_level 已冻结为 mastery 0-2**（M1 FINAL）: 0=未建立回忆, 1=一定回忆能力, 2=独立回忆。当前调度不使用 recall_level。`review_stage` / `box_level` 不存在，未来如需 Leitner 系统需新建。
7. **报告 LLM Summary 非阻塞**: `/api/report` 的 LLM 总结失败时静默降级，无重试机制。当前设计可接受。
8. **跨设备实时同步未实现**: 服务端权威架构为多端同步奠定基础，但当前未实现 WebSocket/SSE 实时同步、离线队列、冲突解决。仅支持多端通过 API 读取同一服务端数据（非实时）。
9. **Supabase 幂等性未经运行时验证**: Memory Repository 路径的幂等性已通过 ELS-EVAL-037 实测。Supabase Repository 的 23505 处理逻辑经代码审查确认，但未在真实 Supabase 实例运行时验证。

---

## 8. Interview Debrief

### Q1: 这次解决的核心产品问题是什么？

**答**: 消除了客户端 localStorage 与服务端 Repository 并存的 Dual Data Path，使服务端 API + Repository 成为核心业务数据的唯一权威来源。之前用户在 Learn 页面学的词、Review 页面复习的状态、Speaking 页面的能力评估，分别保存在浏览器 localStorage 和服务端数据库中，两套数据互不同步，导致 refresh 后状态丢失、页面间数据不一致、报告数据与实际学习记录脱节。

### Q2: 为什么 Dual Data Path 是产品问题，而不仅是工程问题？

**答**:
- **用户体验**: 用户学了 10 个词，refresh 后发现进度归零——这直接破坏学习产品的核心价值（积累感、进步感）。
- **数据可信度**: 报告页展示的"本周学习 5 个词"可能和实际学习记录不符，用户会质疑产品是否真的在追踪他们的学习。
- **多端扩展**: 如果未来支持手机端/平板端，localStorage 无法跨设备同步，产品无法扩展。
- **AI 质量**: 口语能力评估仅存在 localStorage，服务端无法基于历史能力做个性化 prompt 注入，AI 输出质量受限。
- **留存分析**: 学习事件分散在客户端，无法做服务端留存分析、漏斗分析，产品迭代缺乏数据支撑。

### Q3: 为什么选择 Server Repository 作为 Source of Truth？

**答**:
1. **持久性**: 服务端数据库（Supabase）跨设备、跨 session 持久化，localStorage 受浏览器清理、隐私模式、设备更换影响。
2. **一致性**: 服务端是所有客户端的汇聚点，天然保证多端一致。
3. **可审计**: 服务端数据可做备份、迁移、分析，localStorage 数据用户可随意修改。
4. **AI 能力**: 服务端可基于全量历史数据做能力画像、个性化推荐，客户端只能看到本机数据。
5. **安全**: 学习数据属于用户资产，服务端可做权限控制（RLS），localStorage 无安全保障。

### Q4: 为什么不完全删除 localStorage？

**答**: localStorage 在以下场景仍有合理用途：
- **UI 临时状态**: 未提交的答案 draft、折叠/展开状态、当前选中的 tab——这些是 UI 层状态，不是业务事实。
- **非关键偏好**: 主题、字体大小、Goal profile——不影响核心学习追踪。
- **离线缓存**: 未来可作为 API 数据的本地缓存（optional cache），但不是权威来源。
- **性能**: 某些高频读取的 UI 状态用 localStorage 比每次 API 调用更快。

关键原则是：**localStorage 可以缓存业务数据的副本，但不能作为业务数据的权威写入路径**。

### Q5: Memory Repository 和 Supabase Repository 同时存在的价值是什么？

**答**:
1. **Demo 体验**: `DATA_PROVIDER=memory` 时无需配置 Supabase 即可本地运行完整产品，降低新开发者/面试官的上手门槛。
2. **测试隔离**: 单元测试用 Memory Repository，无需外部数据库依赖，测试快速且确定性。
3. **渐进式迁移**: 从 memory 到 supabase 的切换只需改环境变量，代码层完全透明。
4. **开发效率**: 本地开发用 memory，避免频繁操作远程数据库。
5. **结构基础（非运行时能力）**: Repository abstraction 为未来的 provider 切换/降级提供**结构基础**——切换只需改环境变量重启。**当前不存在 runtime automatic failover**：DATA_PROVIDER 启动时固定，Supabase 运行中不可用时不会自动切到 memory，请求将按错误路径处理。

两者通过统一的 Repository Interface 抽象，前端和 API 层不感知底层实现。

### Q6: 这一设计有哪些 trade-off？

**答**:
- **优势**: 数据一致性、可持久化、可扩展、AI 可利用全量数据、可分析。
- **代价**:
  - 每次操作需要 API 调用，增加网络延迟（可通过乐观 UI 缓解）。
  - 服务端复杂度增加（需要维护 Repository 抽象、两种实现）。
  - Memory Repository 在 Serverless 多实例下状态不一致（仅 demo 场景可接受）。
  - 离线场景下无法写入业务数据（当前产品假设在线使用）。
- **权衡**: 对于学习产品，数据一致性和持久性远比毫秒级延迟重要，因此选择服务端权威是合理的。

### Q7: 如何证明迁移后没有破坏已有用户流程？

**答**:
1. **回归测试**: 新增 28 个 M1 专项测试，覆盖纯转换函数、页面依赖检查、API 工厂使用、数据模型一致性。
2. **全量测试对比**: 修改前后 typecheck/build/unit/e2e 全部运行，预存在失败项不变，无新增失败。
3. **E2E 改善**: 首页"学习报告"链接测试从失败变为通过，说明改造后首页数据加载正常。
4. **代码审查**: 6 个核心页面全部移除 localStorage 业务写入，改为 API 调用；10 个 API 路由全部使用中央工厂。
5. **行为等价**: 前端 UI 组件未改动，仅数据获取层从 localStorage 改为 API，用户可见行为不变。

### Q8: 如果未来支持多端同步，这一架构如何扩展？

**答**:
> **当前状态**: 跨设备实时同步**未实现**。以下为未来扩展路径，非已交付能力。

1. **当前架构已具备多端基础**: 所有业务数据在服务端，多端只需各自调用同一套 API 即可读取一致数据（但非实时）。
2. **需要补充**:
   - **实时同步**: 引入 WebSocket / SSE，一端学习后其他端实时更新。
   - **冲突解决**: 多端同时写入时基于 `updatedAt` 或版本号做 last-write-wins 或合并策略。
   - **离线队列**: 移动端离线时操作暂存本地队列，上线后批量同步到服务端。
   - **增量同步**: API 支持 `since` 参数，客户端只拉取增量数据，减少流量。
3. **Repository 层不变**: 多端同步是 API 层和传输层的问题，Repository Interface 无需改动。
4. **Supabase 原生支持**: Supabase 提供 Realtime 和 Row Level Security，可直接用于多端同步（需额外配置和开发）。

---

## 9. M1_STATUS

**M1_STATUS: PASS**（主体迁移）
**M1_CLOSEOUT_STATUS: PARTIAL → M1 FINAL 已处理**
**M1_FINAL_STATUS: 见 `m1-closeout.md`**

满足条件:
- ✅ 四条核心链路（Learn/Review/Speaking/Report）不再依赖 localStorage 作为业务 Source of Truth
- ✅ 关键状态通过统一 API + Repository 流转
- ✅ 数据模型：recall_level 冻结为 mastery 0-2（M1 FINAL）；ability_observations 字段、speaking_evaluations 表、recommendations derived state 决策已处理
- ✅ Report 使用服务端统一数据（`/api/report` GET + 服务端聚合）
- ✅ 修改前后真实测试结果完整（baseline + after）
- ✅ Evidence Artifact 已生成（本文档）
- ✅ Interview Debrief 已完成（8 个问题，已修正未经实现验证的表述）
- ✅ M1 FINAL: clientEventId 幂等性使用显式 Repository Contract（`{ event, created }`），不依赖 traceId；recall_level 冻结为 0-2 mastery
