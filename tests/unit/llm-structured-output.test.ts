/**
 * 结构化输出管线测试
 * ------------------------------------------------------------
 * 覆盖交付项：
 *   5. Bailian 正常 JSON
 *   6. DeepSeek 正常 JSON
 *   7. 空 content
 *   8. 非法 JSON 后修复成功
 *   9. 两次 Schema 失败
 *   10. HTTP 429 触发 Fallback
 *   11. HTTP 401 不触发 Fallback
 *   12. Fallback 关闭
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { resetServerEnvCacheForTests } from "@/lib/env";
import {
  LlmError,
  callLlmStructured,
  type LlmChatRequest,
  type LlmProvider,
} from "@/lib/llm";
import { createBailianProvider } from "@/lib/llm/providers/bailian-provider";
import { createDeepSeekProvider } from "@/lib/llm/providers/deepseek-provider";
import type { OpenAICompatChatResult, OpenAICompatClient } from "@/lib/llm/provider";
import { __resetRegistryForTests } from "@/lib/llm/provider-registry";

// ------ 测试用 schema ------
const TestSchema = z.object({
  intent: z.enum(["NEW_ITEM", "REVIEW"]),
  reply: z.string().min(1),
});
const JSON_EXAMPLE = `{"intent":"NEW_ITEM","reply":"..."}`;

function makeChatResult(content: string | null): OpenAICompatChatResult {
  return {
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  };
}

/** 生成一个可控的 OpenAI 兼容 client；每次 chat.completions.create 返回队列中下一项 */
function makeStubClient(
  responses: Array<OpenAICompatChatResult | (() => never | Promise<never>)>,
): { client: OpenAICompatClient; calls: number } {
  const state = { calls: 0 };
  const client: OpenAICompatClient = {
    chat: {
      completions: {
        async create() {
          const nextItem = responses[state.calls];
          state.calls += 1;
          if (typeof nextItem === "function") {
            return nextItem();
          }
          if (!nextItem) {
            throw new Error(`stub client: no response for call #${state.calls}`);
          }
          return nextItem;
        },
      },
    },
  };
  return { client, calls: state.calls };
}

/** 模拟一个"HTTP 错误对象"（模仿 OpenAI SDK 的 APIError 形状） */
function httpError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

let snapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  snapshot = { ...process.env };
  resetServerEnvCacheForTests();
  __resetRegistryForTests();
  process.env.LLM_PRIMARY_PROVIDER = "bailian";
  process.env.LLM_FALLBACK_ENABLED = "false";
  process.env.BAILIAN_API_KEY = "test-key";
  process.env.BAILIAN_BASE_URL = "https://ws.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
  process.env.BAILIAN_FAST_MODEL = "qwen-flash";
  process.env.BAILIAN_MAIN_MODEL = "qwen-plus";
  process.env.DEEPSEEK_API_KEY = "test-ds";
  process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
  process.env.DEEPSEEK_FAST_MODEL = "deepseek-v4-flash";
  process.env.DEEPSEEK_MAIN_MODEL = "deepseek-v4-pro";
});

afterEach(() => {
  process.env = snapshot;
  resetServerEnvCacheForTests();
  __resetRegistryForTests();
});

