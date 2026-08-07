/**
 * 环境变量集中校验
 * ------------------------------------------------------------
 * P0.5 版本
 *
 * 设计原则：
 *  - 基础变量（Supabase / App）总是校验
 *  - LLM Provider 变量按需校验：只有当前启用的 Provider 才要求 Key 与 URL
 *  - 未启用的 Provider 缺变量不阻止启动（例如 primary=mock 时 Bailian/DeepSeek Key 可空）
 *  - 所有 Provider 的 API Key 都不允许带 NEXT_PUBLIC_ 前缀（构建时打包进浏览器）
 *
 * 参考交接单 §9.2 / §9.3。
 */
import { z } from "zod";

// =============================================================
// 基础 Schema
// =============================================================

const baseServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const boolLike = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0"), z.undefined()])
  .transform((v) => v === "true" || v === "1");

export const ProviderKindSchema = z.enum(["mock", "bailian", "deepseek"]);
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
  DEEPSEEK_FAST_MODEL: z
    .string()
    .min(1),
  DEEPSEEK_MAIN_MODEL: z
    .string()
    .min(1),
});

// 客户端可读的环境变量 Schema（严格只允许 NEXT_PUBLIC_*）
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export type BaseServerEnv = z.infer<typeof baseServerEnvSchema>;
export type LlmRoutingEnv = z.infer<typeof llmRoutingSchema>;
export type BailianEnv = z.infer<typeof bailianEnvSchema>;
export type DeepSeekEnv = z.infer<typeof deepseekEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

export interface ServerEnv extends BaseServerEnv, LlmRoutingEnv {
  bailian: BailianEnv | null;
  deepseek: DeepSeekEnv | null;
}

// =============================================================
// 校验入口
// =============================================================

let cachedServerEnv: ServerEnv | null = null;

function formatIssues(prefix: string, issues: z.ZodIssue[]): string {
  return issues.map((i) => `  ${prefix}${i.path.join(".")}: ${i.message}`).join("\n");
}

/**
 * 按当前启用的 Provider 收集需要校验的 Provider Schema
 * - primary provider 必须校验（除 mock）
 * - fallback provider 若 LLM_FALLBACK_ENABLED=true 且非 mock，也需校验
 */
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

  const baseResult = baseServerEnvSchema.safeParse(process.env);
  const routingResult = llmRoutingSchema.safeParse(process.env);
  if (!baseResult.success || !routingResult.success) {
    const parts: string[] = [];
    if (!baseResult.success) parts.push(formatIssues("base.", baseResult.error.issues));
    if (!routingResult.success) parts.push(formatIssues("routing.", routingResult.error.issues));
    throw new Error(`[env] 服务端环境变量校验失败:\n${parts.join("\n")}\n请检查 .env.local`);
  }

  const base = baseResult.data;
  const routing = routingResult.data;

  // 按需 provider 校验
  const activeProviders = providersToValidate(routing);
  const activeSet = new Set(activeProviders);
  const providerIssues: string[] = [];

  let bailian: BailianEnv | null = null;
  if (activeSet.has("bailian")) {
    const r = bailianEnvSchema.safeParse(process.env);
    if (!r.success) providerIssues.push(formatIssues("bailian.", r.error.issues));
    else bailian = r.data;
  } else {
    // 未启用时尝试宽松解析：若都填了就存下来（便于运行时切换），若不完整就置 null
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

  cachedServerEnv = { ...base, ...routing, bailian, deepseek };
  return cachedServerEnv;
}

/** 客户端环境变量 */
export function getClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    throw new Error("[env] 客户端环境变量缺失或非法");
  }
  return parsed.data;
}

// =============================================================
// 便利函数
// =============================================================

/** 测试用：清空缓存，让下一次 getServerEnv 重新解析 process.env */
export function resetServerEnvCacheForTests(): void {
  cachedServerEnv = null;
}

/**
 * 判断当前是否使用占位 Supabase 配置。
 */
export function isPlaceholderSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.includes("placeholder.supabase.co");
}

/**
 * 快速拿到当前配置的主 Provider 类型（不做完整校验）。
 * 用于本地占位提示等轻量判断。
 */
export function currentPrimaryProviderKind(): ProviderKind {
  const raw = process.env.LLM_PRIMARY_PROVIDER;
  const parsed = ProviderKindSchema.safeParse(raw);
  return parsed.success ? parsed.data : "mock";
}

/**
 * 判断当前主 Provider 是否使用 Mock（等价于 P0 阶段的 isPlaceholderOpenAIKey）
 */
export function isMockPrimary(): boolean {
  return currentPrimaryProviderKind() === "mock";
}
