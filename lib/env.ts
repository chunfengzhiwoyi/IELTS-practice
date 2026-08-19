/**
 * 环境变量集中校验
 * ------------------------------------------------------------
 * 设计原则：
 *  - 只校验当前运行模式真正需要的变量
 *  - Supabase 变量仅在 AUTH_MODE=supabase 或 DATA_PROVIDER=supabase 时校验
 *  - LLM Provider 变量按需校验：只有当前启用的 Provider 才要求 Key
 *  - 未启用的 Provider 缺变量不阻止启动
 *  - 所有 API Key 都不允许带 NEXT_PUBLIC_ 前缀
 */
import { z } from "zod";

// =============================================================
// Schemas
// =============================================================

/** 始终需要的基础变量 */
const coreServerEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  AUTH_MODE: z.enum(["demo", "supabase"]).default("demo"),
  DATA_PROVIDER: z.enum(["memory", "supabase"]).default("memory"),
});

/** Supabase 变量（仅当需要时校验） */
const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // 密钥保险库主密钥（KEK）：仅服务端使用，建议 openssl rand -hex 32 生成 64 位 hex
  SECRET_ENCRYPTION_KEY: z.string().min(16, "SECRET_ENCRYPTION_KEY 至少 16 字符（建议 64 位 hex）"),
});

const boolLike = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0"), z.undefined()])
  .transform((v) => v === "true" || v === "1");