describe("Bailian / DeepSeek 正常 JSON", () => {
  it("Bailian 返回合法 JSON → callLlmStructured 通过", async () => {
    const goodJson = JSON.stringify({ intent: "NEW_ITEM", reply: "ok" });
    const { client } = makeStubClient([makeChatResult(goodJson)]);
    const provider = createBailianProvider(
      {
        apiKey: "x",
        baseUrl: "https://ws.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        fastModel: "qwen-flash",
        mainModel: "qwen-plus",
      },
      client,
    );

    const res = await callLlmStructured(
      {
        tier: "fast",
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        schemaName: "Test",
        jsonExample: JSON_EXAMPLE,
        traceId: "trc_test_0001",
      },
      {
        overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false },
      },
    );

    expect(res.data.intent).toBe("NEW_ITEM");
    expect(res.meta.provider).toBe("bailian");
    expect(res.meta.fallbackUsed).toBe(false);
    expect(res.meta.repairUsed).toBe(false);
  });

  it("DeepSeek 返回合法 JSON → callLlmStructured 通过", async () => {
    const goodJson = JSON.stringify({ intent: "REVIEW", reply: "ok" });
    const { client } = makeStubClient([makeChatResult(goodJson)]);
    const provider = createDeepSeekProvider(
      {
        apiKey: "x",
        baseUrl: "https://api.deepseek.com",
        fastModel: "deepseek-v4-flash",
        mainModel: "deepseek-v4-pro",
      },
      client,
    );

    const res = await callLlmStructured(
      {
        tier: "fast",
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        schemaName: "Test",
        jsonExample: JSON_EXAMPLE,
        traceId: "trc_test_0002",
      },
      {
        overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false },
      },
    );
    expect(res.data.intent).toBe("REVIEW");
    expect(res.meta.provider).toBe("deepseek");
  });
});

describe("修复重试路径", () => {
  it("空 content 触发修复重试 → 第二次返回合法 JSON 成功", async () => {
    const goodJson = JSON.stringify({ intent: "NEW_ITEM", reply: "repaired" });
    const { client } = makeStubClient([makeChatResult(""), makeChatResult(goodJson)]);
    const provider = createBailianProvider(
      {
        apiKey: "x",
        baseUrl: "https://ws.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        fastModel: "qwen-flash",
        mainModel: "qwen-plus",
      },
      client,
    );

    const res = await callLlmStructured(
      {
        tier: "main",
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        schemaName: "Test",
        jsonExample: JSON_EXAMPLE,
        traceId: "trc_test_0003",
      },
      { overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false } },
    );

    expect(res.data.reply).toBe("repaired");
    expect(res.meta.repairUsed).toBe(true);
  });

  it("非法 JSON 后修复成功", async () => {
    const goodJson = JSON.stringify({ intent: "REVIEW", reply: "fixed" });
    const { client } = makeStubClient([
      makeChatResult("not-json-at-all {"),
      makeChatResult(goodJson),
    ]);
    const provider = createDeepSeekProvider(
      {
        apiKey: "x",
        baseUrl: "https://api.deepseek.com",
        fastModel: "deepseek-v4-flash",
        mainModel: "deepseek-v4-pro",
      },
      client,
    );
    const res = await callLlmStructured(
      {
        tier: "main",
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        schemaName: "Test",
        jsonExample: JSON_EXAMPLE,
        traceId: "trc_test_0004",
      },
      { overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false } },
    );
    expect(res.data.intent).toBe("REVIEW");
    expect(res.meta.repairUsed).toBe(true);
  });

  it("两次 Schema 失败 → 抛 MODEL_SCHEMA_MISMATCH", async () => {
    const bad1 = JSON.stringify({ intent: "WRONG", reply: "ok" });
    const bad2 = JSON.stringify({ intent: "STILL_WRONG", reply: "ok" });
    const { client } = makeStubClient([makeChatResult(bad1), makeChatResult(bad2)]);
    const provider = createBailianProvider(
      {
        apiKey: "x",
        baseUrl: "https://ws.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        fastModel: "qwen-flash",
        mainModel: "qwen-plus",
      },
      client,
    );
    await expect(
      callLlmStructured(
        {
          tier: "main",
          messages: [{ role: "user", content: "test" }],
          schema: TestSchema,
          schemaName: "Test",
          jsonExample: JSON_EXAMPLE,
          traceId: "trc_test_0005",
        },
        { overrideProviders: { primary: provider, fallback: null, fallbackEnabled: false } },
      ),
    ).rejects.toMatchObject({ llmKind: "MODEL_SCHEMA_MISMATCH" });
  });
});

