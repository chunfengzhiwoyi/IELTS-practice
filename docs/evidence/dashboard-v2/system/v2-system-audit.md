# IELTS AI Learning Agent — V2 系统逆向审计报告

> 审计日期：2026-09-09
> 审计范围：`D:\Codex\IELTS-practice` 全仓库
> 审计性质：事实基线建立，不做功能开发或修复
> 状态：**M0_STATUS: PASS**（全部核心组件可读取、可定位；无 BLOCKED 项）

---

## 1. Executive Summary

本项目是一个基于 **Next.js 15 App Router + Supabase + 单 Agent LLM 编排** 的 IELTS 英语学习产品，自称 MVP 0.1（P5 验收完成）。核心学习闭环为：**新词学习 → 间隔复习 → 口语训练 → 学习报告**，辅以备考目标规划和自然语言助手入口。

**三个最关键的事实发现：**

1. **存在双数据路径（Dual Data Path）**：前端组件主要走 `lib/client/demo-service.ts`（localStorage 直写），同时在 LLM 生成场景下回调服务端 API Route。服务端 Repository（memory/supabase）与客户端 localStorage 之间**没有同步机制**，同一用户的学习状态可能分裂在两处。这是当前架构最大的产品风险。

2. **LLM 调用共 6 个业务点 + 1 个 STT 点**，全部经过统一的 `callLlmStructured` 管线（Zod 校验 + 修复重试 + Provider Fallback）。但 **Agent Tools（`lib/agent/tools/`）全部是 P0 占位实现**，实际业务逻辑完全绕过了工具层，直接在 API Route 内联调用 LLM Task 函数。

3. **User Memory / Knowledge / Persistence 三层均为"部分实现"**：User Memory 有原始事件存储但无 LLM 记忆合成层；Knowledge Cache 是进程内 JSON 缓存无向量检索；IELTS Knowledge Base 仅 45 个静态对象且仅用于词卡生成的 prompt 注入。口语能力画像（Ability Profile）和评估（Evaluation）仅存 localStorage，无服务端持久化。

---

## 2. Product Map（用户可见功能及入口）

| # | 功能 | 入口 | 前端组件 | 服务端 API | 状态 |
|---|------|------|----------|-----------|------|
| 1 | 首页·今日任务区 | `/` | `components/home/today-zone.tsx` | 无（读 localStorage） | IMPLEMENTED |
| 2 | 首页·功能卡片 | `/` | `components/home/function-cards.tsx` | 无 | IMPLEMENTED |
| 3 | 首页·进度带 | `/` | `components/home/progress-band.tsx` | 无（读 localStorage） | IMPLEMENTED |
| 4 | 首页·LLM 状态指示 | `/` | `components/home/llm-home-status.tsx` | `/api/health/llm` | IMPLEMENTED |
| 5 | 自然语言助手（悬浮坞） | 全局 | `components/assistant/assistant-dock.tsx` + `components/chat/*` | `/api/agent/message` | IMPLEMENTED |
| 6 | 新词学习 | `/learn` | `components/learn/learn-page.tsx` | `/api/learn/card`, `/api/learn/submit` | IMPLEMENTED |
| 7 | 今日复习 | `/review` | `components/review/review-page.tsx` | `/api/review/session`, `/api/review/submit` | IMPLEMENTED |
| 8 | 口语训练（文字+语音） | `/speaking` | `components/speaking/speaking-page.tsx` | `/api/speaking/session`, `/api/speaking/analyze`, `/api/speaking/transcribe` | IMPLEMENTED |
| 9 | 学习报告 | `/report` | `components/report/report-page.tsx`（11 个子组件） | `/api/report` | IMPLEMENTED |
| 10 | 备考目标规划 | `/goals` | `components/goals/goal-page.tsx` | 无（纯客户端） | IMPLEMENTED |
| 11 | 个人中心·资料 | `/account` | `components/account/ProfilePanel.tsx` | `/api/account/profile` | IMPLEMENTED |
| 12 | 个人中心·模型配置 | `/account` | `components/account/ModelSettingsPanel.tsx` | `/api/secrets`, `/api/secrets/test-connection` | IMPLEMENTED |
| 13 | 个人中心·ima 知识库 | `/account` | `components/account/ImaPanel.tsx` | `/api/ima/list` | IMPLEMENTED |
| 14 | 登录/注册 | `/(auth)/login` | `LoginForm.tsx` | `/auth/callback` | PARTIAL（demo 模式可用，Supabase Auth 代码就绪未实测） |
| 15 | 微信扫码登录 | 登录页 | wechat-bridge 系列 | `/api/auth/wechat-*`（4 个路由） | PARTIAL（代码就绪，需微信 AppID/Secret） |
| 16 | 重置密码 | `/(auth)/reset-password` | `ResetPasswordForm.tsx` | 无（Supabase Auth 内置） | PARTIAL |

**未实现/不存在的用户功能：**
- 写作训练（Writing）— NOT IMPLEMENTED
- 阅读训练（Reading）— NOT IMPLEMENTED
- 听力训练（Listening）— NOT IMPLEMENTED
- 词汇量测试/分级测试 — NOT IMPLEMENTED
- 社区/排行榜/社交 — NOT IMPLEMENTED
- 离线模式/PWA — NOT IMPLEMENTED

---

## 3. Architecture Map

### 3.1 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 前端框架 | Next.js App Router | 15.3 |
| 语言 | TypeScript | 5.6 |
| UI | Tailwind CSS + 自定义组件 | 3.4 |
| 数据库 | Supabase Postgres | — |
| 认证 | Supabase Auth / Demo 模式 | — |
| LLM SDK | openai npm（OpenAI 兼容模式） | 4.68 |
| 校验 | Zod | 3.23 |
| 测试 | Vitest + Playwright | — |
| CI | GitHub Actions（`.github/` 目录为空，**实际未配置**） | — |

### 3.2 运行模式（环境变量控制）

```
AUTH_MODE = demo | supabase        (默认 demo)
DATA_PROVIDER = memory | supabase  (默认 memory)
LLM_PRIMARY_PROVIDER = mock | bailian | deepseek | user  (默认 mock)
LLM_FALLBACK_ENABLED = true | false (默认 false)
```

当前 `.env.local` 配置：`DATA_PROVIDER=memory`, `AUTH_MODE=demo`, `LLM_PRIMARY_PROVIDER=mock`（具体值已脱敏确认存在）。

### 3.3 架构分层图

```
┌─────────────────────────────────────────────────────────────┐
│                        浏览器 (Client)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ /learn   │ │ /review  │ │/speaking │ │ /report  │       │
│  │ page     │ │ page     │ │ page     │ │ page     │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       │              │            │              │           │
│  ┌────▼──────────────▼────────────▼──────────────▼─────┐    │
│  │  lib/client/demo-service.ts (localStorage 直写)      │    │
│  │  states | events | speaking_sessions | items cache   │    │
│  └────┬──────────────┬────────────┬────────────────────┘    │
│       │ LLM 生成时     │ 语音转写     │ 报告聚合              │
│       ▼              ▼            ▼                         │
│  /api/learn/card  /api/speaking  /api/report               │
│  /api/learn/submit  /transcribe                             │
└───────┬──────────────┬────────────┬─────────────────────────┘
        │              │            │
┌───────▼──────────────▼────────────▼─────────────────────────┐
│                     服务端 (Server)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Routes (app/api/*)                              │   │
│  │  Zod 输入校验 → requireUser → 业务逻辑 → Response    │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │                                           │
│  ┌──────────────▼───────────────────────────────────────┐   │
│  │  领域服务层 (lib/*)                                  │   │
│  │  learning/ | review/ | speaking/ | report/          │   │
│  │  ability/ | evaluation/ | knowledge/ | goal/        │   │
│  └──────┬───────────────┬──────────────────────────────┘   │
│         │               │                                  │
│  ┌──────▼──────┐ ┌──────▼──────────────────────────────┐   │
│  │ Repository  │ │  LLM Task Layer (lib/llm/tasks/)    │   │
│  │  (memory/   │ │  generate-word-card                 │   │
│  │   supabase) │ │  judge-answer                       │   │
│  │             │ │  analyze-speaking                   │   │
│  │             │ │  generate-report-summary            │   │
│  └──────┬──────┘ └──────────────┬───────────────────────┘   │
│         │                       │                           │
│  ┌──────▼──────┐ ┌──────────────▼───────────────────────┐   │
│  │  Supabase   │ │  callLlmStructured (统一管线)         │   │
│  │  Postgres   │ │  Zod 校验 + 修复重试 + Provider Fallback│  │
│  │  + RLS      │ └──────────────┬───────────────────────┘   │
│  └─────────────┘                │                           │
│                    ┌───────────┼───────────┐               │
│                    ▼           ▼           ▼               │
│              mock-provider bailian    deepseek/user        │
└────────────────────────────────────────────────────────────┘
```

