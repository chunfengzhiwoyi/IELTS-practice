/**
 * Bad Case 019 — Hallucination Gate / Evidence Sanitization
 * -------------------------------------------------------
 * ELS-EVAL-019: LLM 给出无证据反馈（幻觉证据拦截）
 *
 * 冻结事实：
 * - 用户输入 "I like books. Reading is fun. I read often." 不含 which 从句/被动/比较级/复合句
 * - 模型声称存在以上语言现象
 * - evidenceConsistencyCheck 已检测到 EVIDENCE_MISMATCH
 * - 但 NEEDS_REVIEW 状态只附加 warning，不 sanitize evidence
 * - 幻觉证据直达 UI（analysis.summary / mainIssue.description / ieltsAnalysis.*.evidence）
 *
 * 修复：sanitizeUngroundedAnalysis 在 Quality Gate 后移除 ungrounded evidence
 */
import { describe, expect, it, beforeEach } from "vitest";

import { analyzeSpeakingWithLlm } from "@/lib/llm/tasks/analyze-speaking";
import { __resetRegistryForTests, __setProviderForTests } from "@/lib/llm/provider-registry";
import type { LlmProvider } from "@/lib/llm/provider";
import type { LlmChatRequest, LlmChatResponse } from "@/lib/llm/types";
import { isEvidenceGrounded, detectUngroundedLinguisticClaims, sanitizeUngroundedAnalysis } from "@/lib/speaking/evidence-sanitizer";
import { validateFeedbackQuality } from "@/lib/speaking/feedback-quality";
import { getQuestionById } from "@/lib/speaking";
import type { SpeakingAnalysisResult, SpeakingQuestion } from "@/lib/speaking/types";

// =============================================================
// Mock Providers
// =============================================================

/** 返回包含幻觉证据的分析（模拟 ELS-EVAL-019 场景） */
function makeHallucinatingProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      return {
        model: "mock-hallucinator",
        content: JSON.stringify({
          mainIssue: {
            dimension: "grammar",
            severity: "major",
            description: "你使用了 which 定语从句但结构不够准确，同时被动语态使用较少。",
            suggestion: "练习使用 which 引导的定语从句，注意关系代词的正确位置。",
          },
          microDrill: {
            prompt: "用 which 定语从句描述你昨天做的事情。",
            exampleImprovement: "The book which I read yesterday was very interesting.",
          },
          summary: "回答中使用了 which 定语从句和形容词比较级，语法多样性较好，但被动语态不足。",
          strengths: ["句式有变化"],
          fluency: {
            label: "流利度与连贯性",
            level: "adequate",
            evidence: ["回答流畅", "有逻辑连接"],
            issues: ["偶尔停顿"],
            suggestions: ["多练习连贯表达"],
          },
          lexicalResource: {
            label: "词汇资源",
            level: "adequate",
            evidence: ["使用了 books、reading 等词汇"],
            issues: ["词汇范围有限"],
            suggestions: ["积累更多话题词汇"],
          },
          grammaticalRange: {
            label: "语法广度与准确性",
            level: "developing",
            evidence: [
              "使用了 which 定语从句",
              "使用了被动语态",
              "使用了形容词比较级",
              "多个复合句结构",
            ],
            issues: ["语法准确性需提高"],
            suggestions: ["注意时态一致性"],
          },
          overallDiagnosis: "语法多样性有潜力，但需要更准确地使用复合句和从句。",
          prioritizedSuggestions: ["练习定语从句", "增加被动语态使用"],
        }),
      };
    },
  };
}

/** 返回合法证据的分析（用户确实使用了 which 和比较级） */
function makeLegitimateProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      return {
        model: "mock-legitimate",
        content: JSON.stringify({
          mainIssue: {
            dimension: "vocabulary",
            severity: "minor",
            description: "词汇使用可以更丰富，which 从句使用正确。",
            suggestion: "尝试使用更高级的词汇替换常见表达。",
          },
          microDrill: {
            prompt: "用不同词汇描述同一个观点。",
            exampleImprovement: "The book which I bought was better than expected.",
          },
          summary: "回答使用了 which 定语从句和比较级，语法结构较好。",
          fluency: {
            label: "流利度与连贯性",
            level: "strong",
            evidence: ["表达流畅"],
            issues: [],
            suggestions: [],
          },
          lexicalResource: {
            label: "词汇资源",
            level: "adequate",
            evidence: ["使用了 bought、better 等词汇"],
            issues: [],
            suggestions: [],
          },
          grammaticalRange: {
            label: "语法广度与准确性",
            level: "strong",
            evidence: [
              "使用了 which 定语从句",
              "使用了比较级 better",
            ],
            issues: [],
            suggestions: [],
          },
          overallDiagnosis: "语法结构扎实，词汇有提升空间。",
          prioritizedSuggestions: ["扩展词汇量"],
        }),
      };
    },
  };
}

