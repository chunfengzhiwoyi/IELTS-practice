# 03_ARCHITECTURE_AND_DATA.md — 架构与数据模型

> 全部来自当前仓库代码（lib/、app/、supabase/）。

## 1. 分层架构

```
Browser / Miniapp / Android
   ↓ HTTP
Next.js App Router（app/api/* 路由 + lib/* 业务层 + middleware.ts）
   ↓
Repository Factory（lib/repository-factory.ts）
   ├─ DATA_PROVIDER=memory → Memory 实现（demo）
   └─ DATA_PROVIDER=supabase → Supabase 实现（持久化）
        ↓
Supabase（public schema，RLS）
```

- 前端不感知 provider；所有业务数据通过 API/Repository 访问。
- Auth：`lib/auth/session.ts`（getCurrentUser/requireUser）——cookie SSR 客户端（`lib/db/server.ts` createServerClient）或 demo 注入；service_role 客户端（createServiceRoleClient）仅供系统级/server-only 操作。
- Middleware（`middleware.ts`）：dashboard-only 路由白名单（404 隔离）+ 安全头 + trace_id。

## 2. 核心目录职责（CANONICAL）

| 路径 | 职责 |
|---|---|
| `lib/learning/` | 学习闭环：types/repository/service/seed-catalog/application-evidence/item-id |
| `lib/speaking/` | 口语：types/analysis/question-bank/service/evidence 管线 |
| `lib/ability/` | 能力观察：types/writer/profile-builder/memory-retriever |
| `lib/evaluation/` | 效果评估：evaluation-builder（issueResolutionRate 等） |
| `lib/llm/` | LLM 任务：tasks/analyze-speaking（含 BAND_SCORE_LEAK 红线）、providers、user-config |
| `lib/knowledge/` | Knowledge Cache / 检索：retrieval/conflict/ima |
| `lib/auth/` | session/demo-user/wechat-* /dashboard-access |
| `lib/db/` | server.ts（SSR+service）/browser.ts/types.ts |
| `lib/report/` `lib/planner/` `lib/goal/` | 报告/规划器/目标 |
| `app/api/` | speaking/{session,sessions,transcribe,analyze,complete}、auth/*、learn、review、report、goal、dashboard、secrets |
| `data/knowledge/` `data/seed/` | 知识库与种子 |
| `apps/android/core/` | Kotlin 领域模型（Web 与 Android 共享逻辑契约） |

## 3. 数据模型与学习闭环（SSOT / derived / writeback）

| 实体 | 表/源 | 性质 | 说明 |
|---|---|---|---|
| UserItemState | `user_item_states` | SSOT（用户-词项状态） | recognition_level 0-2、**recall_level 0-2（Recall Mastery，冻结，0008 注释）**、application_level、current_interval_days、next_review_at、status |
| LearningEvent | `learning_events` | SSOT（事件流，append-only，禁 UPDATE/DELETE） | NEW/REVIEW × FAIL/HINTED/INDEPENDENT/SKIPPED；task_type/trace_id；幂等键 (user_id, client_event_id) |
| ApplicationEvidence | `application_evidence` | **SSOT**（application ability 唯一事实源） | 幂等 (user_id,item_id,session_id)；assessment ∈ CORRECT/ISSUE/UNCERTAIN/NOT_USED；validated evidence 才落库 |
| **application_level** | `user_item_states.application_level` | **DERIVED（派生缓存）** | 由 application_evidence 可重算；不得直接由 LLM/UI 写（PRODUCT-LOOP-04E） |
| AbilityObservation | `ability_observations` | SSOT（能力观察状态机） | evidence_status ∈ SINGLE_OBSERVATION/REPEATED_PATTERN/IMPROVING/DISPUTED/RESOLVED |
| SpeakingSession | `speaking_sessions` | SSOT（会话） | part P1/P2/P3、first/second_answer、main_issue、suggested_expressions（frozen） |
| SpeakingEvaluation | `speaking_evaluations` | SSOT（二次回答效果） | issueResolutionRate、feedbackEffectiveness、overallChange |
| SuggestedExpression | 会话内（不落库 V1） | response-level 上下文 | 用户可忽略，不影响评分 |

**禁止的耦合（代码注释明示）**：
1. LLM 输出不得直接写任何长期状态——必须先经确定性 validator（evidence 固化：`lib/learning/application-evidence.ts`、`target-expression-evidence-validator.ts`）。
2. application_level 不得由 UI/LLM 直接修改；只能从 evidence 重算。
3. recall_level 冻结为 mastery 语义，不得复用为 Leitner box（未来新增 review_stage）。
4. evidence 落库失败不阻断主 Speaking 流程（非阻塞 writeback 策略）。

## 4. 数据流（一次 Speaking 分析，证据：`app/api/speaking/analyze/route.ts`）

```
POST /api/speaking/analyze {sessionId, answer, isSecondAnswer, audioMetadata?, abilityContext?}
→ requireUser（cookie）→ getSession → getQuestionById
→ analyzeSpeakingWithLlm（LLM + 规则降级；BAND_SCORE_LEAK → 强制规则回退）
→ updateFirst/SecondAnswer（写 speaking_sessions）
→ recordApplicationEvidenceFromAnalysis（写 application_evidence + 重算 application_level；不阻塞）
→ writeAbilityObservationsServer（写 ability_observations；不阻塞）
→ （isSecondAnswer 时）computeSessionEvaluation → save（写 speaking_evaluations；不阻塞）
→ {analysis, session}
```

## 5. 报告/规划/目标
- `lib/report/`：学习报告聚合（含 speakingEvaluationsStatus）。
- `lib/planner/`：Planner V1（recommendations 表）。
- `lib/goal/`：目标（`app/goals` + `/api/goal`）。