### 3.4 关键架构特征

- **单 Agent**：无 Multi-Agent，无 Agent 工具调用循环。`lib/agent/agent.ts` 仅做意图分类（已被新版 chat 入口替代）。
- **LLM Provider 抽象**：`LlmProvider` 接口，5 个实现（mock/bailian/deepseek/anthropic/gemini/user-model），但 provider-registry 仅注册 mock/bailian/deepseek 三种。
- **模型分层**：`fast`（意图识别、判题、修复）vs `main`（词卡生成、口语分析、报告总结）。
- **`server-only` 保护**：`lib/llm/index.ts`、`lib/llm/provider-registry.ts`、`lib/learning/index.ts` 等服务端模块强制标记。

---

## 4. Four Core Flows（端到端请求流）

### 4.1 新词学习（New Word Learning）

```
User 输入 "mitigate"
  │
  ▼
/components/learn/learn-page.tsx (handleTermSubmit)
  │
  ├─ 1. 先查本地：lib/client/demo-service.ts → getWordCard(term)
  │     ├─ 查 localStorage els_items 缓存
  │     └─ 查 seed catalog (22 条)
  │     └─ 命中 → 直接展示词卡（不调服务端）
  │
  └─ 2. 本地未命中 → POST /api/learn/card { term }
        │
        ▼
  app/api/learn/card/route.ts
        │
        ├─ Zod 校验 (term: 1-200 chars)
        ├─ requireUser() → demo-user (id=demo-user-001)
        ├─ normalizeTerm(term)
        ├─ findSeedItem(normalized) → 再查一次 seed
        │
        ├─ Seed 未命中 → generateWordCardWithLlm(term, traceId)
        │     │
        │     ▼
        │   lib/llm/tasks/generate-word-card.ts
        │     ├─ retrieveKnowledge({term, context}) → 关键词匹配 45 个知识对象
        │     ├─ 构造 system prompt (BASE + knowledge context)
        │     ├─ callLlmStructured(tier=main, schema=WordCardSchema, temp=0.3)
        │     │     └─ Provider (mock/bailian/deepseek) → JSON → Zod 校验
        │     └─ 返回 SeedLearningItem (含 generationMeta: knowledgeObjectIds, promptVersion)
        │
        ├─ repo.createOrGetItem(seedToLearningItem(seedItem))
        │     └─ MemoryLearningRepository / SupabaseLearningRepository
        ├─ repo.getUserItemState(userId, itemId) → alreadyLearned?
        └─ 返回 WordCardResponse { item, task(MEANING_RECALL), alreadyLearned, currentState }
              │
              ▼
  前端展示词卡 + 回忆任务
        │
        ▼
  User 提交答案
        │
        ▼
  /api/learn/submit { itemId, taskType, answer, usedHint, clientEventId }
        │
        ▼
  app/api/learn/submit/route.ts
        ├─ Zod 校验
        ├─ requireUser()
        ├─ 获取词条信息 (seed 优先, repo 兜底)
        ├─ judgeAnswerWithLlm(term, coreMeaning, userAnswer, acceptedAnswers, answerKeywords)
        │     ├─ 空答案 → 直接判错 (不调 LLM)
        │     ├─ callLlmStructured(tier=fast, schema=JudgeSchema, temp=0)
        │     └─ LLM 失败 → fallbackJudge (精确匹配 → 关键词匹配)
        ├─ 映射 correctness (INDEPENDENT/HINTED/FAIL) + status
        ├─ computeInitialReviewAt(scheduleQuality) → 确定性间隔 (24h/8h/2h)
        ├─ repo.createLearningEvent (幂等: clientEventId)
        ├─ repo.upsertUserItemState (status, levels, consecutiveCorrect, interval, nextReviewAt)
        └─ 返回 LearnSubmitResponse { eventId, correctness, status, feedback, nextReviewAt, state }
              │
              ▼
  前端：展示结果 + 同时写入 localStorage (demo-service)
```

**LLM 调用点**：词卡生成（main tier）+ 答案判题（fast tier）
**确定性规则**：seed 查找、标准化、初始复习间隔、状态更新、幂等
**状态写回**：`learning_events`（append-only）+ `user_item_states`（upsert）+ 客户端 localStorage

---

### 4.2 今日复习（Daily Review）

```
User 进入 /review
  │
  ▼
/components/review/review-page.tsx
  │
  ├─ 读 localStorage states → 计算 dueCount
  └─ POST /api/review/session { mode: "DUE", limit: 10 }
        │
        ▼
  app/api/review/session/route.ts
        ├─ Zod 校验 (DUE | MANUAL)
        ├─ requireUser()
        ├─ repo.getDueReviewItems(userId, now, limit)
        │     └─ 筛选 nextReviewAt <= now，按 nextReviewAt 升序
        ├─ repo.getDueReviewItems(userId, now, 100) → totalDue
        └─ 返回 { tasks[], totalDue }
              │
              ▼
  前端展示复习卡片队列
        │
        ▼
  User 答题（可看提示 hint，可跳过 skip）
        │
        ▼
  /api/review/submit { itemId, taskType, answer, usedHint, skipped, clientEventId }
        │
        ▼
  app/api/review/submit/route.ts
        ├─ Zod 校验
        ├─ requireUser()
        ├─ 获取词条信息
        ├─ 判断：
        │     ├─ skipped=true → SKIPPED
        │     ├─ 空答案 → INCORRECT
        │     └─ 否则 → judgeAnswerWithLlm (fast tier, 关键词 fallback)
        │           └─ correct ? (usedHint ? CORRECT_WITH_HINT : CORRECT_INDEPENDENT) : INCORRECT
        ├─ computeReviewNextAt(result) → 确定性间隔:
        │     CORRECT_INDEPENDENT=72h, CORRECT_WITH_HINT=24h, INCORRECT=4h, SKIPPED=2h
        ├─ repo.createLearningEvent (eventType=REVIEW, 幂等)
        ├─ repo.upsertUserItemState (recallLevel+1 if independent, consecutiveCorrect, nextReviewAt)
        ├─ repo.getDueReviewItems → remaining
        └─ 返回 { eventId, result, feedback, status, nextReviewAt, remaining }
              │
              ▼
  前端：展示反馈 + 下一题 / 完成 + 写入 localStorage
```

**LLM 调用点**：答案判题（fast tier，可降级关键词匹配）
**确定性规则**：到期筛选、复习间隔调度、状态更新、幂等
**注意**：`lib/review/answer-judge.ts` 有纯确定性判题函数，但 API Route 实际使用的是 `judgeAnswerWithLlm`（LLM 优先），确定性函数**未被复习流程调用**。

---

### 4.3 口语训练（Speaking Training）

