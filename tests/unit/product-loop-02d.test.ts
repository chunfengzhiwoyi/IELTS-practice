/**
 * PRODUCT-LOOP-02D — ELS-EVAL-020 Band Safety Fix Tests
 * ------------------------------------------------------------
 * 冻结产品规则：IELTS Band 数字 / 等效能力分数，未经可信正式测评依据，
 * 不得出现在本产品 Speaking feedback（PUBLIC_RESPONSE_REDLINE）。
 *
 * 修复：quality gate 检出任何 BAND_SCORE_LEAK（1 条或多条）
 *       → 强制走规则引擎安全回退，LLM analysis 不进用户可见响应。
 *
 * 回归矩阵：
 *   A. 1 条 band leak（原 score≈85 PASS）→ public response band-free
 *   B. 2 条 band leak（原 score≈70 PASS）→ band-free
 *   C. 3 条 band leak（原 NEEDS_REVIEW）→ band-free
 *   D. 无 band leak 高质量 analysis → 不被错误 fallback
 *   E. 019 evidence sanitizer 行为保持（现有 badcase-019 套件覆盖）
 *   F. trace 字段：band_leakage_flag / analysis_path / final_response_redacted
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { analyzeSpeakingWithLlm } from "@/lib/llm/tasks/analyze-speaking";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { getQuestionById } from "@/lib/speaking";
import { setTraceEnabled, getTraceById } from "@/lib/observability/trace-context";
import type { SpeakingQuestion } from "@/lib/speaking/types";

// 与 ELS-EVAL-020 Gold 口径一致的全链路 band 扫描模式（仅响应体，不含质量门诊断字段）。
// 注：\s*分(?!钟) 排除 "X 分钟" 等时间投入建议（非 band 分数）——与 gate 检测修复同口径。
const BAND_PATTERNS: RegExp[] = [
  /band\s*\d/i,
  /band\s*score/i,
  /[5-9](\.\d)?\s*分(?!钟)/,
  /相当于.*[4-9](\.\d)?\s*分/,
  /得分\s*[4-9]/,
  /达到\s*[4-9](\.\d)?\s*分/,
  /争取\s*[4-9](\.\d)?\s*分/,
  /score\s*[:=]\s*[4-9](\.\d)?/i,
  /雅思\s*[4-9]/,
];

/** 收集 analysis 中所有用户可见文本字段（UI 实际渲染面） */
function collectPublicText(r: any): string {
  const parts: string[] = [];
  if (r.summary) parts.push(String(r.summary));
  if (r.mainIssue?.description) parts.push(String(r.mainIssue.description));
  if (r.mainIssue?.suggestion) parts.push(String(r.mainIssue.suggestion));
  if (r.microDrill?.prompt) parts.push(String(r.microDrill.prompt));
  if (r.strengths?.length) parts.push(...r.strengths.map(String));
  if (r.ieltsAnalysis) {
    if (r.ieltsAnalysis.overallDiagnosis) parts.push(String(r.ieltsAnalysis.overallDiagnosis));
    if (r.ieltsAnalysis.prioritizedSuggestions?.length) {
      parts.push(...r.ieltsAnalysis.prioritizedSuggestions.map(String));
    }
    for (const dim of [r.ieltsAnalysis.fluency, r.ieltsAnalysis.lexicalResource, r.ieltsAnalysis.grammaticalRange]) {
      if (!dim) continue;
      if (dim.evidence?.length) parts.push(...dim.evidence.map(String));
      if (dim.issues?.length) parts.push(...dim.issues.map(String));
      if (dim.suggestions?.length) parts.push(...dim.suggestions.map(String));
    }
  }
  return parts.join("\n");
}

function assertBandFree(analysis: unknown): void {
  const text = collectPublicText(analysis);
  const hits = BAND_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
  expect(hits, `public response must be band-free; hits=${hits.join(",")}; text=${text.slice(0, 300)}`).toEqual([]);
}

// =============================================================
// Mock Providers
// =============================================================

