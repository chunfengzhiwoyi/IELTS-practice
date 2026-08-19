/**
 * ModelTier → 具体模型名 的映射
 * ------------------------------------------------------------
 * 交接单 §9.3：不在代码中写死型号，走环境变量注入。
 * 本模块负责把 ModelTier + ProviderKind 翻译成具体 model 字符串。
 */
import { getServerEnv } from "@/lib/env";

import type { ModelTier, ProviderKind } from "@/lib/llm/types";

export function resolveModelName(provider: ProviderKind, tier: ModelTier): string {
  const env = getServerEnv();
  switch (provider) {
    case "mock":
      return tier === "fast" ? "mock-fast" : "mock-main";
    case "bailian": {
      if (!env.bailian) {
        throw new Error("[model-router] Bailian env not configured");
      }
      return tier === "fast" ? env.bailian.BAILIAN_FAST_MODEL : env.bailian.BAILIAN_MAIN_MODEL;
    }
    case "deepseek": {
      if (!env.deepseek) {
        throw new Error("[model-router] DeepSeek env not configured");
      }
      return tier === "fast" ? env.deepseek.DEEPSEEK_FAST_MODEL : env.deepseek.DEEPSEEK_MAIN_MODEL;
    }
    default:
      throw new Error(`[model-router] 未知 Provider: ${provider}`);
  }
}