```
User 进入 /speaking → 选择 Part (P1/P2/P3)
  │
  ▼
/components/speaking/speaking-page.tsx (handleStartSession)
  │
  ▼
POST /api/speaking/session { part }
  │
  ▼
app/api/speaking/session/route.ts
  ├─ Zod 校验
  ├─ requireUser()
  ├─ pickQuestion(part) → 从 12 题题库选第一题（确定性，非随机）
  ├─ 生成 session id (spk-<timestamp>-<random>)
  ├─ repo.createSession(session) → MemorySpeakingRepository (进程内)
  └─ 返回 { session, questionData }
        │
        ▼
  P2 → 准备阶段 (PREP)；P1/P3 → 直接作答
        │
        ▼
  User 输入文字回答 或 录音（audio-recorder → blob）
        │
        ├─ 语音回答 → POST /api/speaking/transcribe (multipart audio)
        │     ├─ 调 Whisper API (whisper-1, verbose_json, word timestamps)
        │     ├─ 计算 audioMetadata (wpm, pauses, wordTimestamps)
        │     └─ 返回 { transcript, duration, audioMetadata }
        │
        ▼
  POST /api/speaking/analyze { sessionId, answer, isSecondAnswer, audioMetadata?, abilityContext? }
        │
        ▼
  app/api/speaking/analyze/route.ts
        ├─ Zod 校验 (answer 1-5000 chars, audioMetadata 可选)
        ├─ requireUser()
        ├─ repo.getSession(sessionId)
        ├─ getQuestionById(session.questionId)
        ├─ getUserOverrideProviders() → 用户自有模型优先
        ├─ analyzeSpeakingWithLlm(answer, question, traceId, audioMetadata, abilityContext)
        │     │
        │     ▼
        │   lib/llm/tasks/analyze-speaking.ts
        │     ├─ buildSystemPrompt(hasAudio) → IELTS 考官 prompt (3 维度, 不给 Band 分)
        │     ├─ buildUserPrompt(answer, question, audioMetadata, abilityContext)
        │     │     └─ 若 totalSessions>=2 → 注入历史能力上下文 (最弱维度/反复问题/趋势)
        │     ├─ callLlmStructured(tier=main, schema=EnhancedAnalysisSchema, temp=0.3)
        │     ├─ 构建 ieltsAnalysis (fluency/lexicalResource/grammaticalRange, pronunciation=null)
        │     ├─ validateFeedbackQuality(analysis, answer) → 4 规则质量门
        │     │     ├─ schemaCheck (必填字段、维度合法性)
        │     │     ├─ evidenceConsistencyCheck (证据与回答关联)
        │     │     ├─ actionabilityCheck (泛化建议检测、动作词检测)
        │     │     └─ ieltsAlignmentCheck (Band 分数泄漏检测、level 合法性)
        │     ├─ 质量 FAIL → 降级到 ruleBasedAnalysis (lib/speaking/analysis.ts)
        │     ├─ 质量 NEEDS_REVIEW → 附加 warning 但返回 LLM 结果
        │     └─ LLM 异常 → 降级到 ruleBasedAnalysis
        │
        ├─ repo.updateFirstAnswer / updateSecondAnswer
        └─ 返回 { analysis, session }
              │
              ▼
  前端展示反馈 (speaking-feedback) + 微训练 (micro-drill-card)
        │
        ├─ 前端调用 writeAbilityObservations() → 写入 localStorage ability_observations
        │     └─ 自动计算 evidenceStatus (SINGLE → REPEATED → IMPROVING → DISPUTED → RESOLVED)
        ├─ 前端调用 buildSpeakingAbilityProfile() → 计算维度趋势/反复问题/下次重点
        ├─ 前端调用 retrieveAbilityContext() → 提取紧凑上下文 (≤150字) 供下次分析注入
        │
        ▼
  User 选择重答 (second answer) → 再次 /api/speaking/analyze { isSecondAnswer: true }
        │
        ▼
  完成 → computeSessionEvaluation(session) → 对比首答/重答维度变化
        └─ 写入 localStorage speaking_evaluations
```

**LLM 调用点**：口语深度分析（main tier，含质量门 + 规则降级）+ Whisper STT（独立 API）
**确定性规则**：题库选择、质量门 4 规则、规则分析引擎（4 维度检测）、能力画像构建、评估计算、evidenceStatus 状态机
**状态写回**：`speaking_sessions`（memory only）+ localStorage（ability_observations, speaking_evaluations）
**关键缺口**：SpeakingRepository 只有 Memory 实现，**无 Supabase 持久化**；ability/evaluation 仅 localStorage。

---

### 4.4 学习报告（Learning Report）

```
User 进入 /report
  │
  ▼
/components/report/report-page.tsx (useEffect)
  │
  ├─ generateClientReport() → lib/client/demo-service.ts
  │     └─ 从 localStorage 读 events/states → 计算周活动、词汇量、正确率
  ├─ buildLexicon() → 从 localStorage 读 items → 分类 recent/attention
  ├─ buildSpeakingAbilityProfile("demo") → 从 localStorage ability_observations 计算
  ├─ getEvaluationRepository().getAll("demo") → 从 localStorage 读评估
  │
  └─ (可选) POST /api/report { period: "7d" | "30d" }
        │
        ▼
  app/api/report/route.ts
        ├─ Zod 校验
        ├─ requireUser()
        ├─ aggregateReportData(learningRepo, speakingRepo, {userId, period})
        │     ├─ repo.getAllUserItemStates(userId) → 全部状态
        │     ├─ repo.getUserEventsInRange(userId, since, until) → 时间范围内事件
        │     ├─ speakingRepo.getRecentSessions(userId, 50) → 口语会话
        │     ├─ buildMemorySummary (totalItems, newItems, reviewedCount, dueSoon, statusDistribution)
        │     ├─ buildReviewStats (totalReviews, correctIndependent, correctWithHint, incorrect, skipped, correctRate)
        │     └─ buildSpeakingObservations (按 dimension 聚合, count>=2 标记 isPattern)
        ├─ generateRecommendations(aggregated, now) → 6 条确定性规则
        │     1. 有到期复习 → HIGH
        │     2. 24h 内即将到期 → MEDIUM
        │     3. 复习正确率<60% 且>=3次 → HIGH
        │     4. 口语重复问题 → MEDIUM
        │     5. 词汇量<10 → MEDIUM
        │     6. 无推荐 → 鼓励 LOW
        ├─ 构建 ProgressReport
        ├─ generateReportSummaryWithLlm(report, traceId) → 非阻塞
        │     ├─ insufficientData → 直接返回 null
        │     ├─ callLlmStructured(tier=main, schema=SummarySchema, temp=0.5)
        │     └─ LLM 失败 → 返回 null (不影响报告主体)
        └─ 返回 { ...report, llmSummary }
              │
              ▼
  前端渲染 11 个子组件：
  - ReportLede (总体导语)
  - LexiconSection (词汇进展)
  - CompareSection (本周 vs 上周)
  - TwoHands (左右手布局)
  - MilestoneLine (里程碑)
  - NextStep (下一步)
  - SpeakingGrowthCard (口语成长)
  - AbilitySummaryCard (能力画像)
  - AiRecommendationCard (AI 推荐)
  - GoalOverview (目标概览)
```

**LLM 调用点**：报告自然语言总结（main tier，非阻塞，失败返回 null）
**确定性规则**：数据聚合、推荐生成、里程碑检测、能力画像
**数据来源**：服务端 Repository（events/states/sessions）+ 客户端 localStorage（双路径）
**关键缺口**：报告页主要从 localStorage 读取数据，服务端 `/api/report` 的调用在前端代码中**未被实际触发**（report-page.tsx 使用 `generateClientReport()` 而非 fetch API）。

---

## 5. AI Capability Map（所有 LLM 调用点）

### 5.1 调用点总览

