/**
 * Evidence Sanitizer
 * -------------------------------------------------------
 * 在 Quality Gate 检测到 EVIDENCE_MISMATCH 后，
 * 从 API-visible analysis 中移除未在用户回答中获得支持的具体断言。
 *
 * 设计原则：
 * - 纯确定性规则，不调用 LLM
 * - 复用 evidenceConsistencyCheck 的 grounding heuristic（不新造 detector）
 * - 只移除 ungrounded 的具体 factual claims，保留 level / issues / suggestions
 * - 不修改原始 analysis（返回新对象）
 * - 生成 sanitizationReport 供 Trace 记录
 *
 * Product Decision (BC-M3-004 / ELS-EVAL-019):
 *   Option B — sanitize unsupported evidence, preserve rest of analysis.
 *   不采用 full fallback（Option A），因为仅 evidence 不可信时 level/issues/suggestions 仍可能有价值。
 *   不采用 repair/regenerate（Option C），因为增加延迟且可能再次幻觉。
 *   不采用 warn-only（Option D），已被 ELS-EVAL-019 证明不可接受。
 */

import type { SpeakingAnalysisResult, IeltsSpeakingAnalysis } from "@/lib/speaking/types";
import type { FeedbackQualityResult } from "@/lib/speaking/feedback-quality-types";

// =============================================================
// Grounding Check（复用 evidenceConsistencyCheck 的 heuristic）
// =============================================================

/**
 * 判断单条 evidence 是否在用户回答中有 grounding。
 * 复用 feedback-quality.ts evidenceConsistencyCheck 的逻辑：
 * - 数据型 evidence（WPM / 秒 / 次 / %）视为 grounded（来自 audioMetadata）
 * - 否则要求 evidence 中至少一个 >3 字母的英文词出现在回答中
 */
export function isEvidenceGrounded(evidence: string, userAnswer: string): boolean {
  const evLower = evidence.toLowerCase();
  const answerLower = userAnswer.toLowerCase();
  // 去除词尾标点（books. → books），避免标点导致匹配失败
  const answerWords = new Set(
    answerLower.split(/\s+/).map((w) => w.replace(/[.,!?;:，。！？；：]+$/, "")).filter((w) => w.length > 2),
  );

  // 数据型 evidence（来自 audioMetadata，不需要文本匹配）
  if (/\d+\s*(wpm|秒|次|%)/i.test(evLower)) {
    return true;
  }

  // 关键词匹配：evidence 中至少一个 >3 字母的英文词在回答中出现
  const evWords = evLower.split(/[\s，。、！？,.!?;:：；""''（）()]+/).filter((w) => w.length > 3);
  return evWords.some((w) => answerWords.has(w));
}

// =============================================================
// Linguistic Claim Detection（用于 free-text 字段）
// =============================================================

/**
 * 检测文本中是否包含指向具体语言结构的断言，
 * 且该结构在用户回答中不存在。
 *
 * 这是保守的 pattern-based 检查，仅覆盖 ELS-EVAL-019 冻结的高风险模式：
 * - which/that 定语从句
 * - 被动语态
 * - 形容词/副词比较级
 * - 复合句/从句
 * - 具体时态
 *
 * 不做通用 NLP parsing（任务限制：不新造大型 detector）。
 */
const LINGUISTIC_CLAIM_PATTERNS: Array<{ pattern: RegExp; label: string; answerCheck: (answer: string) => boolean }> = [
  {
    pattern: /which|定语从句|relative\s*clause/i,
    label: "which/that 定语从句",
    answerCheck: (a) => /\bwhich\b/i.test(a),
  },
  {
    pattern: /被动|passive\s*voice/i,
    label: "被动语态",
    answerCheck: (a) => /\b(am|is|are|was|were|be|been|being)\s+\w+ed\b/i.test(a),
  },
  {
    pattern: /比较级|comparative|more\s+\w+\s+than|\bbetter\b|\bworse\b/i,
    label: "比较级",
    answerCheck: (a) => /more\s+\w+\s+than|\bbetter\b|\bworse\b|\b\w+er\s+than\b/i.test(a),
  },
  {
    pattern: /复合句|complex\s*sentence|从句|subordinate/i,
    label: "复合句/从句",
    answerCheck: (a) => /\b(which|that|who|whom|whose|where|when|because|although|if|unless|while|since)\b/i.test(a),
  },
  {
    pattern: /现在完成时|present\s*perfect|过去完成时|past\s*perfect|进行时|continuous/i,
    label: "具体时态",
    answerCheck: (a) => /\b(have|has)\s+\w+ed\b|\bhad\s+\w+ed\b|\b(am|is|are|was|were)\s+\w+ing\b/i.test(a),
  },
];