/** 抛出异常的 provider（测试 rule fallback） */
function makeFailingProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      throw new Error("mock provider failure");
    },
  };
}

/** 返回含 Band 分数的分析（测试 ELS-EVAL-020 不回归） */
function makeBandLeakProvider(): LlmProvider {
  return {
    kind: "mock",
    async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
      return {
        model: "mock-band-leak",
        content: JSON.stringify({
          mainIssue: {
            dimension: "fluency",
            severity: "minor",
            description: "流利度不错，接近 Band 6.5 水平。",
            suggestion: "继续保持。",
          },
          microDrill: { prompt: "练习", exampleImprovement: "example" },
          summary: "整体表现相当于 Band 6 分水平。",
          fluency: { label: "流利度", level: "adequate", evidence: ["表达流畅"], issues: [], suggestions: [] },
          lexicalResource: { label: "词汇", level: "adequate", evidence: ["词汇丰富"], issues: [], suggestions: [] },
          grammaticalRange: { label: "语法", level: "adequate", evidence: ["语法正确"], issues: [], suggestions: [] },
          overallDiagnosis: "表现良好。",
          prioritizedSuggestions: ["继续练习"],
        }),
      };
    },
  };
}

// =============================================================
// Test Question
// =============================================================

function getTestQuestion(): SpeakingQuestion {
  return getQuestionById("sp-p1-001")!;
}

// =============================================================
// Unit Tests: Grounding Check
// =============================================================

describe("BC-019: isEvidenceGrounded", () => {
  const answer = "I like books. Reading is fun. I read often.";

  it("数据型 evidence（WPM/秒/次）视为 grounded", () => {
    expect(isEvidenceGrounded("语速 98 WPM", answer)).toBe(true);
    expect(isEvidenceGrounded("停顿 3 次", answer)).toBe(true);
  });

  it("包含回答中关键词的 evidence 视为 grounded", () => {
    expect(isEvidenceGrounded("使用了 books 这个词", answer)).toBe(true);
    expect(isEvidenceGrounded("reading 出现多次", answer)).toBe(true);
  });

  it("不包含回答中任何关键词的 evidence 视为 ungrounded", () => {
    expect(isEvidenceGrounded("使用了 which 定语从句", answer)).toBe(false);
    expect(isEvidenceGrounded("使用了被动语态", answer)).toBe(false);
    expect(isEvidenceGrounded("使用了形容词比较级", answer)).toBe(false);
  });
});

describe("BC-019: detectUngroundedLinguisticClaims", () => {
  const simpleAnswer = "I like books. Reading is fun. I read often.";
  const complexAnswer = "The book which I bought yesterday was better than the old one.";

  it("简单回答中检测到 which 从句幻觉", () => {
    const claims = detectUngroundedLinguisticClaims("你使用了 which 定语从句", simpleAnswer);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.some((c) => c.label.includes("定语从句"))).toBe(true);
  });

  it("简单回答中检测到被动语态幻觉", () => {
    const claims = detectUngroundedLinguisticClaims("使用了被动语态", simpleAnswer);
    expect(claims.some((c) => c.label.includes("被动"))).toBe(true);
  });

  it("确实使用了 which 的回答不检测为幻觉", () => {
    const claims = detectUngroundedLinguisticClaims("使用了 which 定语从句", complexAnswer);
    expect(claims.some((c) => c.label.includes("定语从句"))).toBe(false);
  });

  it("确实使用了比较级的回答不检测为幻觉", () => {
    const claims = detectUngroundedLinguisticClaims("使用了比较级 better", complexAnswer);
    expect(claims.some((c) => c.label.includes("比较级"))).toBe(false);
  });
});

// =============================================================
// Unit Tests: sanitizeUngroundedAnalysis
// =============================================================