export const ProviderKindSchema = z.enum(["mock", "bailian", "deepseek", "user"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

const llmRoutingSchema = z.object({
  LLM_PRIMARY_PROVIDER: ProviderKindSchema.default("mock"),
  LLM_FALLBACK_PROVIDER: ProviderKindSchema.optional(),
  LLM_FALLBACK_ENABLED: boolLike,
  LLM_MOCK_ENABLED: boolLike.default("true"),
});

const bailianEnvSchema = z.object({
  BAILIAN_API_KEY: z.string().min(1, "缺少 BAILIAN_API_KEY"),
  BAILIAN_BASE_URL: z
    .string()
    .url("BAILIAN_BASE_URL 必须是合法 URL")
    .refine(
      (v) => !v.includes("{WorkspaceId}"),
      "BAILIAN_BASE_URL 中的 {WorkspaceId} 占位符尚未替换",
    ),
  BAILIAN_FAST_MODEL: z.string().min(1),
  BAILIAN_MAIN_MODEL: z.string().min(1),
});

const deepseekEnvSchema = z.object({
  DEEPSEEK_API_KEY: z.string().min(1, "缺少 DEEPSEEK_API_KEY"),
  DEEPSEEK_BASE_URL: z.string().url(),
  DEEPSEEK_FAST_MODEL: z.string().min(1),
  DEEPSEEK_MAIN_MODEL: z.string().min(1),
});

// =============================================================
// Types
// =============================================================

export type CoreServerEnv = z.infer<typeof coreServerEnvSchema>;
export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;
export type LlmRoutingEnv = z.infer<typeof llmRoutingSchema>;
export type BailianEnv = z.infer<typeof bailianEnvSchema>;
export type DeepSeekEnv = z.infer<typeof deepseekEnvSchema>;

export interface ServerEnv extends CoreServerEnv, LlmRoutingEnv {
  supabase: SupabaseEnv | null;
  bailian: BailianEnv | null;
  deepseek: DeepSeekEnv | null;
}

// 客户端 schema（不再强制要求 Supabase）
export interface ClientEnv {
  NEXT_PUBLIC_APP_URL: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

// =============================================================
// 校验入口
// =============================================================

let cachedServerEnv: ServerEnv | null = null;

function formatIssues(prefix: string, issues: z.ZodIssue[]): string {
  return issues.map((i) => `  ${prefix}${i.path.join(".")}: ${i.message}`).join("\n");
}

function providersToValidate(routing: LlmRoutingEnv): ProviderKind[] {
  const set = new Set<ProviderKind>();
  if (routing.LLM_PRIMARY_PROVIDER !== "mock") set.add(routing.LLM_PRIMARY_PROVIDER);
  if (
    routing.LLM_FALLBACK_ENABLED &&
    routing.LLM_FALLBACK_PROVIDER &&
    routing.LLM_FALLBACK_PROVIDER !== "mock"
  ) {
    set.add(routing.LLM_FALLBACK_PROVIDER);
  }
  return [...set];
}

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  // 1. Core variables (always required)
  const coreResult = coreServerEnvSchema.safeParse(process.env);
  const routingResult = llmRoutingSchema.safeParse(process.env);

  if (!coreResult.success || !routingResult.success) {
    const parts: string[] = [];
    if (!coreResult.success) parts.push(formatIssues("core.", coreResult.error.issues));
    if (!routingResult.success) parts.push(formatIssues("routing.", routingResult.error.issues));
    throw new Error(`[env] 服务端环境变量校验失败:\n${parts.join("\n")}\n请检查 .env.local`);
  }

  const core = coreResult.data;
  const routing = routingResult.data;

  // 2. Supabase: only validate if AUTH_MODE=supabase or DATA_PROVIDER=supabase
  const needsSupabase = core.AUTH_MODE === "supabase" || core.DATA_PROVIDER === "supabase";
  let supabase: SupabaseEnv | null = null;
  if (needsSupabase) {
    const r = supabaseEnvSchema.safeParse(process.env);
    if (!r.success) {
      throw new Error(
        `[env] AUTH_MODE=supabase 或 DATA_PROVIDER=supabase 需要 Supabase 变量:\n` +
          formatIssues("supabase.", r.error.issues),
      );
    }
    supabase = r.data;
  } else {
    // 尝试宽松解析（有就存，没有就 null）
    const r = supabaseEnvSchema.safeParse(process.env);
    supabase = r.success ? r.data : null;
  }

  // 3. LLM Providers: only validate active ones
  const activeProviders = providersToValidate(routing);
  const activeSet = new Set(activeProviders);
  const providerIssues: string[] = [];

  let bailian: BailianEnv | null = null;
  if (activeSet.has("bailian")) {
    const r = bailianEnvSchema.safeParse(process.env);
    if (!r.success) providerIssues.push(formatIssues("bailian.", r.error.issues));
    else bailian = r.data;
  } else {
    const r = bailianEnvSchema.safeParse(process.env);
    bailian = r.success ? r.data : null;
  }

  let deepseek: DeepSeekEnv | null = null;
  if (activeSet.has("deepseek")) {
    const r = deepseekEnvSchema.safeParse(process.env);
    if (!r.success) providerIssues.push(formatIssues("deepseek.", r.error.issues));
    else deepseek = r.data;
  } else {
    const r = deepseekEnvSchema.safeParse(process.env);
    deepseek = r.success ? r.data : null;
  }

  if (providerIssues.length > 0) {
    throw new Error(
      `[env] 当前启用 Provider 的配置不完整:\n${providerIssues.join("\n")}\n` +
        `启用的 Provider: ${activeProviders.join(", ") || "(none)"}`,
    );
  }

  cachedServerEnv = { ...core, ...routing, supabase, bailian, deepseek };
  return cachedServerEnv;
}

/** 客户端环境变量（宽松，不强制 Supabase） */
export function getClientEnv(): ClientEnv {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

// =============================================================
// 便利函数
// =============================================================

export function resetServerEnvCacheForTests(): void {
  cachedServerEnv = null;
}

export function isPlaceholderSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return !url || url.includes("placeholder.supabase.co");
}

export function currentPrimaryProviderKind(): ProviderKind {
  const raw = process.env.LLM_PRIMARY_PROVIDER;
  const parsed = ProviderKindSchema.safeParse(raw);
  return parsed.success ? parsed.data : "mock";
}

export function isMockPrimary(): boolean {
  return currentPrimaryProviderKind() === "mock";
}