| # | 调用位置 | 函数 | Tier | 用途 | 结构化 | Failure Handling |
|---|---------|------|------|------|--------|-----------------|
| 1 | `/api/agent/message` | `callLlmStructured` (内联) | fast | 聊天意图路由 + 回复生成 | ✅ Zod (ChatResponse) | 失败 → buildMockResponse 关键词兜底 |
| 2 | `/api/learn/card` | `generateWordCardWithLlm` | main | 词卡生成（seed 未命中时） | ✅ Zod (WordCardSchema) | 失败 → 502 MODEL_ERROR，前端显示 ITEM_NOT_FOUND |
| 3 | `/api/learn/submit` | `judgeAnswerWithLlm` | fast | 答案语义判题 | ✅ Zod (JudgeSchema) | 失败 → fallbackJudge (精确/关键词匹配) |
| 4 | `/api/review/submit` | `judgeAnswerWithLlm` | fast | 复习答案判题 | ✅ Zod (JudgeSchema) | 失败 → fallbackJudge (精确/关键词匹配) |
| 5 | `/api/speaking/analyze` | `analyzeSpeakingWithLlm` | main | 口语三维度深度分析 | ✅ Zod (EnhancedAnalysisSchema) | 失败 → ruleBasedAnalysis 规则引擎；质量FAIL → 规则引擎 |
| 6 | `/api/report` | `generateReportSummaryWithLlm` | main | 报告自然语言建议 | ✅ Zod (SummarySchema) | 失败 → 返回 null（非阻塞） |
| 7 | `/api/speaking/transcribe` | Whisper API (fetch) | — | 语音转文字 | 非结构化 (verbose_json) | 失败 → 502/500，前端可回退文字输入 |

### 5.2 各调用点详细信息

#### 调用点 1：聊天助手 (`/api/agent/message`)
- **输入**：`messages[]` (最多 40 条，取最近 20 条) + `conversation_state`
- **Prompt**：`CHAT_SYSTEM_PROMPT`（教练人设 + 6 种 ui_action 契约 + 示例）
- **Context**：conversation_state JSON + 用户 ima 知识库检索结果（若已配置）
- **Knowledge**：ima 外部知识库（`searchImaKnowledge`），仅当用户配置了 ima 凭证
- **输出**：`{ assistant_text, ui_action{type, options?, term?, mode?, topic?}, conversation_state_patch }`
- **结构化**：✅ Zod `ResponseSchema`
- **Failure**：`isMockPrimary() && !override` → 直接返回关键词 mock；LLM 异常 → `buildMockResponse` 关键词匹配，标记 `fallback: true`

#### 调用点 2：词卡生成 (`generateWordCardWithLlm`)
- **输入**：term (单词/短语/语块)
- **Prompt**：`BASE_SYSTEM_PROMPT`（IELTS 词卡生成器，15 字段要求）+ Knowledge Context
- **Context**：`retrieveKnowledge({term, currentContext})` → 最多 5 个知识对象
- **Knowledge**：`data/knowledge/knowledge-objects-v1.json`（45 对象，关键词匹配）
- **输出**：`SeedLearningItem`（17 字段，含 ielts metadata + generationMeta）
- **结构化**：✅ Zod `WordCardSchema`（含嵌套 ielts 对象）
- **Failure**：异常向上抛出 → API 返回 502；无自动重试（管线内有 1 次修复重试）
- **Prompt Version**：`v1.1-knowledge-layer`（硬编码常量，无注册表）

#### 调用点 3 & 4：答案判题 (`judgeAnswerWithLlm`)
- **输入**：term, coreMeaning, userAnswer, acceptedAnswers[], answerKeywords[]
- **Prompt**：英语学习答案判断器（语义等价判断，不要求精确措辞）
- **Context**：无（无用户历史、无知识注入）
- **Knowledge**：无
- **输出**：`{ correct: boolean, confidence: high/medium/low, explanation: string }`
- **结构化**：✅ Zod `JudgeSchema`
- **Failure**：空答案直接判错；LLM 异常 → `fallbackJudge`（精确匹配 → 全部关键词匹配 → 判错）
- **Tier**：fast, temperature=0

#### 调用点 5：口语分析 (`analyzeSpeakingWithLlm`)
- **输入**：answer, question(part/topic/question/expectedLength), audioMetadata?, abilityContext?
- **Prompt**：IELTS 考官系统提示（3 维度评估规则 + 不给 Band 分 + mainIssue 唯一）
- **Context**：
  - audioMetadata（WPM、停顿次数、最长停顿、停顿占比）— 语音回答时
  - abilityContext（最弱维度、反复问题、近期趋势）— 当 totalSessions>=2 时
- **Knowledge**：无（不注入 knowledge-objects）
- **输出**：`SpeakingAnalysisResult`（mainIssue, microDrill, summary, ieltsAnalysis{3维度}, prioritizedSuggestions）
- **结构化**：✅ Zod `EnhancedAnalysisSchema`
- **Failure**：
  - LLM 异常 → `ruleBasedAnalysis`（4 维度确定性检测：长度/连接词/paraphrase/句式多样性）
  - 质量门 FAIL（score<40）→ 规则引擎
  - 质量门 NEEDS_REVIEW（40-69）→ 返回 LLM 结果 + qualityWarning
- **Tier**：main, temperature=0.3

#### 调用点 6：报告总结 (`generateReportSummaryWithLlm`)
- **输入**：ProgressReport（memory/review/speakingObservations/recommendations 摘要）
- **Prompt**：英语学习顾问（基于数据说话，4 字段输出）
- **Context**：报告数据的文本化摘要（总词条、新学、复习次数、正确率、口语观察、推荐任务）
- **Knowledge**：无
- **输出**：`{ overallAssessment, keyInsight, actionableSuggestion, encouragement }`
- **结构化**：✅ Zod `SummarySchema`
- **Failure**：insufficientData → null；LLM 异常 → null（不阻塞报告）
- **Tier**：main, temperature=0.5

#### 调用点 7：语音转写 (Whisper)
- **输入**：audio blob (webm, ≤25MB)
- **API**：`POST {WHISPER_BASE_URL}/audio/transcriptions`（OpenAI 兼容）
- **参数**：model=whisper-1, language=en, response_format=verbose_json, timestamp_granularities=word
- **输出**：transcript + audioMetadata（duration, wpm, pauses, wordTimestamps）
- **结构化**：非结构化，后处理计算停顿信息
- **Failure**：无 Key → 503 CONFIG_ERROR；API 失败 → 502；前端可回退文字输入
- **注意**：使用 `OPENAI_API_KEY ?? DEEPSEEK_API_KEY`，未走统一 LLM Provider 管线

### 5.3 统一 LLM 管线 (`callLlmStructured`)

```
callLlmStructured(req)
  │
  ├─ resolveProviders() → primary + fallback (env 或用户覆盖)
  │
  ├─ attemptStructured(primary, req)
  │     ├─ callAndValidate(provider, chatReq, schema)
  │     │     ├─ provider.chat() → content
  │     │     ├─ 非空检查 → MODEL_EMPTY_RESPONSE
  │     │     ├─ JSON.parse → MODEL_INVALID_JSON
  │     │     └─ schema.safeParse → MODEL_SCHEMA_MISMATCH
  │     │
  │     ├─ 成功 → 返回
  │     ├─ Provider 级错误 (timeout/429/5xx/auth) → 直接失败 (不修复)
  │     └─ 内容级错误 (empty/invalid_json/schema) → 修复重试
  │           └─ buildRepairMessages + fast tier + temp=0
  │
  ├─ primary 成功 → 返回 (log)
  ├─ primary 失败 + shouldFallback + fallback 可用 → attemptStructured(fallback)
  │     └─ shouldFallback: MODEL_TIMEOUT / MODEL_RATE_LIMITED / MODEL_PROVIDER_UNAVAILABLE
  │     └─ 不 fallback: MODEL_UNAUTHORIZED / EMPTY / INVALID_JSON / SCHEMA_MISMATCH / ERROR
  │
  └─ 全部失败 → throw MODEL_ALL_PROVIDERS_FAILED
```

---

## 6. State & Memory Map（状态与记忆）

### 6.1 用户状态清单