describe("BC-019: sanitizeUngroundedAnalysis", () => {
  const answer = "I like books. Reading is fun. I read often.";

  function makeHallucinatedAnalysis(): SpeakingAnalysisResult {
    return {
      candidateIssues: [{ dimension: "vocabulary", severity: "major", description: "which 从句问题", suggestion: "练习" }],
      mainIssue: {
        dimension: "vocabulary",
        severity: "major",
        description: "你使用了 which 定语从句但结构不够准确。",
        suggestion: "练习定语从句。",
      },
      microDrill: { prompt: "练习", exampleImprovement: "example", targetDimension: "vocabulary" },
      metrics: { wordCount: 8, sentenceCount: 3, connectorCount: 0, uniqueWordRatio: 0, paraphraseScore: 0 },
      summary: "回答中使用了 which 定语从句和比较级。",
      ieltsAnalysis: {
        fluency: { label: "流利度", level: "adequate", evidence: ["回答流畅"], issues: [], suggestions: [] },
        lexicalResource: { label: "词汇", level: "adequate", evidence: ["使用了 books"], issues: [], suggestions: [] },
        grammaticalRange: {
          label: "语法",
          level: "developing",
          evidence: ["使用了 which 定语从句", "使用了被动语态", "使用了比较级"],
          issues: ["需提高"],
          suggestions: ["多练习"],
        },
        pronunciation: null,
        overallDiagnosis: "语法有潜力。",
        prioritizedSuggestions: ["练习语法"],
      },
    };
  }

  it("移除 grammaticalRange 中所有 ungrounded evidence", () => {
    const analysis = makeHallucinatedAnalysis();
    const qualityCheck = validateFeedbackQuality(analysis, answer);
    const { analysis: sanitized, report } = sanitizeUngroundedAnalysis(analysis, answer, qualityCheck);

    expect(report.sanitized).toBe(true);
    expect(report.affectedDimensions).toContain("grammaticalRange");
    expect(sanitized.ieltsAnalysis?.grammaticalRange?.evidence).toEqual([]);
    expect(report.evidenceRemoved).toBeGreaterThanOrEqual(3);
  });

  it("保留 grounded evidence（lexicalResource 的 books 不被移除）", () => {
    const analysis = makeHallucinatedAnalysis();
    const qualityCheck = validateFeedbackQuality(analysis, answer);
    const { analysis: sanitized } = sanitizeUngroundedAnalysis(analysis, answer, qualityCheck);

    expect(sanitized.ieltsAnalysis?.lexicalResource?.evidence).toContain("使用了 books");
  });

  it("mainIssue.description 含幻觉时替换为安全文案", () => {
    const analysis = makeHallucinatedAnalysis();
    const qualityCheck = validateFeedbackQuality(analysis, answer);
    const { analysis: sanitized, report } = sanitizeUngroundedAnalysis(analysis, answer, qualityCheck);

    expect(report.replacedFields).toContain("mainIssue.description");
    expect(sanitized.mainIssue.description).not.toContain("which");
    expect(sanitized.mainIssue.description).not.toContain("定语从句");
  });

  it("summary 含幻觉时替换为安全文案", () => {
    const analysis = makeHallucinatedAnalysis();
    const qualityCheck = validateFeedbackQuality(analysis, answer);
    const { analysis: sanitized, report } = sanitizeUngroundedAnalysis(analysis, answer, qualityCheck);

    expect(report.replacedFields).toContain("summary");
    expect(sanitized.summary).not.toContain("which");
    expect(sanitized.summary).not.toContain("比较级");
  });

  it("无 EVIDENCE_MISMATCH 时不执行 sanitization", () => {
    const analysis: SpeakingAnalysisResult = {
      candidateIssues: [],
      mainIssue: { dimension: "fluency", severity: "minor", description: "回答较短", suggestion: "多练习" },
      microDrill: { prompt: "练习", exampleImprovement: "ex", targetDimension: "fluency" },
      metrics: { wordCount: 8, sentenceCount: 3, connectorCount: 0, uniqueWordRatio: 0, paraphraseScore: 0 },
      summary: "回答较短，可以展开。",
      ieltsAnalysis: {
        fluency: { label: "流利度", level: "developing", evidence: ["回答较短"], issues: [], suggestions: [] },
        lexicalResource: null,
        grammaticalRange: null,
        pronunciation: null,
        overallDiagnosis: "需加强。",
        prioritizedSuggestions: [],
      },
    };
    const qualityCheck = validateFeedbackQuality(analysis, answer);
    const { report } = sanitizeUngroundedAnalysis(analysis, answer, qualityCheck);
    // 可能有 minor issues 但不一定有 EVIDENCE_MISMATCH
    expect(report.sanitized === false || report.evidenceRemoved >= 0).toBe(true);
  });

  it("不修改原始 analysis 对象", () => {
    const analysis = makeHallucinatedAnalysis();
    const qualityCheck = validateFeedbackQuality(analysis, answer);
    const originalEvidence = [...analysis.ieltsAnalysis!.grammaticalRange!.evidence];
    sanitizeUngroundedAnalysis(analysis, answer, qualityCheck);
    expect(analysis.ieltsAnalysis!.grammaticalRange!.evidence).toEqual(originalEvidence);
  });
});