function baseProviderContent(overrides: Partial<Record<string, unknown>>): LlmChatResponse {
  return {
    model: "mock-020",
    content: JSON.stringify({
      mainIssue: {
        dimension: "fluency",
        severity: "major",
        description: "回答中有多处明显停顿，语速偏慢，影响流利度评价。",
        suggestion: "练习不停顿地说完一个完整观点，哪怕用简单表达。",
      },
      microDrill: {
        prompt: "用 30 秒不停顿地描述你今天做了什么，只求流畅不求完美。",
        exampleImprovement: "Well, today I woke up early, had breakfast, then went to work.",
      },
      summary: "内容有一定深度，但流利度和语法准确性需要加强。",
      strengths: ["话题展开有条理"],
      fluency: {
        label: "流利度与连贯性",
        level: "developing",
        evidence: ["语速 98 WPM（偏慢）", "3 次明显停顿"],
        issues: ["多次中途犹豫"],
        suggestions: ["练习 shadowing（跟读）提高语速"],
      },
      lexicalResource: {
        label: "词汇资源",
        level: "adequate",
        evidence: ["使用了 significant 等词汇"],
        issues: [],
        suggestions: ["将 said 替换为 mentioned"],
      },
      grammaticalRange: {
        label: "语法广度与准确性",
        level: "adequate",
        evidence: ["使用了定语从句"],
        issues: [],
        suggestions: ["注意第三人称单数"],
      },
      overallDiagnosis: "当前最大瓶颈在流利度，词汇和语法基础可以支撑更流畅的表达。",
      prioritizedSuggestions: ["每天 5 分钟不间断自由口语练习", "使用过渡词连接观点"],
      ...overrides,
    }),
  };
}

/** A: 1 条 band leak（summary）→ 修复前 score=85 → PASS（缺口场景） */
function makeSingleLeakProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      return baseProviderContent({ summary: "整体表现相当于 Band 6 分水平。" });
    },
  };
}

/** B: 2 条 band leak（summary + mainIssue.description）→ 修复前 score=70 → PASS（缺口场景） */
function makeDoubleLeakProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      return baseProviderContent({
        summary: "整体表现相当于 Band 6 分水平。",
        mainIssue: {
          dimension: "fluency",
          severity: "major",
          description: "流利度不错，接近 Band 6.5 水平。",
          suggestion: "练习不停顿地说完一个完整观点。",
        },
      });
    },
  };
}

/** C: 3 条 band leak（summary + overallDiagnosis + prioritizedSuggestions）→ 修复前 score=55 → NEEDS_REVIEW（缺口场景） */
function makeTripleLeakProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      return baseProviderContent({
        summary: "整体表现相当于 Band 6 分水平。",
        overallDiagnosis: "词汇基础尚可，接近 Band 6 的流利度。",
        prioritizedSuggestions: ["争取 7 分需要更多细节展开", "练习连接词", "跟读提升语速"],
      });
    },
  };
}

/** D: 无 band leak 的高质量 analysis → 不应被错误 fallback */
function makeCleanProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      return baseProviderContent({});
    },
  };
}

// =============================================================
// Test Question
// =============================================================

function getTestQuestion(): SpeakingQuestion {
  return getQuestionById("sp-p1-001")!;
}

const ANSWER =
  "I think environmental protection is very important for our future because it affects everyone. We should protect the planet for our children.";

// =============================================================
// A/B/C: 任意数量 band leak → public response band-free
// =============================================================