describe("Fallback 切换规则", () => {
  it("HTTP 429 触发 Fallback → 备用 Provider 返回结果", async () => {
    // 主 Provider 每次调用都抛 429
    const primaryClient: OpenAICompatClient = {
      chat: {
        completions: {
          async create() {
            throw httpError(429, "rate limited");
          },
        },
      },
    };
    const primary = createBailianProvider(
      {
        apiKey: "x",
        baseUrl: "https://ws.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        fastModel: "qwen-flash",
        mainModel: "qwen-plus",
      },
      primaryClient,
    );

    const goodJson = JSON.stringify({ intent: "NEW_ITEM", reply: "from-fallback" });
    const { client: fbClient } = makeStubClient([makeChatResult(goodJson)]);
    const fallback = createDeepSeekProvider(
      {
        apiKey: "y",
        baseUrl: "https://api.deepseek.com",
        fastModel: "deepseek-v4-flash",
        mainModel: "deepseek-v4-pro",
      },
      fbClient,
    );

    const res = await callLlmStructured(
      {
        tier: "fast",
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        schemaName: "Test",
        jsonExample: JSON_EXAMPLE,
        traceId: "trc_test_0010",
      },
      { overrideProviders: { primary, fallback, fallbackEnabled: true } },
    );
    expect(res.data.reply).toBe("from-fallback");
    expect(res.meta.fallbackUsed).toBe(true);
    expect(res.meta.provider).toBe("deepseek");
  });

  it("HTTP 401 不触发 Fallback → 直接抛 MODEL_UNAUTHORIZED", async () => {
    const primaryClient: OpenAICompatClient = {
      chat: {
        completions: {
          async create() {
            throw httpError(401, "invalid api key");
          },
        },
      },
    };
    const primary = createBailianProvider(
      {
        apiKey: "x",
        baseUrl: "https://ws.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        fastModel: "qwen-flash",
        mainModel: "qwen-plus",
      },
      primaryClient,
    );
    const fbSpy = vi.fn();
    const fallback: LlmProvider = {
      kind: "deepseek",
      async chat(req: LlmChatRequest) {
        fbSpy(req);
        return { content: "{}", model: "x" };
      },
    };

    await expect(
      callLlmStructured(
        {
          tier: "fast",
          messages: [{ role: "user", content: "test" }],
          schema: TestSchema,
          schemaName: "Test",
          jsonExample: JSON_EXAMPLE,
          traceId: "trc_test_0011",
        },
        { overrideProviders: { primary, fallback, fallbackEnabled: true } },
      ),
    ).rejects.toMatchObject({ llmKind: "MODEL_UNAUTHORIZED" });

    expect(fbSpy).not.toHaveBeenCalled();
  });

  it("LLM_FALLBACK_ENABLED=false → 即使 429 也不切换", async () => {
    const primaryClient: OpenAICompatClient = {
      chat: {
        completions: {
          async create() {
            throw httpError(429);
          },
        },
      },
    };
    const primary = createBailianProvider(
      {
        apiKey: "x",
        baseUrl: "https://ws.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        fastModel: "qwen-flash",
        mainModel: "qwen-plus",
      },
      primaryClient,
    );
    const fbSpy = vi.fn();
    const fallback: LlmProvider = {
      kind: "deepseek",
      async chat(req: LlmChatRequest) {
        fbSpy(req);
        return { content: "{}", model: "x" };
      },
    };

    await expect(
      callLlmStructured(
        {
          tier: "fast",
          messages: [{ role: "user", content: "test" }],
          schema: TestSchema,
          schemaName: "Test",
          jsonExample: JSON_EXAMPLE,
          traceId: "trc_test_0012",
        },
        { overrideProviders: { primary, fallback, fallbackEnabled: false } },
      ),
    ).rejects.toBeInstanceOf(LlmError);
    expect(fbSpy).not.toHaveBeenCalled();
  });
});