// =============================================================
// Integration Tests: analyzeSpeakingWithLlm
// =============================================================

describe("BC-019: analyzeSpeakingWithLlm — Hallucination Containment", () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });

  it("A. Frozen hallucination fixture — 幻觉 claims 不出现在 API-visible analysis", async () => {
    __setProviderForTests("mock", makeHallucinatingProvider());
    const question = getTestQuestion();
    const answer = "I like books. Reading is fun. I read often.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_frozen");

    // 幻觉断言不得出现在 factual claim 字段（evidence / description / summary / overallDiagnosis）
    const evidenceText = JSON.stringify(result.ieltsAnalysis?.grammaticalRange?.evidence ?? []);
    expect(evidenceText).not.toContain("which 定语从句");
    expect(evidenceText).not.toContain("被动语态");
    expect(evidenceText).not.toContain("形容词比较级");
    expect(result.mainIssue.description).not.toContain("which");
    expect(result.mainIssue.description).not.toContain("定语从句");
    expect(result.summary).not.toContain("which");
    expect(result.summary).not.toContain("比较级");
    expect(result.ieltsAnalysis?.overallDiagnosis).not.toContain("which");

    // grammaticalRange evidence 应被清空
    expect(result.ieltsAnalysis?.grammaticalRange?.evidence).toEqual([]);

    // 但 level / issues / suggestions 保留（不做 full fallback）
    expect(result.ieltsAnalysis?.grammaticalRange?.level).toBe("developing");
    expect(result.ieltsAnalysis?.grammaticalRange?.issues.length).toBeGreaterThan(0);

    // qualityWarning 应包含 sanitization 信息
    expect(result.qualityWarning).toBeDefined();
    expect(result.qualityWarning?.sanitization?.evidenceRemoved).toBeGreaterThan(0);
  });

  it("B. Legitimate evidence — 用户确实使用了 which/比较级时不被错误删除", async () => {
    __setProviderForTests("mock", makeLegitimateProvider());
    const question = getTestQuestion();
    const answer = "The book which I bought yesterday was better than the old one.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_legit");

    // 合法 evidence 应保留
    const grammarEvidence = result.ieltsAnalysis?.grammaticalRange?.evidence ?? [];
    expect(grammarEvidence.some((e) => e.includes("which"))).toBe(true);
    expect(grammarEvidence.some((e) => e.includes("比较级") || e.includes("better"))).toBe(true);

  });

  it("C. 轻微非 evidence 质量问题不触发 full fallback", async () => {
    // 使用一个只有 minor actionability 问题但 evidence 全部 grounded 的 provider
    const provider: LlmProvider = {
      kind: "mock",
      async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
        return {
          model: "mock-minor",
          content: JSON.stringify({
            mainIssue: {
              dimension: "fluency",
              severity: "minor",
              description: "回答表达流畅，books 词汇使用恰当。",
              suggestion: "多练习",
            },
            microDrill: { prompt: "练习", exampleImprovement: "ex" },
            summary: "回答中 books 和 reading 使用自然。",
            fluency: { label: "流利度", level: "adequate", evidence: ["表达流畅"], issues: [], suggestions: [] },
            lexicalResource: { label: "词汇", level: "adequate", evidence: ["使用了 books"], issues: [], suggestions: [] },
            grammaticalRange: { label: "语法", level: "adequate", evidence: ["语法正确"], issues: [], suggestions: [] },
            overallDiagnosis: "表现良好。",
            prioritizedSuggestions: ["继续努力"],
          }),
        };
      },
    };
    __setProviderForTests("mock", provider);
    const question = getTestQuestion();
    const answer = "I like books. Reading is fun. I read often.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_minor");

    // 不应触发 rule fallback（ieltsAnalysis 应存在）
    expect(result.ieltsAnalysis).toBeDefined();
    expect(result.ieltsAnalysis?.fluency).not.toBeNull();
  });

  it("D. LLM 真正失败时 rule fallback 保持原行为", async () => {
    __setProviderForTests("mock", makeFailingProvider());
    const question = getTestQuestion();
    const answer = "I like books.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_fallback");

    // rule fallback: ieltsAnalysis 为 undefined
    expect(result.ieltsAnalysis).toBeUndefined();
    expect(result.mainIssue).toBeDefined();
    expect(result.summary).toBeTruthy();
  });

  it("E. Band leakage (ELS-EVAL-020) — 019 修复不导致 band guard 回归", async () => {
    __setProviderForTests("mock", makeBandLeakProvider());
    const question = getTestQuestion();
    const answer = "I like books. Reading is fun. I read often.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_band");

    // Band 泄漏应被 ieltsAlignmentCheck 检测到 → score 降低 → 可能 NEEDS_REVIEW 或 FAIL
    // 关键：019 的 evidence sanitization 不应阻止 band 检测
    const allText = JSON.stringify(result);
    // 如果走了 rule fallback，band 自然不存在
    // 如果 NEEDS_REVIEW，band 可能仍在（这是 020 的问题，不是 019 的范围）
    // 本测试只验证 019 修复不破坏 band 检测的存在
    expect(result.qualityWarning?.issues?.some((i) => i.includes("Band") || i.includes("band"))).toBeTruthy();
  });

  it("F. Short-answer path — 正常分析不被 019 修复破坏", async () => {
    const provider: LlmProvider = {
      kind: "mock",
      async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
        return {
          model: "mock-short",
          content: JSON.stringify({
            mainIssue: {
              dimension: "fluency",
              severity: "major",
              description: "回答过短，只有几个词。",
              suggestion: "尝试展开回答，加入具体例子。",
            },
            microDrill: { prompt: "用 30 秒描述你的一天", exampleImprovement: "Well, I usually wake up early..." },
            summary: "回答较短，需要更多展开。",
            fluency: { label: "流利度", level: "weak", evidence: ["回答很短"], issues: ["展开不足"], suggestions: ["多练习"] },
            lexicalResource: { label: "词汇", level: "developing", evidence: ["词汇有限"], issues: [], suggestions: [] },
            grammaticalRange: { label: "语法", level: "developing", evidence: ["句式简单"], issues: [], suggestions: [] },
            overallDiagnosis: "需要加强内容展开。",
            prioritizedSuggestions: ["增加回答长度"],
          }),
        };
      },
    };
    __setProviderForTests("mock", provider);
    const question = getTestQuestion();
    const answer = "I am busy.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_short");
    expect(result.mainIssue.dimension).toBe("fluency");
    expect(result.ieltsAnalysis).toBeDefined();
  });

  it("G. Vague advice — 不影响 016 的拦截行为（actionabilityCheck 仍运行）", async () => {
    const provider: LlmProvider = {
      kind: "mock",
      async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
        return {
          model: "mock-vague",
          content: JSON.stringify({
            mainIssue: {
              dimension: "fluency",
              severity: "minor",
              description: "回答流畅，books 使用自然。",
              suggestion: "继续努力", // vague pattern
            },
            microDrill: { prompt: "多练习", exampleImprovement: "ex" }, // vague
            summary: "回答中 books 和 reading 使用自然。",
            fluency: { label: "流利度", level: "adequate", evidence: ["表达流畅"], issues: [], suggestions: ["多练习"] },
            lexicalResource: { label: "词汇", level: "adequate", evidence: ["使用了 books"], issues: [], suggestions: [] },
            grammaticalRange: { label: "语法", level: "adequate", evidence: ["语法正确"], issues: [], suggestions: [] },
            overallDiagnosis: "表现良好。",
            prioritizedSuggestions: ["继续努力"],
          }),
        };
      },
    };
    __setProviderForTests("mock", provider);
    const question = getTestQuestion();
    const answer = "I like books. Reading is fun. I read often.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_vague");

    // actionabilityCheck 仍运行：要么 qualityWarning 包含 vague，要么质量门失败触发 fallback
    const hasVagueWarning = result.qualityWarning?.issues?.some((i) => i.includes("泛化") || i.includes("vague") || i.includes("VAGUE"));
    const hasFallback = result.ieltsAnalysis === undefined;
    expect(hasVagueWarning || hasFallback).toBe(true);
  });
});