| 状态类型 | 字段 | 存储位置 | 修改事件 | 跨 Session 持久化 |
|---------|------|---------|---------|-----------------|
| **词条掌握状态** | status, recognitionLevel(0-2), recallLevel(0-2), applicationLevel(0-2), consecutiveCorrect, currentIntervalDays, nextReviewAt | server repo (memory/supabase) + localStorage `els_states` | 学习提交、复习提交 | ✅ (supabase) / ⚠️ (memory 进程内) / ✅ (localStorage) |
| **学习事件** | eventType(NEW/REVIEW), correctness(FAIL/HINTED/INDEPENDENT/SKIPPED), answer, hintLevel, taskType, traceId | server repo + localStorage `els_events` | 学习提交、复习提交 | ✅ / ⚠️ / ✅ |
| **口语会话** | firstAnswer, firstAnalysis, secondAnswer, secondAnalysis, status | MemorySpeakingRepository (进程内) + localStorage `els_speaking_sessions` | 创建会话、提交首答/重答 | ❌ (server memory) / ✅ (localStorage) |
| **能力观察** | dimension, level, issues[], evidence, suggestions, evidenceStatus | localStorage `els_ability_observations` (仅) | 口语分析完成后前端写入 | ✅ (localStorage only) |
| **口语评估** | feedbackAdopted, dimensionChanges, resolvedIssues, issueResolutionRate, feedbackEffectiveness, overallChange | localStorage `els_speaking_evaluations` (仅) | 口语会话完成后 | ✅ (localStorage only) |
| **备考目标** | examDate, targetBand, currentBand, dailyMinutes, weeklyWordTarget, plannedWeeks | localStorage `els_weeklyGoal` (仅) | 用户在 /goals 保存 | ✅ (localStorage only) |
| **聊天历史** | messages[] (最近50条), conversation_state | localStorage `els_chat_messages`, `els_chat_state` | 每次聊天发送/接收 | ✅ (localStorage only) |
| **词卡缓存** | LLM 生成的词卡 | localStorage `els_items` | 词卡生成后保存 | ✅ (localStorage only) |
| **用户资料** | displayName, wechat_openid, avatar_url, last_login_at | supabase `users` 表 | 登录、资料编辑 | ✅ (supabase) |
| **用户密钥** | model_config_cipher, ima_config_cipher (信封加密) | supabase `user_secrets` 表 | 模型配置、ima 配置 | ✅ (supabase) |

### 6.2 状态如何影响后续体验

| 状态 | 影响 |
|------|------|
| `nextReviewAt` | 决定今日复习队列（`getDueReviewItems` 筛选） |
| `consecutiveCorrect` | 影响复习间隔计算（当前未直接使用，仅记录） |
| `recallLevel` | 复习提交时 +1（独立正确），最高 5（schema 定义 0-2 但代码写 5，**存在不一致**） |
| `evidenceStatus` | 能力画像中判断 REPEATED_PATTERN / IMPROVING / DISPUTED |
| `abilityContext` | 口语分析时注入 LLM prompt（totalSessions>=2 时） |
| `conversation_state` | 聊天助手理解上下文（currentIntent, currentTarget 等） |
| `goalProfile` | 学习计划生成（周词汇量、阶段划分、可行性判断） |

### 6.3 User Memory 实现评估

**当前 User Memory = 原始事件存储 + 确定性聚合，无 LLM 记忆合成层。**

- ✅ 有 append-only 事件流（learning_events）
- ✅ 有 per-item 状态快照（user_item_states）
- ✅ 有口语能力观察（ability_observations）带 evidenceStatus 状态机
- ✅ 有紧凑上下文提取（retrieveAbilityContext，≤150 字）供 prompt 注入
- ❌ 无 LLM 驱动的用户画像合成（如"用户擅长学术词汇但口语流利度弱"的自然语言总结）
- ❌ 无长期记忆检索（memory retrieval）机制
- ❌ 无记忆重要性评分/遗忘机制
- ❌ 聊天记忆仅最近 50 条 localStorage，无服务端持久化
- ❌ 学习事件与口语观察之间无交叉关联（如"复习中反复出错的词在口语中也使用不当"）

**状态：PARTIAL**（有原始数据和确定性聚合，缺少 AI 记忆层）

---

## 7. Knowledge Architecture（知识架构）

### 7.1 三层分离审计

#### 层 A：User Memory（用户记忆）
- **实现位置**：`lib/ability/`（repository, writer, profile-builder, memory-retriever）+ `lib/learning/`（states, events）
- **存储**：localStorage（ability/evaluation）+ server repo（learning states/events）
- **内容**：用户的学习事件、掌握状态、口语能力观察、评估结果
- **检索方式**：确定性聚合（按维度分组、趋势计算、前缀匹配去重）
- **更新触发**：口语分析完成后前端调用 `writeAbilityObservations()`
- **状态**：**PARTIAL** — 有结构化存储和确定性聚合，但无 LLM 记忆合成、无服务端持久化（ability/evaluation）、无记忆检索引擎

#### 层 B：Knowledge Cache（知识缓存）
- **实现位置**：
  - `lib/learning/seed-catalog.ts` — 22 条 IELTS 词条，`fs.readFileSync` + 模块级 `_cache`
  - `lib/speaking/question-bank.ts` — 12 道口语题，同上
  - `lib/knowledge/retrieval.ts` — 45 个知识对象，同上 `_cache`
  - 客户端 `lib/client/demo-service.ts` — LLM 生成词卡存 localStorage `els_items`
- **存储**：进程内内存（服务端）+ localStorage（客户端词卡缓存）
- **失效策略**：无 TTL、无失效机制，进程重启重新加载
- **状态**：**IMPLEMENTED（基础）** — 静态 JSON 加载 + 内存缓存，无向量缓存、无 embedding 缓存、无缓存命中率统计

#### 层 C：IELTS Domain Knowledge Base（IELTS 领域知识库）
- **实现位置**：`data/knowledge/knowledge-objects-v1.json` + `lib/knowledge/retrieval.ts` + `lib/knowledge/types.ts`
- **规模**：45 个知识对象
- **对象类型**（discriminated union）：
  1. `official_exam_rule` — IELTS 官方评分标准、考试结构（来源：ielts.org）
  2. `project_taxonomy` — 项目内部分类（topic、lexical_function、register、item_type）
  3. `lexical_guidance` — 词汇使用指导（collocation_pattern、register_note、paraphrase_strategy、appropriacy_rule、idiomatic_usage）
- **Provenance**：每个对象带 `sourceType`（official / project_authored）、`sourceTitle`、`sourceId`（URL）、`retrievedAt`
- **检索方式**：**纯关键词匹配**，4 条规则：
  1. term 出现在 topic taxonomy 的 associatedTerms 中
  2. context 匹配 lexical_guidance 的 appliesTo.contexts
  3. topic 命中后拉入相关 lexical_guidance
  4. 始终注入一条 official_exam_rule（基于 context 推断 skill）
- **注入位置**：仅 `generateWordCardWithLlm` 的 system prompt
- **最多返回**：5 个对象
- **外部扩展**：ima 知识库（腾讯 ima OpenAPI），用户配置后用于聊天助手的上下文检索
- **状态**：**PARTIAL** — 有结构化知识对象和 provenance，但检索仅关键词匹配（无 embedding/RAG），规模小（45 对象），仅用于词卡生成（口语分析/报告/判题均不注入）

### 7.2 三层关系图

```
┌─────────────────────────────────────────────────────┐
│           IELTS Domain Knowledge Base               │
│  knowledge-objects-v1.json (45 objects)             │
│  official_exam_rule | project_taxonomy | lexical_   │
│  guidance                                           │
│  检索: retrieveKnowledge() 关键词匹配 (max 5)       │
│  注入: 仅 generateWordCardWithLlm prompt            │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              Knowledge Cache (进程内)                │
│  seed-catalog (22 items) | question-bank (12)       │
│  knowledge-objects (45) | localStorage els_items    │
│  加载: fs.readFileSync + 模块级 _cache               │
│  失效: 无 TTL，进程重启重置                          │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  User Memory                         │
│  learning_events | user_item_states (server repo)   │
│  ability_observations | speaking_evaluations (LS)   │
│  speaking_sessions (server memory)                  │
│  聚合: buildSpeakingAbilityProfile() 确定性          │
│  提取: retrieveAbilityContext() ≤150字 → prompt     │
│  注入: analyzeSpeakingWithLlm (totalSessions>=2)    │
└─────────────────────────────────────────────────────┘
```