describe("02D-A/B/C: BAND_SCORE_LEAK 强制安全回退（band-free）", () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });

  it("A. 1 条 band leak（原 score≈85 PASS）→ 回退规则引擎，响应 band-free", async () => {
    __setProviderForTests("mock", makeSingleLeakProvider());
    const result = await analyzeSpeakingWithLlm(ANSWER, getTestQuestion(), "trc_02d_a");

    assertBandFree(result);
    // 回退路径：无 LLM ieltsAnalysis（规则引擎产物）
    expect(result.ieltsAnalysis).toBeUndefined();
    // 回退路径：无 qualityWarning
    expect(result.qualityWarning).toBeUndefined();
  });

  it("B. 2 条 band leak（原 score≈70 PASS）→ 回退规则引擎，响应 band-free", async () => {
    __setProviderForTests("mock", makeDoubleLeakProvider());
    const result = await analyzeSpeakingWithLlm(ANSWER, getTestQuestion(), "trc_02d_b");

    assertBandFree(result);
    expect(result.ieltsAnalysis).toBeUndefined();
    expect(result.qualityWarning).toBeUndefined();
  });

  it("C. 3 条 band leak（原 NEEDS_REVIEW）→ 回退规则引擎，响应 band-free", async () => {
    __setProviderForTests("mock", makeTripleLeakProvider());
    const result = await analyzeSpeakingWithLlm(ANSWER, getTestQuestion(), "trc_02d_c");

    assertBandFree(result);
    expect(result.ieltsAnalysis).toBeUndefined();
    expect(result.qualityWarning).toBeUndefined();
  });
});

// =============================================================
// D: 无 band leak 不误伤
// =============================================================

describe("02D-D: 无 band leak 的高质量 analysis 不被错误 fallback", () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });

  it("clean analysis 正常返回 LLM 结果（保留 ieltsAnalysis）", async () => {
    __setProviderForTests("mock", makeCleanProvider());
    const result = await analyzeSpeakingWithLlm(ANSWER, getTestQuestion(), "trc_02d_d");

    expect(result.ieltsAnalysis).toBeDefined();
    expect(result.ieltsAnalysis?.overallDiagnosis).toContain("流利度");
    expect(result.summary).toContain("流利度");
    assertBandFree(result);
  });
});

// =============================================================
// F: trace 字段
// =============================================================

describe("02D-F: 020 trace 字段（band_leakage_flag / analysis_path / final_response_redacted）", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    setTraceEnabled(true);
  });

  afterEach(() => {
    setTraceEnabled(false);
  });

  it("band leak 场景：validation.result 记录 redline 字段，fallback.triggered 用 BAND_SCORE_LEAK_REDLINE", async () => {
    __setProviderForTests("mock", makeSingleLeakProvider());
    const traceId = "trc_02d_f1";
    await analyzeSpeakingWithLlm(ANSWER, getTestQuestion(), traceId);

    const trace = getTraceById(traceId);
    expect(trace).not.toBeNull();

    const valEvent = trace!.events.find(
      (e) =>
        e.event_type === "validation.result" &&
        (e.payload as Record<string, unknown> | undefined)?.validator === "speaking_quality_gate",
    );
    expect(valEvent).toBeDefined();
    const payload = valEvent!.payload as Record<string, unknown>;
    expect(payload.band_leakage_flag).toBe(true);
    expect(payload.analysis_path).toBe("rule_based_analysis");
    expect(payload.final_response_redacted).toBe(true);

    const fbEvent = trace!.events.find((e) => e.event_type === "fallback.triggered");
    expect(fbEvent).toBeDefined();
    expect(fbEvent!.error_code).toBe("BAND_SCORE_LEAK_REDLINE");
  });

  it("clean 场景：band_leakage_flag=false，analysis_path=llm_analysis，final_response_redacted=false", async () => {
    __setProviderForTests("mock", makeCleanProvider());
    const traceId = "trc_02d_f2";
    await analyzeSpeakingWithLlm(ANSWER, getTestQuestion(), traceId);

    const trace = getTraceById(traceId);
    expect(trace).not.toBeNull();

    const valEvent = trace!.events.find(
      (e) =>
        e.event_type === "validation.result" &&
        (e.payload as Record<string, unknown> | undefined)?.validator === "speaking_quality_gate",
    );
    expect(valEvent).toBeDefined();
    const payload = valEvent!.payload as Record<string, unknown>;
    expect(payload.band_leakage_flag).toBe(false);
    expect(payload.analysis_path).toBe("llm_analysis");
    expect(payload.final_response_redacted).toBe(false);
    // clean 场景不应有 fallback
    expect(trace!.events.find((e) => e.event_type === "fallback.triggered")).toBeUndefined();
  });
});
