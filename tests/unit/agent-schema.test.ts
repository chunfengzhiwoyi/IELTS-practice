/**
 * Agent 契约测试
 * ------------------------------------------------------------
 * P0.5 版本：
 *  - AgentResponse Zod schema 严格性（不变）
 *  - Mock provider（P0.5 由 LLM 层承担）的关键词识别回归
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runAgent } from "@/lib/agent/agent";
import { AgentResponseSchema } from "@/lib/agent/schemas";
import { resetServerEnvCacheForTests } from "@/lib/env";
import { __resetRegistryForTests } from "@/lib/llm/provider-registry";

let snapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  snapshot = { ...process.env };
  resetServerEnvCacheForTests();
  __resetRegistryForTests();
  process.env.LLM_PRIMARY_PROVIDER = "mock";
  process.env.LLM_FALLBACK_ENABLED = "false";
});

afterEach(() => {
  process.env = snapshot;
  resetServerEnvCacheForTests();
  __resetRegistryForTests();
});

describe("AgentResponse schema", () => {
  it("接受合法结构", () => {
    const ok = AgentResponseSchema.safeParse({
      intent: "NEW_ITEM",
      reply: "hi",
      ui_action: { type: "SHOW_MESSAGE", payload: {} },
      persistence_required: false,
      trace_id: "trc_abc_12345678",
    });
    expect(ok.success).toBe(true);
  });

  it("拒绝非法 intent", () => {
    const bad = AgentResponseSchema.safeParse({
      intent: "TALK",
      reply: "hi",
      ui_action: { type: "SHOW_MESSAGE", payload: {} },
      persistence_required: false,
      trace_id: "trc_x",
    });
    expect(bad.success).toBe(false);
  });

  it("拒绝空 reply", () => {
    const bad = AgentResponseSchema.safeParse({
      intent: "NEW_ITEM",
      reply: "",
      ui_action: { type: "SHOW_MESSAGE", payload: {} },
      persistence_required: false,
      trace_id: "trc_x",
    });
    expect(bad.success).toBe(false);
  });
});

describe("runAgent (mock provider)", () => {
  it("新词学习意图", async () => {
    const res = await runAgent({ message: "帮我学习 sustainable" });
    expect(res.intent).toBe("NEW_ITEM");
    expect(res.trace_id).toMatch(/^trc_/);
  });

  it("复习意图", async () => {
    const res = await runAgent({ message: "我要复习今天的内容" });
    expect(res.intent).toBe("REVIEW");
  });

  it("口语意图", async () => {
    const res = await runAgent({ message: "帮我练一道 Part 2" });
    expect(res.intent).toBe("SPEAKING");
  });

  it("报告意图", async () => {
    const res = await runAgent({ message: "看看我最近的学习报告" });
    expect(res.intent).toBe("REPORT");
  });

  it("超出范围的问题走 UNSUPPORTED", async () => {
    const res = await runAgent({ message: "今天天气怎么样" });
    expect(res.intent).toBe("UNSUPPORTED");
  });

  it("trace_id 优先复用输入", async () => {
    const res = await runAgent({ message: "复习", traceId: "trc_fixed_00000001" });
    expect(res.trace_id).toBe("trc_fixed_00000001");
  });
});