---

## 8. Deterministic vs AI Boundary（确定性与 AI 边界）

| Task | LLM | Rule | Database | Current Implementation | Reason |
|------|-----|------|----------|----------------------|--------|
| 聊天意图识别 | ✅ fast | ✅ 关键词兜底 (mock) | — | `/api/agent/message` → LLM 优先，mock/失败时关键词匹配 | 意图分类需要语义理解，但简单场景规则足够 |
| 词卡内容生成 | ✅ main | ✅ seed 查找 (22条) | ✅ learning_items | seed 命中→规则；未命中→LLM | 长尾词汇需要 LLM，高频词用预编辑内容保证质量 |
| 答案正确性判断 | ✅ fast | ✅ 精确匹配+关键词 | — | LLM 优先，失败降级规则 | 语义等价需要 LLM，但简单匹配可兜底 |
| 复习间隔调度 | ❌ | ✅ 固定间隔表 | ✅ user_item_states | `computeReviewNextAt` 4 档固定 | 间隔重复是成熟确定性算法，无需 LLM |
| 到期复习筛选 | ❌ | ✅ nextReviewAt<=now | ✅ user_item_states | `getDueReviewItems` | 纯数据库查询 |
| 口语题目选择 | ❌ | ✅ 按 part 取第一题 | — | `pickQuestion` 确定性（非随机） | 题库小，无需 LLM 选题 |
| 口语回答分析 | ✅ main | ✅ 4维度规则引擎 | — | LLM 优先，质量门/失败降级规则 | 深度反馈需要 LLM，规则保证可用性 |
| 口语反馈质量检查 | ❌ | ✅ 4规则评分 | — | `validateFeedbackQuality` | 质量门必须确定性，不能用 LLM 查 LLM |
| 能力画像构建 | ❌ | ✅ 趋势计算+前缀聚合 | ✅ ability_observations | `buildSpeakingAbilityProfile` | 纯统计聚合 |
| 能力上下文提取 | ❌ | ✅ 最弱维度+Top3问题 | — | `retrieveAbilityContext` | 控制 prompt token 的确定性压缩 |
| 报告数据聚合 | ❌ | ✅ 分组统计 | ✅ events/states/sessions | `aggregateReportData` | 纯数据聚合 |
| 报告推荐生成 | ❌ | ✅ 6条优先级规则 | — | `generateRecommendations` | 规则可解释、可调试 |
| 报告自然语言总结 | ✅ main | ❌ | — | `generateReportSummaryWithLlm` | 个性化文案需要 LLM |
| 学习计划生成 | ❌ | ✅ 公式+阶段划分 | — | `generateStudyPlan` | 纯计算，可解释 |
| 语音转写 | ✅ Whisper | ❌ | — | `/api/speaking/transcribe` | STT 专用模型 |
| 知识检索 | ❌ | ✅ 关键词匹配4规则 | ✅ knowledge-objects | `retrieveKnowledge` | 无 embedding，纯规则 |
| evidenceStatus 升迁 | ❌ | ✅ 5状态状态机 | ✅ ability_observations | `computeEvidenceStatus` | 状态机必须确定性 |
| 会话评估 | ❌ | ✅ 维度对比+issue匹配 | ✅ speaking_evaluations | `computeSessionEvaluation` | 前后对比是确定性计算 |
| 用户认证 | ❌ | ✅ Supabase Auth / demo | ✅ auth.users | `requireUser` | 安全必须确定性 |
| 数据持久化 | ❌ | ✅ Repository 模式 | ✅ 全部表 | memory/supabase 双实现 | 数据层必须确定性 |

---

## 9. Data Model（数据模型）

### 9.1 数据库表（Supabase Schema，7 张业务表 + 2 张扩展表）

```
auth.users (Supabase 内置)
  │ 1:1
  ▼
public.users
  ├─ id (uuid, PK, FK→auth.users)
  ├─ email (text, unique)
  ├─ target_exam (text)
  ├─ preferences_json (jsonb)
  ├─ display_name (text) [0005]
  ├─ wechat_openid (text, unique) [0005]
  ├─ avatar_url (text) [0005/0006]
  ├─ last_login_at (timestamptz) [0005]
  ├─ created_at, updated_at
  │
  ├─ 1:N → public.user_item_states
  │     ├─ user_id (uuid, FK→users)
  │     ├─ item_id (uuid, FK→learning_items)
  │     ├─ status (NEW/EXPOSED/RECALLED_WITH_HELP/RECALLED_INDEPENDENTLY) [0004]
  │     ├─ recognition_level (0-2)
  │     ├─ recall_level (0-2)
  │     ├─ application_level (0-2)
  │     ├─ consecutive_correct (>=0)
  │     ├─ current_interval_days (>=0)
  │     ├─ next_review_at (timestamptz)
  │     └─ updated_at
  │     PK(user_id, item_id)
  │
  ├─ 1:N → public.learning_events
  │     ├─ id (uuid, PK)
  │     ├─ user_id (uuid, FK→users)
  │     ├─ item_id (uuid, FK→learning_items)
  │     ├─ event_type (NEW/REVIEW)
  │     ├─ task_type (MEANING_RECALL/PERSONAL_SENTENCE) [0004]
  │     ├─ answer (text, nullable)
  │     ├─ correctness (FAIL/HINTED/INDEPENDENT/SKIPPED)
  │     ├─ hint_level (0-2)
  │     ├─ result_json (jsonb)
  │     ├─ client_event_id (text) — 幂等键
  │     ├─ trace_id (text) [0004]
  │     └─ created_at
  │     unique(user_id, client_event_id)
  │
  ├─ 1:N → public.speaking_sessions
  │     ├─ id (uuid, PK)
  │     ├─ user_id (uuid, FK→users)
  │     ├─ part (P1/P2/P3)
  │     ├─ topic (text)
  │     ├─ question (text)
  │     ├─ first_answer (text)
  │     ├─ main_issue (jsonb)
  │     ├─ second_answer (text)
  │     └─ created_at
  │
  ├─ 1:N → public.ability_observations
  │     ├─ id (uuid, PK)
  │     ├─ user_id (uuid, FK→users)
  │     ├─ dimension (text)
  │     ├─ evidence_status (SINGLE_OBSERVATION/REPEATED_PATTERN/IMPROVING/DISPUTED)
  │     ├─ source_type (SPEAKING/REVIEW/LEARNING)
  │     ├─ source_id (text)
  │     ├─ note (text)
  │     └─ created_at
  │
  ├─ 1:N → public.recommendations
  │     ├─ id (uuid, PK)
  │     ├─ user_id (uuid, FK→users)
  │     ├─ task_type (text)
  │     ├─ reason (text)
  │     ├─ priority (LOW/MEDIUM/HIGH)
  │     ├─ status (PENDING/ACCEPTED/DISMISSED)
  │     ├─ payload_json (jsonb)
  │     └─ created_at
  │
  ├─ 1:1 → public.user_secrets [0003]
  │     ├─ user_id (uuid, PK, FK→auth.users)
  │     ├─ model_config_cipher (jsonb) — 信封加密
  │     ├─ ima_config_cipher (jsonb) — 信封加密
  │     ├─ kek_version (smallint)
  │     └─ created_at, updated_at
  │
  └─ (无 FK) public.wechat_login_states [0007]
        ├─ state (text, PK)
        ├─ status (pending/confirmed/expired)
        ├─ session_json (jsonb)
        ├─ created_at, expires_at

public.learning_items (公共内容池)
  ├─ id (uuid, PK)
  ├─ item_type (WORD/PHRASE/CHUNK)
  ├─ canonical_form (text)
  ├─ normalized_term (text) [0004]
  ├─ content_json (jsonb) — 完整 SeedLearningItem
  ├─ topic_tags (text[])
  └─ created_at
  unique(item_type, canonical_form)
```

