# 英语高效学习助手 · MVP 0.1

单 Agent + 确定性工具 + 持久化数据库的英语学习产品，雅思为具体学习内容示例。

严格按照《英语高效学习助手 MVP 0.1 开发交接单 v0.1》分阶段实现。

## 技术栈

- **前端与服务端**：Next.js 15 App Router + TypeScript
- **数据与登录**：Supabase Postgres + Auth + Row Level Security
- **智能体编排**：单 Agent + 统一 LLM Provider 层（P0.5 支持 mock / Bailian / DeepSeek）
- **模型 SDK**：`openai` npm SDK（通过 OpenAI 兼容模式访问 Bailian 与 DeepSeek）
- **校验**：Zod
- **测试**：Vitest（单元）+ Playwright（E2E）
- **CI**：GitHub Actions

## LLM Provider 架构（P0.5）

```
    ┌──────────────────────────────┐
    │ POST /api/agent/message      │
    └──────────────┬───────────────┘
                   │
    ┌──────────────▼──────────────┐
    │ lib/agent/agent.ts          │ 不感知 Provider 细节
    │   - system prompt + JSON 契约│
    │   - trace_id 强制注入       │
    └──────────────┬──────────────┘
                   │ callLlmStructured
    ┌──────────────▼──────────────┐
    │ lib/llm/structured-output   │
    │   - non-empty check         │
    │   - JSON.parse              │
    │   - Zod validate            │
    │   - fast 修复重试 (1 次)     │
    │   - 主备 fallback（可关闭） │
    └──────────────┬──────────────┘
                   │
     ┌─────────────┴──────────────┐
     ▼            ▼               ▼
  mock       bailian          deepseek
  provider   provider         provider
              │                 │
              │ new OpenAI({    │ new OpenAI({
              │   baseURL:      │   baseURL:
              │   compatible-   │   api.deepseek.com
              │   mode/v1 })    │ })
```

**Fallback 规则**（`shouldFallback` in `lib/llm/errors.ts`）：
- ✅ 触发切换：`MODEL_TIMEOUT` / `MODEL_RATE_LIMITED (429)` / `MODEL_PROVIDER_UNAVAILABLE (5xx)`
- ❌ 不触发切换：`MODEL_UNAUTHORIZED (401/403)` / `MODEL_EMPTY_RESPONSE` / `MODEL_INVALID_JSON` / `MODEL_SCHEMA_MISMATCH` / `MODEL_ERROR`

## 项目结构

```
english-learning-agent/
├─ app/                     # Next.js App Router
│  ├─ (auth)/login/         # 登录页 + LoginForm
│  ├─ auth/callback/        # 魔法链接回调
│  ├─ learn/                # 新词学习页（P1 实现）
│  ├─ review/               # 复习页（P2 实现）
│  ├─ speaking/             # 口语页（P3 实现）
│  ├─ report/               # 报告页（P4 实现）
│  ├─ api/agent/message/    # 唯一自然语言入口
│  └─ page.tsx              # 首页
├─ components/              # 复用组件
│  └─ agent/AgentChat.tsx
├─ lib/
│  ├─ agent/                # 系统指令 / schemas / 工具占位 / 运行时
│  ├─ auth/                 # 会话助手
│  ├─ db/                   # Supabase 客户端 + Database 类型
│  ├─ env.ts                # Zod 校验的环境变量
│  └─ observability/        # trace / logger / errors
├─ supabase/
│  ├─ migrations/           # 0001_init_schema / 0002_rls_policies
│  └─ seed.sql
├─ tests/
│  ├─ unit/                 # Vitest
│  └─ e2e/                  # Playwright
├─ docs/
│  └─ implementation-status.md
└─ .github/workflows/ci.yml
```

## 本地开发

### 1. 安装依赖

```powershell
npm install
```

### 2. 环境变量

复制模板并填入真实值：

```powershell
Copy-Item .env.example .env.local
```

