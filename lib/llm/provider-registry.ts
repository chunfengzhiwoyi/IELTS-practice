/**
 * Provider Registry
 * ------------------------------------------------------------
 * 根据环境变量选择 primary / fallback Provider。
 * Provider 实例懒加载并缓存；每个 Provider 只初始化一次 OpenAI 客户端。
 *
 * 测试用途：`__resetRegistryForTests` 清空缓存 + 允许注入自定义 Provider。
 */
import "server-only";

import { getServerEnv } from "@/lib/env";
import { createBailianProvider } from "@/lib/llm/providers/bailian-provider";
import { createDeepSeekProvider } from "@/lib/llm/providers/deepseek-provider";
import { createMockProvider } from "@/lib/llm/providers/mock-provider";
import type { LlmProvider } from "@/lib/llm/provider";
import type { ProviderKind } from "@/lib/llm/types";
import { AppError } from "@/lib/observability/errors";

const cache = new Map<ProviderKind, LlmProvider>();
const testOverrides = new Map<ProviderKind, LlmProvider>();

/** 获取指定 Provider 实例（懒加载 + 缓存） */
export function getProvider(kind: ProviderKind): LlmProvider {
  const override = testOverrides.get(kind);
  if (override) return override;

  const cached = cache.get(kind);
  if (cached) return cached;

  const provider = buildProvider(kind);
  cache.set(kind, provider);
  return provider;
}

function buildProvider(kind: ProviderKind): LlmProvider {
  if (kind === "mock") return createMockProvider();

  const env = getServerEnv();
  if (kind === "bailian") {
    if (!env.bailian) {
      throw new AppError("CONFIG_ERROR", "Bailian provider 未配置");
    }
    return createBailianProvider({
      apiKey: env.bailian.BAILIAN_API_KEY,
      baseUrl: env.bailian.BAILIAN_BASE_URL,
      fastModel: env.bailian.BAILIAN_FAST_MODEL,
      mainModel: env.bailian.BAILIAN_MAIN_MODEL,
    });
  }
  if (kind === "deepseek") {
    if (!env.deepseek) {
      throw new AppError("CONFIG_ERROR", "DeepSeek provider 未配置");
    }
    return createDeepSeekProvider({
      apiKey: env.deepseek.DEEPSEEK_API_KEY,
      baseUrl: env.deepseek.DEEPSEEK_BASE_URL,
      fastModel: env.deepseek.DEEPSEEK_FAST_MODEL,
      mainModel: env.deepseek.DEEPSEEK_MAIN_MODEL,
    });
  }
  throw new AppError("CONFIG_ERROR", `未知 provider: ${kind as string}`);
}

export interface ResolvedProviders {
  primary: LlmProvider;
  fallback: LlmProvider | null;
  primaryKind: ProviderKind;
  fallbackKind: ProviderKind | null;
  fallbackEnabled: boolean;
}

/** 按 env 解析主备 Provider */
export function resolveProviders(): ResolvedProviders {
  const env = getServerEnv();
  const primaryKind = env.LLM_PRIMARY_PROVIDER;
  const primary = getProvider(primaryKind);

  const fallbackEnabled = env.LLM_FALLBACK_ENABLED;
  const fallbackKind = env.LLM_FALLBACK_PROVIDER ?? null;

  let fallback: LlmProvider | null = null;
  if (fallbackEnabled && fallbackKind && fallbackKind !== primaryKind) {
    fallback = getProvider(fallbackKind);
  }

  return {
    primary,
    fallback,
    primaryKind,
    fallbackKind: fallbackEnabled ? fallbackKind : null,
    fallbackEnabled,
  };
}

// ---------------- 测试辅助 ----------------

export function __setProviderForTests(kind: ProviderKind, provider: LlmProvider): void {
  testOverrides.set(kind, provider);
}

export function __resetRegistryForTests(): void {
  cache.clear();
  testOverrides.clear();
}