### 9.2 关系总结

- `users` 1:1 `auth.users`（触发器自动创建）
- `users` 1:N `user_item_states` N:1 `learning_items`
- `users` 1:N `learning_events` N:1 `learning_items`
- `users` 1:N `speaking_sessions`
- `users` 1:N `ability_observations`
- `users` 1:N `recommendations`
- `users` 1:1 `user_secrets`
- `learning_items` 是公共内容池（所有用户共享，RLS 仅 SELECT）

### 9.3 localStorage 数据（客户端，无服务端对应表）

| Key | 内容 | 对应服务端表 |
|-----|------|------------|
| `els_states` | Record<itemId, UserItemState> | user_item_states |
| `els_events` | LearningEvent[] | learning_events |
| `els_speaking_sessions` | SpeakingSession[] | speaking_sessions |
| `els_items` | SeedLearningItem[] (LLM生成缓存) | learning_items |
| `els_ability_observations` | AbilityObservation[] | ability_observations |
| `els_speaking_evaluations` | SpeakingEvaluation[] | **无对应表** |
| `els_weeklyGoal` | GoalProfile | **无对应表** |
| `els_chat_messages` | ChatMessage[] (最近50条) | **无对应表** |
| `els_chat_state` | ConversationState | **无对应表** |

### 9.4 数据模型缺口

- `speaking_evaluations` 无数据库表（仅 localStorage）
- `goal_profile` 无数据库表（仅 localStorage）
- `chat_messages` / `chat_state` 无数据库表
- `ability_observations` 表缺少 `level`、`issues`、`evidence`、`suggestions` 字段（schema 中只有 dimension/evidence_status/source_type/source_id/note），与 domain 类型 `AbilityObservation` **不一致**
- `recall_level` schema 定义 0-2，但代码写入时 `Math.min(+1, 5)`，**schema 与代码不一致**
- `recommendations` 表存在但代码中 `generateRecommendations` 返回内存对象，**未写入数据库**

---

## 10. Quality Infrastructure Audit（质量基础设施审计）

| 能力 | 状态 | 实现位置 | 说明 |
|------|------|---------|------|
| **Logging** | ✅ IMPLEMENTED | `lib/observability/logger.ts` | 结构化 JSON 日志，4 级（debug/info/warn/error），自动带 trace_id；API 请求开始/结束日志；模型调用指标日志 |
| **Session Trace** | ⚠️ PARTIAL | `lib/observability/trace.ts` + middleware | trace_id 生成 + header 传递 + 响应头回传；但**仅存于日志，不落库**，无法事后按 trace_id 查询完整请求链 |
| **Error Handling** | ✅ IMPLEMENTED | `lib/observability/errors.ts` + `lib/llm/errors.ts` | AppError 层次结构（18 种错误码）；LlmError 分类（9 种）；所有 API Route 统一 try/catch → AppError → 结构化错误响应 |
| **Fallback** | ✅ IMPLEMENTED | 多层 | ① Provider 级 fallback（timeout/429/5xx）② JSON 修复重试（1次 fast tier）③ 任务级 fallback（判题→关键词、口语→规则引擎、报告→null）④ 聊天→关键词 mock |
| **Evaluation** | ⚠️ PARTIAL | `lib/evaluation/` | 有确定性会话评估（首答vs重答维度对比、issue解决率、反馈有效性）；但**无 LLM 输出质量评估集**、无人工标注、无自动评分 |
| **Regression Test** | ⚠️ PARTIAL | `tests/unit/` (9文件) + `tests/e2e/` (1文件) | 99 项单元测试（声称），覆盖 schema/LLM管线/学习/复习/口语/报告；但**无 LLM 输出回归测试**（mock provider 替代真实模型）、无 golden dataset |
| **Bad Case Set** | ❌ NOT IMPLEMENTED | — | 无 bad case 收集机制、无用户反馈闭环、无错误样本库 |
| **Prompt Version** | ⚠️ PARTIAL | 硬编码常量 | `generate-word-card.ts` 有 `PROMPT_VERSION = "v1.1-knowledge-layer"`；其他 prompt 无版本号；无集中式 prompt 注册表、无版本对比、无 A/B 机制 |
| **Model Version** | ⚠️ PARTIAL | 日志记录 | 每次 LLM 调用记录实际 model 名到日志；但**不持久化到数据库**，无法按模型版本回溯分析；用户可配置自有模型（18 家厂商预设） |
| **Retrieval Trace** | ⚠️ PARTIAL | `generationMeta.knowledgeObjectIds` | 词卡生成时记录命中的知识对象 ID 到 `generationMeta`；但**不持久化到数据库**（仅返回给前端，前端可能存 localStorage）；口语/报告无检索 trace |
| **Memory Write Trace** | ❌ NOT IMPLEMENTED | — | ability_observations 写入无 trace_id 关联；无写入审计日志；无法追溯"哪次分析导致了哪条记忆写入" |
| **Rate Limiting** | ❌ NOT IMPLEMENTED | — | 无 API 速率限制（声明为非阻塞部署 gap） |
| **CI/CD** | ❌ NOT IMPLEMENTED | `.github/` 目录为空 | README 提到 GitHub Actions 但实际无 workflow 文件 |
| **Input Validation** | ✅ IMPLEMENTED | 所有 API Route | Zod schema 校验在业务逻辑之前 |
| **Idempotency** | ✅ IMPLEMENTED | `client_event_id` | learning_events 唯一约束，重复提交不创建重复事件 |
| **Security Headers** | ✅ IMPLEMENTED | `middleware.ts` | CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy |
| **RLS** | ⚠️ PARTIAL | `0002_rls_policies.sql` | 所有业务表 RLS 策略已写；但**未在生产环境实测**（声明为非阻塞 gap）；user_secrets 无客户端策略（仅 service_role） |

---

## 11. Current Gaps（当前缺口，AI PM 求职竞争力导向）

### P0 — 致命/结构性缺口（不解决则产品无法规模化）

| # | 缺口 | 影响 | 证据位置 |
|---|------|------|---------|
| P0-1 | **双数据路径分裂**：前端 demo-service (localStorage) 与服务端 Repository 无同步，同一用户状态可能不一致 | 用户换设备/清缓存后数据丢失；服务端报告与客户端展示矛盾；无法支撑多端 | `lib/client/demo-service.ts` vs `lib/learning/repositories/`；`components/report/report-page.tsx` 使用 `generateClientReport()` 而非 `/api/report` |
| P0-2 | **口语/能力/评估仅 localStorage**：SpeakingRepository 只有 Memory 实现，ability/evaluation 只有 localStorage 实现 | 口语训练数据不跨设备、不跨浏览器；服务端报告无法获取口语数据 | `lib/speaking/service.ts`（仅 `MemorySpeakingRepository`）；`lib/ability/repository.ts`（仅 `LocalStorageAbilityRepository`）；`lib/evaluation/repository.ts`（仅 localStorage） |
| P0-3 | **无 AI 记忆层**：User Memory 停留在原始事件+确定性聚合，无 LLM 驱动的用户画像合成、记忆检索、重要性评分 | 无法展示"AI 懂你"的产品体验；口语分析注入的 abilityContext 是确定性压缩而非语义记忆；无法跨学习域关联（词汇↔口语） | `lib/ability/memory-retriever.ts`（纯确定性，≤150字模板）；无 memory synthesis 模块 |
| P0-4 | **知识检索仅关键词匹配**：45 个知识对象用 includes 匹配，无 embedding、无向量库、无 RAG | 词卡生成的知识注入召回率低、精度差；无法处理同义词/语义相关词；知识规模无法扩展 | `lib/knowledge/retrieval.ts`（4 条 includes 规则）；无向量数据库依赖 |

### P1 — 重要产品/AI Quality 缺口（显著影响体验和竞争力）

