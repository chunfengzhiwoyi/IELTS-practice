/**
 * INT-M3-01 — Combined Path Integration Smoke
 * ------------------------------------------------------------------------
 * 证明 BC-026（knowledge retrieval observability）与 BC-033（error contract）
 * 在同一次请求链上可以共存：
 *   knowledge retrieval 正常执行（retrieval.executed 已记录）之后，
 *   后续 LLM 输出 schema mismatch → 错误被正确归类为 MODEL_SCHEMA_MISMATCH：
 *     - API error.kind = MODEL_SCHEMA_MISMATCH
 *     - Trace response.sent.app_error_code = MODEL_SCHEMA_MISMATCH
 *   → 同一条 trace 中同时存在 retrieval.executed 与
 *     response.sent(MODEL_SCHEMA_MISMATCH)。
 *
 * 这是 Integration regression，不是 Frozen Eval Gold。
 * ELS-EVAL-026 / 033 的最终判定由独立 Eval Runner 完成。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { POST as LEARN_CARD } from "@/app/api/learn/card/route";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { _resetRepositories } from "@/lib/repository-factory";
import { traceStore } from "@/lib/observability/trace-store";
import { setTraceEnabled } from "@/lib/observability/trace-context";

function makeSchemaMismatchProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      // 合法 JSON 但不符合 WordCard schema（缺所有必填字段）→ 顽固错 → MODEL_SCHEMA_MISMATCH
      return {
        content: JSON.stringify({ not_a_word_card: true }),
        model: "mock-schema-mismatch",
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

describe("INT-M3-01: Combined Path — retrieval.executed 与 033 error contract 共存", () => {
  beforeEach(() => {
    process.env.DATA_PROVIDER = "memory";
    process.env.AUTH_MODE = "demo";
    traceStore.reset();
    setTraceEnabled(true);
    _resetRepositories();
    __resetRegistryForTests();
    __setProviderForTests("mock", makeSchemaMismatchProvider());
  });

  it("知识检索执行后 LLM schema mismatch → 同一 trace 含 retrieval.executed + response.sent(MODEL_SCHEMA_MISMATCH)", async () => {
    const res = await callLearnCard("galvanize", "trc_m3_combined_1");
    expect(res.status).toBe(502);

    const json = (await res.json()) as { error?: { kind?: string } };
    expect(json.error?.kind).toBe("MODEL_SCHEMA_MISMATCH");

    const trace = traceStore.getTrace("trc_m3_combined_1");
    expect(trace).toBeDefined();

    // 026 observability：知识检索已执行（retrieval.executed 在错误返回前已记录）
    const retrievals = trace?.events.filter((e) => e.event_type === "retrieval.executed") ?? [];
    expect(retrievals.length).toBeGreaterThanOrEqual(1);

    // 033 error contract：错误码保留到 trace response.sent
    const responseSent = trace?.events.find((e) => e.event_type === "response.sent");
    expect(responseSent).toBeDefined();
    expect(responseSent?.payload.app_error_code).toBe("MODEL_SCHEMA_MISMATCH");

    // 033：schema mismatch 不触发 provider fallback
    const fallbacks = trace?.events.filter((e) => e.event_type === "fallback.triggered") ?? [];
    expect(fallbacks.length).toBe(0);
  });
});