需要的凭据：
- Supabase 项目 URL、anon key、service role key
- OpenAI API Key

若尚未准备真实凭据，`.env.local` 已内置占位值，Agent 会自动走 **Mock 分支**，本地开发无需付费即可跑通结构。

### 3. Supabase 数据库

在 Supabase Studio 的 SQL Editor 中依次执行：
1. `supabase/migrations/0001_init_schema.sql`
2. `supabase/migrations/0002_rls_policies.sql`
3. （可选）`supabase/seed.sql`

### 4. 常用命令

```powershell
npm run dev              # 启动开发服务器
npm run build            # 生产构建
npm run lint             # ESLint
npm run typecheck        # TypeScript
npm test                 # Vitest 单元测试
npm run test:e2e         # Playwright（首次需 npx playwright install）

# P0.5 真实 Provider 冒烟（需在 .env.local 填对应 Key）
npm run smoke:bailian    # 百炼五意图冒烟
npm run smoke:deepseek   # DeepSeek 五意图冒烟
npm run smoke:providers  # 双 Provider 对比表
```

## LLM Provider 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PRIMARY_PROVIDER` | 主 Provider：`mock` \| `bailian` \| `deepseek` | `mock` |
| `LLM_FALLBACK_PROVIDER` | 备用 Provider（同上枚举） | 未设置 |
| `LLM_FALLBACK_ENABLED` | 是否启用 fallback | `false` |
| `LLM_MOCK_ENABLED` | 允许 mock 参与选择 | `true` |
| `BAILIAN_API_KEY` | 百炼 API Key（服务端专用） | 空 |
| `BAILIAN_BASE_URL` | 百炼 OpenAI 兼容 URL，`{WorkspaceId}` 须替换 | 模板 |
| `BAILIAN_FAST_MODEL` / `BAILIAN_MAIN_MODEL` | 百炼模型分层 | `qwen-flash` / `qwen-plus` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（服务端专用） | 空 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | 同左 |
| `DEEPSEEK_FAST_MODEL` / `DEEPSEEK_MAIN_MODEL` | 只允许 `deepseek-v4-flash` / `deepseek-v4-pro`；`deepseek-chat` / `deepseek-reasoner` 已弃用 | v4 系列 |

**安全约束**：
- 所有 `*_API_KEY` 变量均无 `NEXT_PUBLIC_` 前缀，绝不会打包进浏览器
- `import "server-only"` 保护 `lib/llm/index.ts` 与 `lib/llm/provider-registry.ts`
- `.env` / `.env.local` / `.env.*.local` 已在 `.gitignore` 与 `.kiroignore` 中忽略
- 静态代码检查禁止在 `app/` 或 `lib/agent/` 中直接 `new OpenAI(...)`（由 `llm-safety.test.ts` 强制）

## Agent 契约

见 `lib/agent/schemas.ts`。所有 `POST /api/agent/message` 返回都必须通过 `AgentResponseSchema` 校验。

```ts
type AgentResponse = {
  intent: "NEW_ITEM" | "REVIEW" | "SPEAKING" | "REPORT" | "UNSUPPORTED";
  reply: string;
  ui_action: {
    type: "SHOW_WORD_CARD" | "OPEN_REVIEW" | "OPEN_SPEAKING" | "SHOW_REPORT" | "SHOW_MESSAGE";
    payload: Record<string, unknown>;
  };
  persistence_required: boolean;
  trace_id: string;
};
```

## 开发纪律

- 每次只推进当前阶段（当前 P0），不跨阶段实现
- 新增业务状态或数据表必须先形成 CR，再改交接单，再开发
- 模型不得直接写数据库；所有写入走领域服务层
- 不写死具体模型名称，通过 `OPENAI_FAST_MODEL` / `OPENAI_ANALYSIS_MODEL` 环境变量注入

进度追踪见 [`docs/implementation-status.md`](./docs/implementation-status.md)。