export interface UngroundedClaim {
  label: string;
  matchedText: string;
}

/**
 * 检测文本中包含的、在用户回答中无支持的语言结构断言。
 */
export function detectUngroundedLinguisticClaims(text: string, userAnswer: string): UngroundedClaim[] {
  const claims: UngroundedClaim[] = [];
  for (const { pattern, label, answerCheck } of LINGUISTIC_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match && !answerCheck(userAnswer)) {
      claims.push({ label, matchedText: match[0] });
    }
  }
  return claims;
}

// =============================================================
// Sanitization Report
// =============================================================

export interface SanitizationReport {
  /** 是否执行了 sanitization */
  sanitized: boolean;
  /** 被移除的 evidence 总数 */
  evidenceRemoved: number;
  /** 受影响的维度 */
  affectedDimensions: string[];
  /** 被替换的 free-text 字段 */
  replacedFields: string[];
  /** 检测到的 ungrounded linguistic claims */
  ungroundedClaims: UngroundedClaim[];
  /** 安全替换文案说明 */
  safeReplacements: Record<string, string>;
}

// =============================================================
// Main Sanitizer
// =============================================================

/**
 * 对 analysis 执行 evidence sanitization。
 *
 * 仅在 qualityCheck 检测到 EVIDENCE_MISMATCH 相关 issue 时执行。
 * 返回 sanitized 后的 analysis（新对象，不修改原对象）和 report。
 */
