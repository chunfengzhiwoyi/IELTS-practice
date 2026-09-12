/**
 * PRODUCT-LOOP-04B — Safety 测试（T21–T24）
 * ------------------------------------------------------------
 * 验证证据管线与既有安全机制兼容：
 *  - T21 band leak → safe fallback → 无 CORRECT evidence 存活（02D redline 不因 evidence 绕过）
 *  - T22 malformed JSON → evidence 保守化
 *  - T23 LLM unavailable → evidence 保守化
 *  - T24 evidence 失败不破坏核心 Speaking feedback 返回
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";

process.env.AUTH_MODE = "demo";
process.env.DATA_PROVIDER = "memory";
process.env.LLM_PRIMARY_PROVIDER = "mock";
process.env.LLM_FALLBACK_ENABLED = "false";
process.env.DEMO_REVIEW_SEED_ENABLED = "false";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { analyzeSpeakingWithLlm } from "@/lib/llm/tasks/analyze-speaking";
import { getQuestionById } from "@/lib/speaking";
import { ANALYSIS_FALLBACK_REASON } from "@/lib/speaking/target-expression-evidence-validator";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import type { SuggestedExpression } from "@/lib/speaking/types";

const QUESTION = () => getQuestionById("sp-p1-001")!;
const TARGET: SuggestedExpression = {
  itemId: "seed-003",
  canonicalForm: "take something for granted",
  meaning: "把某事视为理所当然",
};

function baseJson(answer: string, withEvidence: boolean): string {
  const sample = answer.toLowerCase().match(/\S+/g)?.slice(0, 6).join(" ") || "answer";
  const body: Record<string, unknown> = {
    mainIssue: { dimension: "fluency", severity: "minor", description: "回答可以更充实。", suggestion: "补充细节。" },
    microDrill: { prompt: "练习", exampleImprovement: "For example, ..." },
    summary: "内容清楚。",
    fluency: { label: "流利度", level: "adequate", evidence: [sample], issues: [], suggestions: [] },
    lexicalResource: { label: "词汇", level: "adequate", evidence: [sample], issues: [], suggestions: [] },
    grammaticalRange: { label: "语法", level: "adequate", evidence: [sample], issues: [], suggestions: [] },
    overallDiagnosis: "整体良好。",
    prioritizedSuggestions: ["继续练习"],
  };
  if (withEvidence) {
    body.targetExpressionUsageEvidence = [
      { itemId: "seed-003", attempted: true, quote: "take my health for granted", assessment: "CORRECT", reason: "ok" },
    ];
  }
  return JSON.stringify(body);
}

function install(provider: LlmProvider) {
  __setProviderForTests("mock", provider);
}

beforeAll(() => __resetRegistryForTests());
afterEach(() => __resetRegistryForTests());

describe("T21: band leakage → safe fallback → 无 CORRECT evidence 存活", () => {
  it("LLM 输出 band leak + CORRECT evidence → 规则引擎回退，全部 targets → UNCERTAIN（02D redline 优先）", async () => {
    const answer = "I take my health for granted every day.";
    install({
      kind: "mock",
      async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
        const leaked = baseJson(answer, true);
        // 注入 band 泄漏（用 02D 同口径正则：Band 6 分）
        const body = JSON.parse(leaked) as Record<string, unknown>;
        body.summary = "整体表现相当于 Band 6 分水平。";
        return { model: "mock-04b-band", content: JSON.stringify(body) };
      },
    });
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t21", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    // 02D：band leak → 规则引擎（无 ieltsAnalysis）
    expect(result.ieltsAnalysis).toBeUndefined();
    // 04B：evidence 保守化，不伪造 CORRECT
    expect(result.targetExpressionEvidence).toHaveLength(1);
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("UNCERTAIN");
    expect(result.targetExpressionEvidence![0]!.upgradeCandidate).toBe(false);
    expect(result.targetExpressionEvidence![0]!.reason).toBe(ANALYSIS_FALLBACK_REASON);
  });
});

describe("T22: LLM malformed JSON → evidence 保守化", () => {
  it("非 JSON 输出 → 规则引擎回退 + 全部 targets UNCERTAIN", async () => {
    const answer = "I take my health for granted every day.";
    install({
      kind: "mock",
      async chat(): Promise<LlmChatResponse> {
        return { model: "mock-04b-bad", content: "this is not json {{{" };
      },
    });
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t22", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    expect(result.ieltsAnalysis).toBeUndefined();
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("UNCERTAIN");
    expect(result.targetExpressionEvidence![0]!.upgradeCandidate).toBe(false);
  });
});

describe("T23: LLM unavailable → evidence 保守化", () => {
  it("chat throw → catch → 规则引擎 + 保守 evidence", async () => {
    const answer = "I take my health for granted every day.";
    install({
      kind: "mock",
      async chat(): Promise<LlmChatResponse> {
        throw new Error("mock speaking failure");
      },
    });
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t23", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    expect(result.ieltsAnalysis).toBeUndefined();
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("UNCERTAIN");
    expect(result.targetExpressionEvidence![0]!.reason).toBe(ANALYSIS_FALLBACK_REASON);
  });
});

describe("T24: evidence 异常不破坏核心 Speaking flow", () => {
  it("正常路径：evidence 存在时 feedback 完整返回（mainIssue/metrics/summary）", async () => {
    const answer = "I take my health for granted every day.";
    install({
      kind: "mock",
      async chat(): Promise<LlmChatResponse> {
        return { model: "mock-04b-ok", content: baseJson(answer, true) };
      },
    });
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t24a", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    expect(result.mainIssue).toBeDefined();
    expect(result.metrics.wordCount).toBeGreaterThan(0);
    expect(result.summary).toBeTruthy();
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("CORRECT");
  });

  it("保守路径：evidence 全部 UNCERTAIN 时 feedback 仍完整（fallback 不因 evidence 失败中断）", async () => {
    const answer = "I take my health for granted every day.";
    install({
      kind: "mock",
      async chat(): Promise<LlmChatResponse> {
        throw new Error("provider down");
      },
    });
    const result = await analyzeSpeakingWithLlm(answer, QUESTION(), "trc_04b_t24b", undefined, undefined, {
      suggestedExpressions: [TARGET],
    });
    expect(result.mainIssue).toBeDefined();
    expect(result.summary).toBeTruthy();
    expect(result.targetExpressionEvidence![0]!.assessment).toBe("UNCERTAIN");
  });
});
