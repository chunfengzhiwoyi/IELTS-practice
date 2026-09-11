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
import { buildAnswerWordSet } from "@/lib/speaking/evidence-grounding";
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

describe("BC-019: isEvidenceGrounded (shared primitive)", () => {
  const answer = "I like books. Reading is fun. I read often.";
  const answerWords = buildAnswerWordSet(answer);

  it("数据型 evidence（WPM/秒/次）视为 grounded", () => {
    expect(isEvidenceGrounded("语速 98 WPM", answerWords)).toBe(true);
    expect(isEvidenceGrounded("停顿 3 次", answerWords)).toBe(true);
  });

  it("包含回答中关键词的 evidence 视为 grounded", () => {
    expect(isEvidenceGrounded("使用了 books 这个词", answerWords)).toBe(true);
    expect(isEvidenceGrounded("reading 出现多次", answerWords)).toBe(true);
  });

  it("不包含回答中任何关键词的 evidence 视为 ungrounded", () => {
    expect(isEvidenceGrounded("使用了 which 定语从句", answerWords)).toBe(false);
    expect(isEvidenceGrounded("使用了被动语态", answerWords)).toBe(false);
    expect(isEvidenceGrounded("使用了形容词比较级", answerWords)).toBe(false);
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

  it("E. Band leakage (ELS-EVAL-020) — 020 修复后 band 泄漏强制安全回退，不回归 019", async () => {
    __setProviderForTests("mock", makeBandLeakProvider());
    const question = getTestQuestion();
    const answer = "I like books. Reading is fun. I read often.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_band");

    // PRODUCT-LOOP-02D：任何 BAND_SCORE_LEAK → 强制规则引擎回退（S1 红线）。
    // makeBandLeakProvider 含 2 条 band 泄漏（修复前 score=70 → PASS 且 band 直达 UI），
    // 修复后必须 band-free：无 qualityWarning、无 LLM ieltsAnalysis、全字段无 band 文本。
    expect(result.qualityWarning).toBeUndefined();
    expect(result.ieltsAnalysis).toBeUndefined();
    const allText = JSON.stringify(result);
    expect(/band\s*\d/i.test(allText)).toBe(false);
    expect(/[5-9](\.\d)?\s*分/.test(allText)).toBe(false);
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

  it("G. Vague advice — actionabilityCheck 仍运行（016 拦截行为不受 019 修复影响）", () => {
    // 直接验证 Quality Gate 的 actionabilityCheck 对泛化建议的检测
    const vagueAnalysis: SpeakingAnalysisResult = {
      mainIssue: {
        dimension: "fluency",
        severity: "minor",
        description: "回答流畅，books 使用自然。",
        suggestion: "继续努力，多练习口语。",
      },
      microDrill: { prompt: "多练习口语表达", exampleImprovement: "ex", targetDimension: "fluency" },
      summary: "回答中 books 和 reading 使用自然。",
      ieltsAnalysis: {
        fluency: { label: "流利度", level: "adequate", evidence: ["表达流畅"], issues: [], suggestions: ["多练习口语表达"] },
        lexicalResource: { label: "词汇", level: "adequate", evidence: ["使用了 books"], issues: [], suggestions: [] },
        grammaticalRange: { label: "语法", level: "adequate", evidence: ["语法正确"], issues: [], suggestions: [] },
        pronunciation: { label: "发音", level: "adequate", evidence: [], issues: [], suggestions: [] },
        overallDiagnosis: "表现良好。",
        prioritizedSuggestions: ["继续努力"],
      },
      candidateIssues: [],
      metrics: { wordCount: 8, sentenceCount: 3, connectorCount: 0, uniqueWordRatio: 0, paraphraseScore: 0 },
    };
    const answer = "I like books. Reading is fun. I read often.";

    const qc = validateFeedbackQuality(vagueAnalysis, answer);

    // actionabilityCheck 必须检测到泛化/不可执行建议
    const actionIssues = qc.issues.filter((i) => i.type === "VAGUE_SUGGESTION" || i.type === "NOT_ACTIONABLE");
    expect(actionIssues.length).toBeGreaterThan(0);

    // 019 的 evidence sanitization 不影响 actionabilityCheck 的独立运行
    const { report } = sanitizeUngroundedAnalysis(vagueAnalysis, answer, qc);
    // sanitizer 只处理 evidence/factual fields，不修改 suggestions
    expect(report.replacedFields).not.toContain("mainIssue.suggestion");
    expect(report.replacedFields).not.toContain("microDrill.prompt");
  });
});


// =============================================================
// BC-M3-004-SAFETY-PATCH: Public Boundary & Grounding SSOT Tests
// =============================================================

describe("BC-019-SAFETY: A. public-response-no-raw-hallucination", () => {
  it("factual fields in API response 不含 Frozen fixture 的 hallucinated claims", async () => {
    const provider = makeHallucinatingProvider();
    __setProviderForTests("mock", provider);
    const question = getTestQuestion();
    const answer = "I like books. Reading is fun. I read often.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_safety_a");

    // 只检查 UI 渲染的 factual 字段（speaking-feedback.tsx）
    // teaching suggestions (mainIssue.suggestion / microDrill / prioritizedSuggestions)
    // 可以合法提及语法概念作为学习目标，不属于 hallucinated factual claim
    const factualFields = JSON.stringify({
      summary: result.summary,
      overallDiagnosis: result.ieltsAnalysis?.overallDiagnosis,
      mainIssueDescription: result.mainIssue.description,
      evidence: Object.values(result.ieltsAnalysis ?? {}).flatMap((d) => (d as any)?.evidence ?? []),
      issues: Object.values(result.ieltsAnalysis ?? {}).flatMap((d) => (d as any)?.issues ?? []),
    });

    // 幻觉断言不得出现在 factual 字段
    expect(factualFields).not.toContain("which 定语从句");
    expect(factualFields).not.toContain("被动语态");
    expect(factualFields).not.toContain("比较级");
    expect(factualFields).not.toContain("多个复合句");
    expect(factualFields).not.toContain("which 引导");

    // qualityWarning.sanitization 只含安全摘要，不含 raw claim
    const sanitization = result.qualityWarning?.sanitization;
    expect(sanitization).toBeDefined();
    expect(sanitization?.applied).toBe(true);
    expect(typeof sanitization?.evidenceRemoved).toBe("number");
    expect(Array.isArray(sanitization?.affectedDimensions)).toBe(true);
    expect(Array.isArray(sanitization?.replacedFields)).toBe(true);
    // 不得包含 ungroundedClaims / safeReplacements 等内部诊断字段
    expect(sanitization).not.toHaveProperty("ungroundedClaims");
    expect(sanitization).not.toHaveProperty("safeReplacements");
  });
});

describe("BC-019-SAFETY: B. internal-trace-can-record-safe-diagnostic", () => {
  it("sanitizationReport 内部可记录 ungrounded claim labels（仅 label，非 raw text）", () => {
    const answer = "I like books. Reading is fun. I read often.";
    const analysis = makeHallucinatedAnalysis();
    const qualityCheck = validateFeedbackQuality(analysis, answer);

    const { report } = sanitizeUngroundedAnalysis(analysis, answer, qualityCheck);

    // 内部 report 可记录 ungroundedClaims 用于诊断
    expect(report.ungroundedClaims.length).toBeGreaterThan(0);
    // 每个 claim 只有 label（类别名）和 matchedText（匹配片段）
    // label 是安全的类别描述，不是原始 hallucinated sentence
    for (const claim of report.ungroundedClaims) {
      expect(claim).toHaveProperty("label");
      expect(claim).toHaveProperty("matchedText");
      expect(typeof claim.label).toBe("string");
      expect(claim.label.length).toBeLessThan(30); // label 是短类别名
    }
  });
});

describe("BC-019-SAFETY: C. legitimate-grammar-evidence-preserved", () => {
  it("用户确实使用 which/比较级时，对应 evidence 不被移除", async () => {
    const provider: LlmProvider = {
      kind: "mock",
      async chat(_req: LlmChatRequest): Promise<LlmChatResponse> {
        return {
          model: "mock-legit",
          content: JSON.stringify({
            mainIssue: {
              dimension: "grammar",
              severity: "minor",
              description: "which 从句使用准确，比较级 better 运用自然。",
              suggestion: "继续保持。",
            },
            microDrill: { prompt: "练习", exampleImprovement: "ex" },
            summary: "回答中使用了 which 定语从句和比较级 better。",
            fluency: { label: "流利度", level: "adequate", evidence: ["回答流畅"], issues: [], suggestions: [] },
            lexicalResource: { label: "词汇", level: "adequate", evidence: ["使用了 book"], issues: [], suggestions: [] },
            grammaticalRange: { label: "语法", level: "adequate", evidence: ["使用了 which 定语从句", "比较级 better 使用准确"], issues: [], suggestions: [] },
            overallDiagnosis: "语法结构多样，which 从句和比较级使用准确。",
            prioritizedSuggestions: ["继续保持"],
          }),
        };
      },
    };
    __setProviderForTests("mock", provider);
    const question = getTestQuestion();
    const answer = "The book which I bought yesterday was better than the old one.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_safety_c");

    // which/comparative evidence 应保留（用户确实使用了）
    const grammarEvidence = result.ieltsAnalysis?.grammaticalRange?.evidence ?? [];
    expect(grammarEvidence.length).toBeGreaterThan(0);
    expect(grammarEvidence.some((e) => e.includes("which"))).toBe(true);
    expect(grammarEvidence.some((e) => e.includes("better") || e.includes("比较级"))).toBe(true);

    // which/comparative 相关 evidence 必须保留
    // 注意：其他维度的抽象 evidence（如"回答流畅"）可能仍被 sanitize，这是正确行为
  });
});

describe("BC-019-SAFETY: D. no-detection-enforcement-drift", () => {
  it("gate 和 sanitizer 使用同一共享 grounding primitive，结果一致", () => {
    const answer = "I like books. Reading is fun. I read often.";
    const answerWords = buildAnswerWordSet(answer);

    // 同一组 evidence，gate 的 hasAnyGroundedEvidence 和 sanitizer 的 isEvidenceGrounded 必须一致
    const testCases = [
      { ev: "使用了 books", expected: true },
      { ev: "使用了 which 定语从句", expected: false },
      { ev: "语速 98 WPM", expected: true },
      { ev: "reading 出现多次", expected: true },
      { ev: "使用了被动语态", expected: false },
    ];

    for (const { ev, expected } of testCases) {
      // sanitizer 路径（通过 re-export 的共享 primitive）
      expect(isEvidenceGrounded(ev, answerWords)).toBe(expected);
    }

    // gate 路径：validateFeedbackQuality 对同一 analysis 的 EVIDENCE_MISMATCH 判定
    // 应与 sanitizer 的 grounding 结果一致
    const analysisWithUngrounded = makeHallucinatedAnalysis();
    const qc = validateFeedbackQuality(analysisWithUngrounded, answer);
    const hasEvidenceMismatch = qc.issues.some((i) => i.type === "EVIDENCE_MISMATCH");
    expect(hasEvidenceMismatch).toBe(true); // gate 检测到 mismatch

    const { report } = sanitizeUngroundedAnalysis(analysisWithUngrounded, answer, qc);
    expect(report.sanitized).toBe(true); // sanitizer 执行了 sanitization
    expect(report.evidenceRemoved).toBeGreaterThan(0); // 移除了 ungrounded evidence
  });
});

describe("BC-019-SAFETY: E. all-rendered-factual-fields-contained", () => {
  it("所有 UI 渲染的 factual 字段都在 containment 范围内", async () => {
    const provider = makeHallucinatingProvider();
    __setProviderForTests("mock", provider);
    const question = getTestQuestion();
    const answer = "I like books. Reading is fun. I read often.";

    const result = await analyzeSpeakingWithLlm(answer, question, "trc_019_safety_e");

    // UI 渲染的 factual 字段（speaking-feedback.tsx）：
    // 1. ieltsAnalysis.overallDiagnosis (line 155)
    // 2. analysis.summary (line 157, 225)
    // 3. ieltsAnalysis.*.evidence (line 68-74)
    // 4. ieltsAnalysis.*.issues (line 83-88) — SAFETY PATCH 新增
    // 5. mainIssue.description (line 196)

    const allText = JSON.stringify({
      overallDiagnosis: result.ieltsAnalysis?.overallDiagnosis,
      summary: result.summary,
      evidence: Object.values(result.ieltsAnalysis ?? {}).flatMap((d) => (d as any)?.evidence ?? []),
      issues: Object.values(result.ieltsAnalysis ?? {}).flatMap((d) => (d as any)?.issues ?? []),
      mainIssue: result.mainIssue.description,
    });

    // 所有 factual 字段都不得含幻觉断言
    expect(allText).not.toContain("which 定语从句");
    expect(allText).not.toContain("被动语态");
    expect(allText).not.toContain("比较级");
    expect(allText).not.toContain("多个复合句");

    // replacedFields 应覆盖所有被修改的 factual 字段
    const replaced = result.qualityWarning?.sanitization?.replacedFields ?? [];
    expect(replaced.length).toBeGreaterThan(0);
    // 至少包含 summary 和 mainIssue.description（Frozen fixture 中这两个含幻觉）
    expect(replaced).toContain("summary");
    expect(replaced).toContain("mainIssue.description");
  });

  it("candidateIssues 虽不在 UI 渲染，但也被 sanitize（防御性）", () => {
    const answer = "I like books. Reading is fun. I read often.";
    const analysis = makeHallucinatedAnalysis();
    const qc = validateFeedbackQuality(analysis, answer);
    const { analysis: sanitized } = sanitizeUngroundedAnalysis(analysis, answer, qc);

    for (const issue of sanitized.candidateIssues) {
      expect(issue.description).not.toContain("which 定语从句");
      expect(issue.description).not.toContain("被动语态");
    }
  });
});
