/**
 * Provider Registry & 按 Provider 按需校验
 * ------------------------------------------------------------
 * 覆盖交付项：
 *   1. Provider Registry 选择测试
 *   2. Bailian 配置校验测试
 *   3. DeepSeek 配置校验测试
 *   4. 未启用 Provider 缺 Key 不阻塞测试
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getServerEnv, resetServerEnvCacheForTests } from "@/lib/env";
import { __resetRegistryForTests, getProvider, resolveProviders } from "@/lib/llm";

const BAILIAN_TEST_URL = "https://ws1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";

function setBailianEnv() {
  process.env.BAILIAN_API_KEY = "test-bailian-key";
  process.env.BAILIAN_BASE_URL = BAILIAN_TEST_URL;
  process.env.BAILIAN_FAST_MODEL = "qwen-flash";
  process.env.BAILIAN_MAIN_MODEL = "qwen-plus";
}

function setDeepSeekEnv() {
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
  process.env.DEEPSEEK_FAST_MODEL = "deepseek-v4-flash";
  process.env.DEEPSEEK_MAIN_MODEL = "deepseek-v4-pro";
}

function clearProviderEnv() {
  delete process.env.BAILIAN_API_KEY;
  delete process.env.BAILIAN_BASE_URL;
  delete process.env.BAILIAN_FAST_MODEL;
  delete process.env.BAILIAN_MAIN_MODEL;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.DEEPSEEK_FAST_MODEL;
  delete process.env.DEEPSEEK_MAIN_MODEL;
}

let snapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  snapshot = { ...process.env };
  resetServerEnvCacheForTests();
  __resetRegistryForTests();
});

afterEach(() => {
  process.env = snapshot;
  resetServerEnvCacheForTests();
  __resetRegistryForTests();
});

describe("Provider Registry 选择", () => {
  it("LLM_PRIMARY_PROVIDER=mock → resolveProviders.primaryKind=mock", () => {
    process.env.LLM_PRIMARY_PROVIDER = "mock";
    process.env.LLM_FALLBACK_ENABLED = "false";
    const resolved = resolveProviders();
    expect(resolved.primaryKind).toBe("mock");
    expect(resolved.fallback).toBeNull();
  });

  it("LLM_PRIMARY_PROVIDER=bailian + 完整 Bailian 配置 → 得到 bailian provider", () => {
    process.env.LLM_PRIMARY_PROVIDER = "bailian";
    process.env.LLM_FALLBACK_ENABLED = "false";
    setBailianEnv();
    const provider = getProvider("bailian");
    expect(provider.kind).toBe("bailian");
  });

  it("LLM_FALLBACK_ENABLED=true 且 fallback=mock → fallback 挂载 mock provider", () => {
    process.env.LLM_PRIMARY_PROVIDER = "bailian";
    process.env.LLM_FALLBACK_PROVIDER = "mock";
    process.env.LLM_FALLBACK_ENABLED = "true";
    setBailianEnv();
    const resolved = resolveProviders();
    expect(resolved.primaryKind).toBe("bailian");
    expect(resolved.fallback?.kind).toBe("mock");
    expect(resolved.fallbackEnabled).toBe(true);
  });
});

describe("Bailian 配置校验", () => {
  it("LLM_PRIMARY_PROVIDER=bailian 且缺 BAILIAN_API_KEY → getServerEnv 抛错", () => {
    process.env.LLM_PRIMARY_PROVIDER = "bailian";
    clearProviderEnv();
    expect(() => getServerEnv()).toThrow(/BAILIAN_API_KEY|Bailian/);
  });

  it("BAILIAN_BASE_URL 含未替换的 {WorkspaceId} → 校验失败", () => {
    process.env.LLM_PRIMARY_PROVIDER = "bailian";
    setBailianEnv();
    process.env.BAILIAN_BASE_URL =
      "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
    expect(() => getServerEnv()).toThrow(/WorkspaceId/);
  });
});

describe("DeepSeek 配置校验", () => {
  it("LLM_PRIMARY_PROVIDER=deepseek 且缺 DEEPSEEK_API_KEY → getServerEnv 抛错", () => {
    process.env.LLM_PRIMARY_PROVIDER = "deepseek";
    clearProviderEnv();
    expect(() => getServerEnv()).toThrow(/DEEPSEEK_API_KEY|DeepSeek/);
  });

  it("配置了 deepseek-chat 型号 → 允许通过（不再限制型号名）", () => {
    process.env.LLM_PRIMARY_PROVIDER = "deepseek";
    setDeepSeekEnv();
    process.env.DEEPSEEK_FAST_MODEL = "deepseek-chat";
    expect(() => getServerEnv()).not.toThrow();
  });
});

describe("未启用 Provider 缺 Key 不阻塞", () => {
  it("primary=mock 时缺 Bailian/DeepSeek 变量不影响启动", () => {
    process.env.LLM_PRIMARY_PROVIDER = "mock";
    process.env.LLM_FALLBACK_ENABLED = "false";
    clearProviderEnv();
    expect(() => getServerEnv()).not.toThrow();
    expect(() => getProvider("mock")).not.toThrow();
  });
});
