/**
 * 环境变量校验测试（P0.5）
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  currentPrimaryProviderKind,
  isMockPrimary,
  isPlaceholderSupabase,
  resetServerEnvCacheForTests,
} from "@/lib/env";

let snapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  snapshot = { ...process.env };
  resetServerEnvCacheForTests();
});

afterEach(() => {
  process.env = snapshot;
  resetServerEnvCacheForTests();
});

describe("env placeholder detection", () => {
  it("mock 主 Provider 时 isMockPrimary=true", () => {
    process.env.LLM_PRIMARY_PROVIDER = "mock";
    expect(isMockPrimary()).toBe(true);
    expect(currentPrimaryProviderKind()).toBe("mock");
  });

  it("bailian 主 Provider 时 isMockPrimary=false", () => {
    process.env.LLM_PRIMARY_PROVIDER = "bailian";
    expect(isMockPrimary()).toBe(false);
    expect(currentPrimaryProviderKind()).toBe("bailian");
  });

  it("识别 Supabase 占位 URL", () => {
    expect(isPlaceholderSupabase()).toBe(true);
  });
});
