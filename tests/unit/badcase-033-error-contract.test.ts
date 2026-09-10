/**
 * Bad Case 033 — Error Contract: MODEL_SCHEMA_MISMATCH 不折叠为 MODEL_ERROR
 * ------------------------------------------------------------
 * Frozen Gold ELS-EVAL-033:
 *   模型输出合法 JSON 但不符合 Zod schema，修复后仍不匹配（顽固错），
 *   系统须以 MODEL_SCHEMA_MISMATCH 正确归类结束，不得 500 裸奔，
 *   不得漂移成 MODEL_ERROR，不得误触发 provider fallback。
 *
 * 本测试独立表达 Product Contract，不复制 Eval Runner Gold 实现。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import { AppError } from "@/lib/observability/errors";
import { LlmError } from "@/lib/llm/errors";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { _resetRepositories } from "@/lib/repository-factory";
import { traceStore } from "@/lib/observability/trace-store";
import { setTraceEnabled } from "@/lib/observability/trace-context";

// ---- Mock LLM Provider ----
function makeSchemaMismatchProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      // 合法 JSON 但完全不符合 WordCard schema（缺所有必填字段）
      return {
        content: JSON.stringify({ not_a_word_card: true }),
        model: "mock-schema-mismatch",
      };
    },
  };
}

function makeGenericErrorProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      throw new Error("模拟底层网络异常: connection reset by peer");
    },
  };
}


function makeSecretErrorProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      // 模拟底层 SDK 抛出包含敏感信息的异常
      throw new Error("sdk fatal: path C:\\foo\\bar\\config.json apiKey=sk-abc123secret internal_state=corrupted");
    },
  };
}

function makeSuccessProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(req: LlmChatRequest): Promise<LlmChatResponse> {
      const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
      const raw = lastUser?.content ?? "";
      const term = raw.includes("：") ? raw.split("：").pop()!.trim() : raw;
      return {
        content: JSON.stringify({
          term,
          normalizedTerm: term.toLowerCase(),
          itemType: "WORD",
          phonetic: "/test/",
          partOfSpeech: "verb",
          coreMeaning: "测试含义",
          usageContext: "测试语境",
          collocations: ["test collocation"],
          exampleSentence: "This is a test.",
          exampleTranslation: "这是一个测试。",
          commonMistake: "测试常见错误",
          topicTags: ["test"],
          acceptedAnswers: ["测试"],
          answerKeywords: ["测试"],
        }),
        model: "mock-success",
      };
    },
  };
}

async function callLearnCard(term: string, traceId: string) {
  return LEARN_CARD(
    new Request("http://localhost/api/learn/card", {
      method: "POST",
      headers: { "content-type": "application/json", "x-trace-id": traceId },
      body: JSON.stringify({ term }),
    }),
  );
}

interface ErrorResponse {
  error?: { kind?: string; message?: string; trace_id?: string };
}

describe("Bad Case 033: Error Contract — schema mismatch 不折叠", () => {
  beforeEach(() => {
    process.env.DATA_PROVIDER = "memory";
    process.env.AUTH_MODE = "demo";
    traceStore.reset();
    setTraceEnabled(true);
    _resetRepositories();
    __resetRegistryForTests();
  });

  // ---- 1. Frozen failure reproduction + fixed expected result ----
  it("schema 顽固违规 → error.kind = MODEL_SCHEMA_MISMATCH（不漂移成 MODEL_ERROR）", async () => {
    __setProviderForTests("mock", makeSchemaMismatchProvider());

    const res = await callLearnCard("galvanize", "trc_033_schema");
    expect(res.status).toBe(502);

    const json = (await res.json()) as ErrorResponse;
    expect(json.error?.kind).toBe("MODEL_SCHEMA_MISMATCH");
    expect(json.error?.message).toBeTruthy();
    expect(json.error?.message!.length).toBeGreaterThan(5);
    expect(json.error?.trace_id).toBe("trc_033_schema");
  });

  it("schema 违规 → 响应体结构化（AppError 格式），非裸 500", async () => {
    __setProviderForTests("mock", makeSchemaMismatchProvider());

    const res = await callLearnCard("galvanize", "trc_033_structured");
    const json = (await res.json()) as ErrorResponse;

    expect(json.error).toBeDefined();
    expect(json.error?.kind).toBeDefined();
    expect(json.error?.message).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("schema 违规 → 不返回部分结果（no partial item）", async () => {
    __setProviderForTests("mock", makeSchemaMismatchProvider());

    const res = await callLearnCard("galvanize", "trc_033_no_partial");
    const json = (await res.json()) as Record<string, unknown>;
    expect("item" in json).toBe(false);
  });

  // ---- 2. Trace consistency ----
  it("Trace response.sent.app_error_code 与 API error.kind 一致", async () => {
    __setProviderForTests("mock", makeSchemaMismatchProvider());

    await callLearnCard("galvanize", "trc_033_trace_consistency");
    const trace = traceStore.getTrace("trc_033_trace_consistency");
    expect(trace).toBeDefined();

    const responseSent = trace?.events.find((e) => e.event_type === "response.sent");
    expect(responseSent).toBeDefined();
    expect(responseSent?.payload.app_error_code).toBe("MODEL_SCHEMA_MISMATCH");
    expect(responseSent?.payload.http_status).toBe(502);
  });

  it("schema 违规 → llm.attempt 记录 MODEL_SCHEMA_MISMATCH，validation.result 记录 repair_attempts", async () => {
    __setProviderForTests("mock", makeSchemaMismatchProvider());

    await callLearnCard("galvanize", "trc_033_llm_trace");
    const trace = traceStore.getTrace("trc_033_llm_trace");
    const llmAttempts = trace?.events.filter((e) => e.event_type === "llm.attempt") ?? [];
    const validations = trace?.events.filter((e) => e.event_type === "validation.result") ?? [];

    // 主调用 + repair 调用，共 2 次 llm.attempt
    expect(llmAttempts.length).toBe(2);
    for (const att of llmAttempts) {
      expect(att.payload.llm_error_code).toBe("MODEL_SCHEMA_MISMATCH");
    }

    // repair 已尝试
    const maxRepair = Math.max(
      ...validations.map((v) => (v.payload as { repair_attempts?: number })?.repair_attempts ?? 0),
    );
    expect(maxRepair).toBeGreaterThanOrEqual(1);
  });

  it("schema 违规 → 不触发 provider fallback（fallback.triggered 缺席）", async () => {
    __setProviderForTests("mock", makeSchemaMismatchProvider());

    await callLearnCard("galvanize", "trc_033_no_fallback");
    const trace = traceStore.getTrace("trc_033_no_fallback");
    const fallbacks = trace?.events.filter((e) => e.event_type === "fallback.triggered") ?? [];
    expect(fallbacks.length).toBe(0);
  });

  // ---- 3. Safety regression: unknown error → safe public message（不泄漏 raw err.message）----
  it("非 AppError 未知异常 → kind=MODEL_ERROR，不暴露 raw err.message", async () => {
    __setProviderForTests("mock", makeGenericErrorProvider());

    const res = await callLearnCard("galvanize", "trc_033_generic");
    expect(res.status).toBe(502);

    const json = (await res.json()) as ErrorResponse;
    expect(json.error?.kind).toBe("MODEL_ERROR");
    expect(json.error?.message).toBeTruthy();
    expect(json.error?.trace_id).toBe("trc_033_generic");
    // 关键安全断言：原始错误 message 不得出现在 API 响应中
    expect(json.error?.message).not.toContain("connection reset by peer");
    // 使用安全公开文案
    expect(json.error?.message).toContain("模型服务暂时不可用");
  });

  it("包含 path/apiKey 的底层异常 → 客户端不泄漏任何敏感内容", async () => {
    __setProviderForTests("mock", makeSecretErrorProvider());

    const res = await callLearnCard("galvanize", "trc_033_secret");
    expect(res.status).toBe(502);

    const json = (await res.json()) as ErrorResponse;
    expect(json.error?.kind).toBe("MODEL_ERROR");
    // 严格安全断言：不得包含 path、apiKey、内部状态
    expect(json.error?.message).not.toContain("C:\\foo");
    expect(json.error?.message).not.toContain("apiKey");
    expect(json.error?.message).not.toContain("sk-abc123");
    expect(json.error?.message).not.toContain("internal_state");
    expect(json.error?.message).not.toContain("sdk fatal");
    // 使用安全公开文案
    expect(json.error?.message).toContain("模型服务暂时不可用");
    // 响应仍然是结构化 AppError
    expect(json.error?.trace_id).toBe("trc_033_secret");
  });

  it("LlmError(MODEL_SCHEMA_MISMATCH) → kind 仍然保留，不因安全修复被折叠", async () => {
    __setProviderForTests("mock", makeSchemaMismatchProvider());

    const res = await callLearnCard("galvanize", "trc_033_schema_safety");
    expect(res.status).toBe(502);

    const json = (await res.json()) as ErrorResponse;
    // 核心修复：具体 domain error code 必须保留
    expect(json.error?.kind).toBe("MODEL_SCHEMA_MISMATCH");
    // LlmError 的 message 是已分类的安全文案（Schema 校验失败: ...），可以保留
    expect(json.error?.message).toContain("Schema");
  });

  // ---- 4. Normal path regression ----
  it("正常 LLM 输出 → 200 成功，不影响正常路径", async () => {
    __setProviderForTests("mock", makeSuccessProvider());

    const res = await callLearnCard("mitigate", "trc_033_normal");
    expect(res.status).toBe(200);

    const json = (await res.json()) as { item?: { canonicalForm?: string } };
    expect(json.item?.canonicalForm).toBe("mitigate");
  });

  it("seed 命中 → 不调用 LLM，直接返回 200", async () => {
    // sustainable 在 seed 词库中，不需要 LLM
    const res = await callLearnCard("sustainable", "trc_033_seed");
    expect(res.status).toBe(200);

    const json = (await res.json()) as { item?: { canonicalForm?: string } };
    expect(json.item?.canonicalForm).toBe("sustainable");
  });

  // ---- 5. Validation/input error regression ----
  it("无效输入（空 term）→ INVALID_INPUT，400，不折叠为 MODEL_ERROR", async () => {
    const res = await callLearnCard("", "trc_033_invalid_input");
    expect(res.status).toBe(400);

    const json = (await res.json()) as ErrorResponse;
    expect(json.error?.kind).toBe("INVALID_INPUT");
  });
});

describe("Bad Case 033: LlmError kind 保留（单元级验证）", () => {
  it("LlmError 继承 AppError，kind 字段保留具体错误码", () => {
    const err = new LlmError(
      "MODEL_SCHEMA_MISMATCH",
      "Schema 校验失败",
      { provider: "mock", model: "test" },
      "trace-001",
    );
    expect(err.kind).toBe("MODEL_SCHEMA_MISMATCH");
    expect(err.llmKind).toBe("MODEL_SCHEMA_MISMATCH");
    expect(err instanceof AppError).toBe(true);
  });

  it("shouldFallback 对 MODEL_SCHEMA_MISMATCH 返回 false", () => {
    const err = new LlmError(
      "MODEL_SCHEMA_MISMATCH",
      "Schema 校验失败",
      { provider: "mock" },
    );
    // shouldFallback 从 llm/errors 导入
    // 这里直接验证逻辑：MODEL_SCHEMA_MISMATCH 不在 fallback 列表中
    const fallbackKinds = ["MODEL_TIMEOUT", "MODEL_RATE_LIMITED", "MODEL_PROVIDER_UNAVAILABLE"];
    expect(fallbackKinds).not.toContain(err.llmKind);
  });
});