| # | 缺口 | 影响 | 证据位置 |
|---|------|------|---------|
| P1-1 | **无 LLM 质量评估体系**：无 evaluation set、无 golden dataset、无回归测试、无 bad case 闭环 | 无法证明 LLM 输出质量；prompt 变更无法量化影响；面试中无法展示 AI Quality 工程能力 | `tests/unit/` 全部用 mock provider；无 `tests/eval/` 目录 |
| P1-2 | **Agent Tools 层完全废弃**：`lib/agent/tools/` 6 个工具全是 P0 占位，实际逻辑在 API Route 内联 | 架构文档与实现不符；无法展示 tool-use 能力；扩展新功能需改 API Route 而非加工具 | `lib/agent/tools/create-word-card.ts`（返回 placeholder）；`lib/agent/tools/analyze-speaking-answer.ts`（返回 PLACEHOLDER） |
| P1-3 | **无 Prompt 管理系统**：prompt 散落在各 task 文件，版本号硬编码且不统一，无 A/B 测试 | prompt 优化无法追踪；无法回滚；无法对比不同 prompt 的效果 | `lib/llm/tasks/*.ts`（prompt 内联）；仅 generate-word-card 有 PROMPT_VERSION |
| P1-4 | **Trace 不落库**：trace_id 仅在日志中，无法按 trace 查询完整请求链（LLM 输入/输出/检索结果/状态变更） | 无法做 post-hoc 分析、无法调试用户投诉、无法构建训练数据 | `lib/observability/trace.ts`（仅生成和传递）；无 traces 表 |
| P1-5 | **报告页不调服务端 API**：`/report` 页面使用 `generateClientReport()` 读 localStorage，`/api/report` 路由存在但前端未调用 | 服务端报告聚合代码是死代码；报告数据不经过 LLM 总结；双路径问题的典型表现 | `components/report/report-page.tsx:62`（`generateClientReport()`）；无 `fetch('/api/report')` |
| P1-6 | **复习判题存在两套未统一逻辑**：`lib/review/answer-judge.ts`（纯确定性）与 `judgeAnswerWithLlm`（LLM优先）并存，复习流程只用后者 | 确定性判题函数是死代码；LLM 判题在 mock 模式下行为不确定；代码冗余 | `app/api/review/submit/route.ts:60`（用 judgeAnswerWithLlm）；`lib/review/answer-judge.ts`（未被 import） |
| P1-7 | **数据模型不一致**：recall_level schema 0-2 但代码写 5；ability_observations 表缺 level/issues/evidence 字段；recommendations 表未使用 | 数据库迁移会失败或数据截断；domain 类型与 DB schema 脱节 | `0001_init_schema.sql:80` (recall_level 0-2)；`app/api/review/submit/route.ts:106` (Math.min(+1,5))；`0001_init_schema.sql:142-155` (ability_observations 无 level/issues) |

### P2 — 改进型缺口（提升完善度和专业感）

| # | 缺口 | 影响 |
|---|------|------|
| P2-1 | 仅覆盖口语+词汇，无写作/阅读/听力 | IELTS 全品类产品定位不成立 |
| P2-2 | Pronunciation 维度未实现（Phase 5 标注） | 口语评分缺第四维度 |
| P2-3 | 题库极小（22 词 + 12 题），依赖 LLM 生成质量不稳定 | 内容丰富度不足 |
| P2-4 | 无 CI/CD（.github 为空）、无 rate limiting | 工程成熟度不足 |
| P2-5 | 聊天记忆仅最近 50 条 localStorage，无服务端持久化 | 跨设备聊天历史丢失 |
| P2-6 | 无用户反馈闭环（点赞/踩/纠错） | 无法收集 bad case、无法优化 prompt |
| P2-7 | 无学习提醒/通知机制 | 留存驱动不足 |
| P2-8 | 无 A/B 实验框架 | 无法数据驱动优化 |
| P2-9 | Supabase RLS 未实测、微信登录未实测 | 生产就绪度存疑 |
| P2-10 | 无离线模式/PWA | 移动端体验受限 |

---

## 12. Recommended V3 Priorities（V3 升级建议优先级）

> 以下仅为建议方向，本轮不实施。

### 第一优先级：统一数据层（解决 P0-1, P0-2）
1. 废弃客户端 demo-service 的直写路径，所有数据走服务端 API
2. 为 SpeakingRepository、AbilityRepository、EvaluationRepository 实现 Supabase 版本
3. 补充缺失的数据库表（speaking_evaluations、goal_profiles、chat_messages）
4. 修复 schema 与代码不一致（recall_level、ability_observations 字段）
5. 报告页改为调用 `/api/report`，删除死代码路径

### 第二优先级：构建 AI Memory 层（解决 P0-3）
1. 引入 LLM 驱动的用户画像合成（从 events/observations 生成自然语言 user profile）
2. 实现 memory retrieval（按语义相关性检索历史学习事件和能力观察）
3. 实现记忆重要性评分和遗忘机制
4. 将 memory context 注入所有 LLM 调用点（词卡、判题、口语、报告），而非仅口语

### 第三优先级：升级知识检索为 RAG（解决 P0-4）
1. 为 knowledge-objects 生成 embedding，接入向量数据库（pgvector / Supabase Vector）
2. 实现混合检索（关键词 + 语义）
3. 将知识注入扩展到口语分析、报告总结、判题
4. 建立知识对象的更新和版本管理机制

### 第四优先级：建立 AI Quality 体系（解决 P1-1, P1-3, P1-4）
1. 构建 evaluation set（覆盖 4 个 LLM 调用点，每点 20-50 条标注样本）
2. 实现 prompt 版本管理（集中注册表 + 版本号 + 变更日志）
3. 实现 trace 落库（记录每次 LLM 调用的输入/输出/检索/耗时/模型）
4. 建立 bad case 收集流程（用户反馈 → trace 关联 → 评估集）
5. 实现回归测试（prompt 变更后自动跑 evaluation set）

### 第五优先级：产品体验扩展
1. 接入写作训练（IELTS Writing Task 1/2 + LLM 评分）
2. 实现 Pronunciation 维度（音素级评分或 Whisper 对齐）
3. 扩展题库和知识对象规模
4. 学习提醒和留存机制

---

## 13. 本轮状态

**M0_STATUS: PASS**

所有核心组件均已读取并定位，无 BLOCKED 项。以下为各审计维度的确认状态：

| 审计项 | 状态 | 备注 |
|--------|------|------|
| Product Map | ✅ CONFIRMED | 16 个用户可见功能，全部定位到组件和 API |
| Architecture Map | ✅ CONFIRMED | Next.js + Supabase + 单 Agent + LLM Provider 抽象 |
| Four Core Flows | ✅ CONFIRMED | 新词/复习/口语/报告，逐组件追踪完成 |
| AI Capability Map | ✅ CONFIRMED | 6 个 LLM 业务调用点 + 1 个 STT，全部定位 |
| State & Memory Map | ✅ CONFIRMED | 10 类状态，存储位置和修改事件全部定位 |
| Knowledge Architecture | ✅ CONFIRMED | 三层分离审计完成（User Memory / Cache / KB） |
| Deterministic vs AI | ✅ CONFIRMED | 20 项任务边界表完成 |
| Data Model | ✅ CONFIRMED | 9 张 DB 表 + 9 个 localStorage key，关系梳理完成 |
| Quality Infrastructure | ✅ CONFIRMED | 16 项质量能力审计完成 |
| Gap List | ✅ CONFIRMED | P0×4, P1×7, P2×10 |
| V3 Priorities | ✅ CONFIRMED | 5 个优先级方向 |

**UNVERIFIED 项**（代码存在但无法在当前环境确认运行时行为）：
- Supabase RLS 策略在真实云端的生效情况（无云端项目）
- Bailian / DeepSeek 真实 API Key 冒烟（无 Key）
- 微信扫码登录全流程（无 AppID/Secret）
- Whisper STT 实际转写质量（无 Key）
- 99 项单元测试的实际通过情况（未运行测试）

---

*报告生成时间：2026-09-09 | 审计文件数：60+ | 代码行数覆盖：~15,000 行*