export function sanitizeUngroundedAnalysis(
  analysis: SpeakingAnalysisResult,
  userAnswer: string,
  qualityCheck: FeedbackQualityResult,
): { analysis: SpeakingAnalysisResult; report: SanitizationReport } {
  const evidenceMismatchIssues = qualityCheck.issues.filter(
    (i) => i.type === "EVIDENCE_MISMATCH" || i.type === "NO_EVIDENCE",
  );

  if (evidenceMismatchIssues.length === 0) {
    return {
      analysis,
      report: {
        sanitized: false,
        evidenceRemoved: 0,
        affectedDimensions: [],
        replacedFields: [],
        ungroundedClaims: [],
        safeReplacements: {},
      },
    };
  }

  const report: SanitizationReport = {
    sanitized: true,
    evidenceRemoved: 0,
    affectedDimensions: [],
    replacedFields: [],
    ungroundedClaims: [],
    safeReplacements: {},
  };

  // Shallow copy top-level
  const sanitized: SpeakingAnalysisResult = { ...analysis };

  // ---- 1. Sanitize ieltsAnalysis.*.evidence ----
  if (analysis.ieltsAnalysis) {
    const dims: Array<["fluency" | "lexicalResource" | "grammaticalRange", string]> = [
      ["fluency", "fluency"],
      ["lexicalResource", "lexicalResource"],
      ["grammaticalRange", "grammaticalRange"],
    ];

    const newIelts: IeltsSpeakingAnalysis = { ...analysis.ieltsAnalysis };

    for (const [key, dimName] of dims) {
      const dim = newIelts[key];
      if (!dim || dim.evidence.length === 0) continue;

      const groundedEvidence = dim.evidence.filter((ev) => isEvidenceGrounded(ev, userAnswer));
      const removed = dim.evidence.length - groundedEvidence.length;

      if (removed > 0) {
        report.evidenceRemoved += removed;
        report.affectedDimensions.push(dimName);
        newIelts[key] = { ...dim, evidence: groundedEvidence };
      }
    }

    sanitized.ieltsAnalysis = newIelts;
  }

  // ---- 2. Sanitize mainIssue.description ----
  // 不依赖 quality gate 的 EVIDENCE_MISMATCH（其有 descWords.length > 3 的阈值），
  // 直接运行 linguistic claim detection，确保幻觉断言被拦截。
  if (analysis.mainIssue.description) {
    const claims = detectUngroundedLinguisticClaims(analysis.mainIssue.description, userAnswer);
    if (claims.length > 0) {
      report.ungroundedClaims.push(...claims);
      const safeDesc = buildSafeMainIssueDescription(analysis, userAnswer);
      sanitized.mainIssue = { ...analysis.mainIssue, description: safeDesc };
      report.replacedFields.push("mainIssue.description");
      report.safeReplacements["mainIssue.description"] = safeDesc;
    }
  }

  // ---- 2b. Sanitize candidateIssues descriptions ----
  if (analysis.candidateIssues.length > 0) {
    const sanitizedCandidates = analysis.candidateIssues.map((issue) => {
      const claims = detectUngroundedLinguisticClaims(issue.description, userAnswer);
      if (claims.length > 0) {
        report.ungroundedClaims.push(...claims);
        if (!report.replacedFields.includes("candidateIssues.description")) {
          report.replacedFields.push("candidateIssues.description");
        }
        return { ...issue, description: buildSafeMainIssueDescription(analysis, userAnswer) };
      }
      return issue;
    });
    sanitized.candidateIssues = sanitizedCandidates;
  }

  // ---- 3. Sanitize summary ----
  if (analysis.summary) {
    const claims = detectUngroundedLinguisticClaims(analysis.summary, userAnswer);
    if (claims.length > 0) {
      report.ungroundedClaims.push(...claims);
      const safeSummary = buildSafeSummary(analysis, userAnswer);
      sanitized.summary = safeSummary;
      report.replacedFields.push("summary");
      report.safeReplacements["summary"] = safeSummary;
    }
  }

  // ---- 3b. Sanitize overallDiagnosis ----
  if (analysis.ieltsAnalysis?.overallDiagnosis) {
    const claims = detectUngroundedLinguisticClaims(analysis.ieltsAnalysis.overallDiagnosis, userAnswer);
    if (claims.length > 0) {
      report.ungroundedClaims.push(...claims);
      const safeDiagnosis = "回答的语法结构可以进一步丰富，建议练习多样化的句式表达。";
      if (sanitized.ieltsAnalysis) {
        sanitized.ieltsAnalysis = { ...sanitized.ieltsAnalysis, overallDiagnosis: safeDiagnosis };
      }
      report.replacedFields.push("ieltsAnalysis.overallDiagnosis");
      report.safeReplacements["ieltsAnalysis.overallDiagnosis"] = safeDiagnosis;
    }
  }

  // ---- 4. Attach sanitization info to qualityWarning ----
  sanitized.qualityWarning = {
    score: qualityCheck.score,
    issues: qualityCheck.issues.map((i) => i.description),
    ...(report.sanitized
      ? {
          sanitization: {
            evidenceRemoved: report.evidenceRemoved,
            affectedDimensions: report.affectedDimensions,
            replacedFields: report.replacedFields,
          },
        }
      : {}),
  };

  return { analysis: sanitized, report };
}

// =============================================================
// Safe Replacement Builders
// =============================================================

/**
 * 基于确定性输入事实构建安全的 mainIssue.description。
 * 不包含任何无法从用户回答中验证的语言结构断言。
 */
function buildSafeMainIssueDescription(analysis: SpeakingAnalysisResult, userAnswer: string): string {
  const wordCount = analysis.metrics?.wordCount ?? userAnswer.trim().split(/\s+/).filter(Boolean).length;
  const sentenceCount = analysis.metrics?.sentenceCount ?? userAnswer.split(/[.!?]+/).filter((s) => s.trim()).length;

  if (wordCount < 30) {
    return `回答较短（约 ${wordCount} 词，${sentenceCount} 句），内容展开不够充分，建议增加具体原因和例子来支撑观点。`;
  }
  if (sentenceCount <= 2) {
    return `回答句式较单一（${sentenceCount} 句），可以尝试使用不同的句子结构让表达更丰富。`;
  }
  return `回答内容可以进一步展开，建议补充具体例子和细节来增强说服力。`;
}

/**
 * 基于确定性输入事实构建安全的 summary。
 */
function buildSafeSummary(analysis: SpeakingAnalysisResult, userAnswer: string): string {
  const wordCount = analysis.metrics?.wordCount ?? userAnswer.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 30) {
    return "回答较短，内容展开有提升空间。建议在表达观点后补充具体原因和例子，同时注意句式多样性。";
  }
  return "回答基本切题，可以进一步丰富内容细节和句式变化，提升表达的丰富度。";
}
